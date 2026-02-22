import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
  getDocs,
  query,
  where,
  runTransaction,
} from 'firebase/firestore';
import type { HarvestCollectionStatus } from '@/types';
import {
  addWalletCredit,
  addWalletDebit,
  getWalletSummaryOnce,
} from '@/services/projectWalletService';

const COLLECTIONS = 'harvestCollections';
const PICKERS = 'harvestPickers';
const WEIGH_ENTRIES = 'pickerWeighEntries';
const PAYMENT_BATCHES = 'harvestPaymentBatches';

/** Create a new day collection session */
export async function createHarvestCollection(params: {
  companyId: string;
  projectId: string;
  cropType: string;
  name: string;
  harvestDate: Date;
  pricePerKgPicker: number;
}): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS), {
    companyId: params.companyId,
    projectId: params.projectId,
    cropType: params.cropType,
    name: params.name,
    harvestDate: params.harvestDate,
    pricePerKgPicker: params.pricePerKgPicker,
    totalHarvestKg: 0,
    totalPickerCost: 0,
    status: 'collecting',
    createdAt: serverTimestamp(),
    createdAtLocal: Date.now(),
    dateLocalISO: new Date().toISOString(),
  });
  return ref.id;
}

/** Add a picker to a collection */
export async function addHarvestPicker(params: {
  companyId: string;
  collectionId: string;
  pickerNumber: number;
  pickerName: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, PICKERS), {
    companyId: params.companyId,
    collectionId: params.collectionId,
    pickerNumber: params.pickerNumber,
    pickerName: params.pickerName,
    totalKg: 0,
    totalPay: 0,
    isPaid: false,
  });
  return ref.id;
}

/** Record a weigh entry and update picker totals + collection totals */
export async function addPickerWeighEntry(params: {
  companyId: string;
  pickerId: string;
  collectionId: string;
  weightKg: number;
  tripNumber: number;
}): Promise<string> {
  const ref = await addDoc(collection(db, WEIGH_ENTRIES), {
    companyId: params.companyId,
    pickerId: params.pickerId,
    collectionId: params.collectionId,
    weightKg: params.weightKg,
    tripNumber: params.tripNumber,
    recordedAt: serverTimestamp(),
    recordedAtLocal: Date.now(),
    dateLocalISO: new Date().toISOString(),
  });
  return ref.id;
}

/** Get pricePerKgPicker from collection */
async function getPricePerKgPicker(collectionId: string): Promise<number> {
  const colSnap = await getDoc(doc(db, COLLECTIONS, collectionId));
  const data = colSnap.data();
  return data?.pricePerKgPicker ?? 0;
}

async function computeCollectionTotalsFromWeighEntries(
  collectionId: string,
  pricePerKgPicker: number,
): Promise<{ totalHarvestKg: number; totalPickerCost: number }> {
  const entriesSnap = await getDocs(
    query(collection(db, WEIGH_ENTRIES), where('collectionId', '==', collectionId))
  );

  const pickerKgMap = new Map<string, number>();
  let totalHarvestKg = 0;

  entriesSnap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    const pickerId = String(data.pickerId ?? '');
    const kg = Number(data.weightKg ?? 0);
    if (!pickerId || !Number.isFinite(kg) || kg <= 0) return;
    totalHarvestKg += kg;
    pickerKgMap.set(pickerId, (pickerKgMap.get(pickerId) ?? 0) + kg);
  });

  let totalPickerCost = 0;
  pickerKgMap.forEach((kg) => {
    totalPickerCost += Math.round(kg * pricePerKgPicker);
  });

  return { totalHarvestKg, totalPickerCost };
}

/** Recompute collection totalHarvestKg and totalPickerCost from all pickers */
export async function recalcCollectionTotals(collectionId: string): Promise<void> {
  const pricePerKgPicker = await getPricePerKgPicker(collectionId);
  const { totalHarvestKg, totalPickerCost } = await computeCollectionTotalsFromWeighEntries(
    collectionId,
    pricePerKgPicker,
  );

  await updateDoc(doc(db, COLLECTIONS, collectionId), {
    totalHarvestKg,
    totalPickerCost,
  });
}

/** Mark a picker as cash paid */
export async function markPickerCashPaid(pickerId: string): Promise<void> {
  await updateDoc(doc(db, PICKERS, pickerId), {
    isPaid: true,
    paidAt: serverTimestamp(),
  });
}

/** Mark multiple pickers as paid in one group (creates a payment batch for records) */
export async function markPickersPaidInBatch(params: {
  companyId: string;
  collectionId: string;
  pickerIds: string[];
  totalAmount: number;
}): Promise<string> {
  const { companyId, collectionId, pickerIds, totalAmount } = params;
  if (pickerIds.length === 0) throw new Error('No pickers to mark paid');

  const batchRef = await addDoc(collection(db, PAYMENT_BATCHES), {
    companyId,
    collectionId,
    pickerIds,
    totalAmount,
    paidAt: serverTimestamp(),
    paidAtLocal: Date.now(),
    dateLocalISO: new Date().toISOString(),
  });

  const wb = writeBatch(db);
  for (const pickerId of pickerIds) {
    wb.update(doc(db, PICKERS, pickerId), {
      isPaid: true,
      paidAt: serverTimestamp(),
      paymentBatchId: batchRef.id,
    });
  }
  await wb.commit();

  return batchRef.id;
}

function isOfflineBuyerUpdateError(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code ?? '').toLowerCase();
  const message = String((error as { message?: string } | null)?.message ?? '').toLowerCase();
  return (
    code === 'unavailable' ||
    message.includes('offline') ||
    message.includes('network request failed') ||
    message.includes('client is offline')
  );
}

async function queueBuyerPriceAndCloseOffline(params: {
  collectionId: string;
  pricePerKgBuyer: number;
  markBuyerPaid: boolean;
  totalHarvestKg?: number;
  totalPickerCost?: number;
  companyId?: string;
  projectId?: string;
  cropType?: string;
  harvestDate?: unknown;
  collectionName?: string;
  existingHarvestId?: string;
}): Promise<void> {
  const hasTotalHarvestKg = Number.isFinite(params.totalHarvestKg);
  const hasTotalPickerCost = Number.isFinite(params.totalPickerCost);
  const totalHarvestKg = hasTotalHarvestKg ? Number(params.totalHarvestKg) : undefined;
  const totalPickerCost = hasTotalPickerCost ? Number(params.totalPickerCost) : undefined;
  const totalRevenue =
    totalHarvestKg != null ? totalHarvestKg * Number(params.pricePerKgBuyer ?? 0) : undefined;
  const profit =
    totalRevenue != null && totalPickerCost != null
      ? totalRevenue - totalPickerCost
      : undefined;

  const update: Record<string, unknown> = {
    pricePerKgBuyer: params.pricePerKgBuyer,
    status: params.markBuyerPaid ? 'closed' : 'sold',
  };
  if (totalHarvestKg != null) update.totalHarvestKg = totalHarvestKg;
  if (totalPickerCost != null) update.totalPickerCost = totalPickerCost;
  if (totalRevenue != null) update.totalRevenue = totalRevenue;
  if (profit != null) update.profit = profit;
  if (params.markBuyerPaid) {
    update.buyerPaidAt = serverTimestamp();
  }

  const updateClean: Record<string, unknown> = {};
  Object.entries(update).forEach(([k, v]) => {
    if (v !== undefined) updateClean[k] = v;
  });

  const isFrenchBeans = String(params.cropType ?? '').toLowerCase() === 'french-beans';
  const canQueueHarvestSale =
    params.markBuyerPaid &&
    isFrenchBeans &&
    !params.existingHarvestId &&
    totalHarvestKg != null &&
    totalHarvestKg > 0 &&
    totalRevenue != null &&
    totalRevenue > 0 &&
    Boolean(params.companyId) &&
    Boolean(params.projectId);

  if (!canQueueHarvestSale) {
    await updateDoc(doc(db, COLLECTIONS, params.collectionId), updateClean);
    return;
  }

  const harvestRef = doc(collection(db, 'harvests'));
  const saleRef = doc(collection(db, 'sales'));
  const harvestDate = params.harvestDate ?? serverTimestamp();
  const notes = params.collectionName
    ? `From picker collection: ${params.collectionName}`
    : 'From picker collection';

  updateClean.harvestId = harvestRef.id;

  const wb = writeBatch(db);
  wb.set(harvestRef, {
    quantity: totalHarvestKg,
    unit: 'kg',
    quality: 'A',
    projectId: params.projectId ?? null,
    companyId: params.companyId ?? null,
    cropType: params.cropType ?? null,
    destination: 'market',
    date: harvestDate,
    createdAt: serverTimestamp(),
    createdAtLocal: Date.now(),
    dateLocalISO: new Date().toISOString(),
    notes,
    farmPricingMode: 'total',
    farmPriceUnitType: 'kg',
    farmTotalPrice: totalRevenue,
  });

  wb.set(saleRef, {
    harvestId: harvestRef.id,
    buyerName: 'Buyer (collections)',
    quantity: totalHarvestKg,
    unit: 'kg',
    unitPrice: params.pricePerKgBuyer,
    totalAmount: totalRevenue,
    status: 'completed',
    projectId: params.projectId ?? null,
    companyId: params.companyId ?? null,
    cropType: params.cropType ?? null,
    date: harvestDate,
    createdAt: serverTimestamp(),
    createdAtLocal: Date.now(),
    dateLocalISO: new Date().toISOString(),
  });

  wb.update(doc(db, COLLECTIONS, params.collectionId), updateClean);
  await wb.commit();
}

/** Set buyer price and compute totalRevenue + profit; optionally mark buyer paid (closed). Uses a single transaction for speed and to avoid double-sync. */
export async function setBuyerPriceAndMaybeClose(params: {
  collectionId: string;
  pricePerKgBuyer: number;
  markBuyerPaid: boolean;
  totalHarvestKg?: number;
  totalPickerCost?: number;
  companyId?: string;
  projectId?: string;
  cropType?: string;
  harvestDate?: unknown;
  collectionName?: string;
  existingHarvestId?: string;
}): Promise<void> {
  const collectionId = params?.collectionId != null ? String(params.collectionId).trim() : '';
  if (!collectionId) {
    throw new Error('Collection ID is required.');
  }
  if (!db) {
    throw new Error('Firestore is not initialized.');
  }
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  if (isOffline) {
    await queueBuyerPriceAndCloseOffline({
      collectionId,
      pricePerKgBuyer: params.pricePerKgBuyer,
      markBuyerPaid: params.markBuyerPaid,
      totalHarvestKg: params.totalHarvestKg,
      totalPickerCost: params.totalPickerCost,
      companyId: params.companyId,
      projectId: params.projectId,
      cropType: params.cropType,
      harvestDate: params.harvestDate,
      collectionName: params.collectionName,
      existingHarvestId: params.existingHarvestId,
    });
    return;
  }

  try {
    const pickersQuery = query(collection(db, PICKERS), where('collectionId', '==', collectionId));
    // Create refs outside transaction so they use the same db instance (avoids "path" undefined errors)
    const harvestRef = doc(collection(db, 'harvests'));
    const saleRef = doc(collection(db, 'sales'));

    // Read pickers outside transaction to avoid BatchGetDocuments path that can receive undefined refs
    const pickersSnap = await getDocs(pickersQuery);
    const allPaid = pickersSnap.docs.length > 0 && pickersSnap.docs.every((d) => d.data().isPaid === true);
    if (params.markBuyerPaid && !allPaid) {
      throw new Error('Cannot close harvest: some pickers are still unpaid.');
    }

    await runTransaction(db, async (tx) => {
      // Build colRef inside transaction from db + collectionId so the ref is never stale/undefined
      const colRef = doc(collection(db, COLLECTIONS), collectionId);
      const colSnap = await tx.get(colRef);
      if (!colSnap.exists()) {
        throw new Error('Collection not found.');
      }
      const col = colSnap.data() as Record<string, unknown>;
      const totalHarvestKg =
        Number.isFinite(params.totalHarvestKg) ? Number(params.totalHarvestKg) : Number(col?.totalHarvestKg ?? 0);
      const totalPickerCost =
        Number.isFinite(params.totalPickerCost) ? Number(params.totalPickerCost) : Number(col?.totalPickerCost ?? 0);
      const totalRevenue = totalHarvestKg * params.pricePerKgBuyer;
      const profit = totalRevenue - totalPickerCost;

      const update: Record<string, unknown> = {
        pricePerKgBuyer: params.pricePerKgBuyer,
        totalHarvestKg,
        totalPickerCost,
        totalRevenue,
        profit,
        status: params.markBuyerPaid ? 'closed' : 'sold',
      };
      if (params.markBuyerPaid) {
        update.buyerPaidAt = serverTimestamp();

        const isFrenchBeans = (col?.cropType as string | undefined)?.toLowerCase() === 'french-beans';
        const alreadySavedToHarvests = !!col?.harvestId;
        if (isFrenchBeans && !alreadySavedToHarvests && totalHarvestKg > 0 && totalRevenue > 0) {
          const projectId = col?.projectId ?? null;
          const companyId = col?.companyId ?? null;
          const cropType = col?.cropType ?? null;
          const harvestDate = col?.harvestDate ?? serverTimestamp();
          const notes = col?.name ? `From picker collection: ${col.name}` : 'From picker collection';

          tx.set(harvestRef, {
            quantity: totalHarvestKg,
            unit: 'kg',
            quality: 'A',
            projectId,
            companyId,
            cropType,
            destination: 'market',
            date: harvestDate,
            createdAt: serverTimestamp(),
            createdAtLocal: Date.now(),
            dateLocalISO: new Date().toISOString(),
            notes,
            farmPricingMode: 'total',
            farmPriceUnitType: 'kg',
            farmTotalPrice: totalRevenue,
          });

          tx.set(saleRef, {
            harvestId: harvestRef.id,
            buyerName: 'Buyer (collections)',
            quantity: totalHarvestKg,
            unit: 'kg',
            unitPrice: params.pricePerKgBuyer,
            totalAmount: totalRevenue,
            status: 'completed',
            projectId,
            companyId,
            cropType,
            date: harvestDate,
            createdAt: serverTimestamp(),
            createdAtLocal: Date.now(),
            dateLocalISO: new Date().toISOString(),
          });

          update.harvestId = harvestRef.id;
        }
      }
      // Firestore rejects undefined; only pass defined values
      const updateClean: Record<string, unknown> = {};
      Object.entries(update).forEach(([k, v]) => {
        if (v !== undefined) updateClean[k] = v;
      });
      tx.update(colRef, updateClean);
    });
  } catch (error) {
    if (isOfflineBuyerUpdateError(error)) {
      await queueBuyerPriceAndCloseOffline({
        collectionId,
        pricePerKgBuyer: params.pricePerKgBuyer,
        markBuyerPaid: params.markBuyerPaid,
        totalHarvestKg: params.totalHarvestKg,
        totalPickerCost: params.totalPickerCost,
        companyId: params.companyId,
        projectId: params.projectId,
        cropType: params.cropType,
        harvestDate: params.harvestDate,
        collectionName: params.collectionName,
        existingHarvestId: params.existingHarvestId,
      });
      return;
    }
    throw error;
  }
}

/**
 * Backfill: for an already-closed French beans collection that was never synced to Harvest Sales,
 * create the harvest + sale and set harvestId on the collection. Uses a transaction so a collection is never synced twice.
 */
export async function syncClosedCollectionToHarvestSale(collectionId: string): Promise<boolean> {
  const colRef = doc(db, COLLECTIONS, collectionId);
  let synced = false;
  await runTransaction(db, async (tx) => {
    const colSnap = await tx.get(colRef);
    const col = colSnap.data();
    if (!col) return;

    const isFrenchBeans = (col.cropType as string)?.toLowerCase() === 'french-beans';
    const closed = col.status === 'closed' || !!col.buyerPaidAt;
    const totalHarvestKg = Number(col.totalHarvestKg ?? 0);
    const totalRevenue = Number(col.totalRevenue ?? 0);
    const pricePerKgBuyer = Number(col.pricePerKgBuyer ?? 0) || totalRevenue / totalHarvestKg;
    if (!isFrenchBeans || !closed || totalHarvestKg <= 0 || totalRevenue <= 0 || !!col.harvestId) {
      return;
    }

    const harvestRef = doc(collection(db, 'harvests'));
    tx.set(harvestRef, {
      quantity: totalHarvestKg,
      unit: 'kg',
      quality: 'A',
      projectId: col.projectId,
      companyId: col.companyId,
      cropType: col.cropType,
      destination: 'market',
      date: col.harvestDate ?? serverTimestamp(),
      createdAt: serverTimestamp(),
      createdAtLocal: Date.now(),
      dateLocalISO: new Date().toISOString(),
      notes: col.name ? `From picker collection: ${col.name}` : 'From picker collection',
      farmPricingMode: 'total',
      farmPriceUnitType: 'kg',
      farmTotalPrice: totalRevenue,
    });

    const saleRef = doc(collection(db, 'sales'));
    tx.set(saleRef, {
      harvestId: harvestRef.id,
      buyerName: 'Buyer (collections)',
      quantity: totalHarvestKg,
      unit: 'kg',
      unitPrice: pricePerKgBuyer,
      totalAmount: totalRevenue,
      status: 'completed',
      projectId: col.projectId,
      companyId: col.companyId,
      cropType: col.cropType,
      date: col.harvestDate ?? serverTimestamp(),
      createdAt: serverTimestamp(),
      createdAtLocal: Date.now(),
      dateLocalISO: new Date().toISOString(),
    });

    tx.update(colRef, { harvestId: harvestRef.id });
    synced = true;
  });
  return synced;
}

/** Update collection status to payout_complete when all pickers are paid (optional, for UI state) */
export async function refreshCollectionStatus(collectionId: string): Promise<HarvestCollectionStatus> {
  const pickersSnap = await getDocs(
    query(collection(db, PICKERS), where('collectionId', '==', collectionId))
  );
  const allPaid = pickersSnap.docs.length > 0 && pickersSnap.docs.every((d) => d.data().isPaid === true);
  const colRef = doc(db, COLLECTIONS, collectionId);
  const status: HarvestCollectionStatus = allPaid ? 'payout_complete' : 'collecting';
  await updateDoc(colRef, { status });
  return status;
}

/** Register or update cash pool for a harvest collection (French beans wallet). */
export async function registerHarvestCash(params: {
  collectionId: string;
  projectId: string;
  companyId: string;
  cropType: string;
  cashReceived: number;
  source: string;
  receivedBy: string;
}): Promise<void> {
  const amount = Number(params.cashReceived ?? 0);
  if (amount <= 0) {
    throw new Error('Cash received must be greater than 0.');
  }

  await addWalletCredit(
    params.projectId,
    params.companyId,
    amount,
    `Harvest cash registered (${params.source})`,
    {
      refType: 'COLLECTION',
      refId: params.collectionId,
      createdByName: params.receivedBy,
      source: params.source,
      cropType: params.cropType,
      reasonType: 'HARVEST_CASH',
    },
  );
}

/** Apply a picker payout from the single project wallet ledger. */
export async function applyHarvestCashPayment(params: {
  companyId: string;
  projectId: string;
  cropType: string;
  collectionId: string;
  amount: number;
}): Promise<void> {
  const amount = Number(params.amount ?? 0);
  if (amount <= 0) return;

  const summary = await getWalletSummaryOnce(params.projectId, params.companyId);
  if (summary.currentBalance < amount) {
    throw new Error('Not enough cash in Project Wallet.');
  }

  await addWalletDebit(
    params.projectId,
    params.companyId,
    amount,
    'Picker cash payout',
    {
      refType: 'COLLECTION',
      refId: params.collectionId,
      cropType: params.cropType,
      reasonType: 'PICKER_PAYMENT',
    },
  );
}

export async function payPickersFromWalletBatchFirestore(params: {
  companyId: string;
  projectId: string;
  cropType: string;
  collectionId: string;
  pickerIds: string[];
  pickerAmountsById?: Record<string, number>;
}): Promise<void> {
  const { companyId, projectId, cropType, collectionId, pickerIds, pickerAmountsById } = params;
  if (!pickerIds.length) return;

  const pickerRefs = pickerIds.map((id) => doc(db, PICKERS, id));
  const pickerSnaps = await Promise.all(pickerRefs.map((ref) => getDoc(ref)));

  const toPay: { ref: any; amount: number }[] = [];
  pickerSnaps.forEach((snap) => {
    if (!snap.exists()) return;
    const picker = snap.data() as any;
    if (picker.isPaid) return;
    const amountFromInput = Number(pickerAmountsById?.[snap.id] ?? NaN);
    const amount = Number.isFinite(amountFromInput) ? amountFromInput : Number(picker.totalPay ?? 0);
    if (amount > 0) {
      toPay.push({ ref: snap.ref, amount });
    }
  });

  if (!toPay.length) {
    throw new Error('All selected pickers are already paid or zero.');
  }

  const totalAmount = toPay.reduce((sum, p) => sum + p.amount, 0);
  const summary = await getWalletSummaryOnce(projectId, companyId);
  if (summary.currentBalance < totalAmount) {
    throw new Error('Not enough cash in Project Wallet.');
  }

  // Create a payment batch + mark pickers paid first, then append one ledger DEBIT entry.
  const paymentBatchRef = doc(collection(db, PAYMENT_BATCHES));
  const paidPickerIds = toPay.map((p) => p.ref.id);
  const wb = writeBatch(db);

  wb.set(paymentBatchRef, {
    companyId,
    collectionId,
    pickerIds: paidPickerIds,
    totalAmount,
    paidAt: serverTimestamp(),
    paidAtLocal: Date.now(),
    dateLocalISO: new Date().toISOString(),
  });

  toPay.forEach(({ ref }) => {
    wb.update(ref, {
      isPaid: true,
      paidAt: serverTimestamp(),
      paymentBatchId: paymentBatchRef.id,
    });
  });

  await wb.commit();

  await addWalletDebit(
    projectId,
    companyId,
    totalAmount,
    'Picker batch payout',
    {
      refType: 'COLLECTION',
      refId: collectionId,
      paymentBatchId: paymentBatchRef.id,
      idempotencyKey: `paymentBatch:${paymentBatchRef.id}`,
      pickerIds: paidPickerIds,
      cropType,
      reasonType: 'PICKER_BATCH_PAYMENT',
    },
  );
}

/** Get project wallet summary (compat wrapper for existing callers). */
export async function getHarvestWallet(params: {
  companyId: string;
  projectId: string;
  cropType: string;
}): Promise<{ id: string; currentBalance: number; cashPaidOutTotal: number; cashReceivedTotal: number } | null> {
  if (!params.companyId || !params.projectId) return null;
  const summary = await getWalletSummaryOnce(params.projectId, params.companyId);
  return {
    id: `${params.companyId}_${params.projectId}`,
    currentBalance: summary.currentBalance,
    cashPaidOutTotal: summary.cashPaidOutTotal,
    cashReceivedTotal: summary.cashReceivedTotal,
  };
}

/** Top up project wallet (compat wrapper for existing callers). */
export async function topUpHarvestWallet(params: {
  companyId: string;
  projectId: string;
  cropType: string;
  amount: number;
}): Promise<void> {
  const amount = Number(params.amount ?? 0);
  if (amount <= 0) {
    throw new Error('Top up amount must be greater than 0.');
  }

  await addWalletCredit(
    params.projectId,
    params.companyId,
    amount,
    'Project wallet top-up',
    {
      refType: 'MANUAL',
      refId: params.projectId,
      cropType: params.cropType,
      reasonType: 'PROJECT_TOP_UP',
    },
  );
}
