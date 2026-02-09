import {
  db,
} from '@/lib/firebase';
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
} from 'firebase/firestore';
import type { HarvestCollectionStatus } from '@/types';

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
  });
  await recalcPickerAndCollection(params.pickerId, params.collectionId);
  return ref.id;
}

/** Recompute picker totalKg/totalPay from weigh entries, then collection totals */
async function recalcPickerAndCollection(pickerId: string, collectionId: string): Promise<void> {
  const pricePerKg = await getPricePerKgPicker(collectionId);

  const entriesSnap = await getDocs(
    query(
      collection(db, WEIGH_ENTRIES),
      where('pickerId', '==', pickerId)
    )
  );
  const totalKg = entriesSnap.docs.reduce((sum, d) => sum + (d.data().weightKg ?? 0), 0);
  const totalPay = Math.round(totalKg * pricePerKg);

  const batch = writeBatch(db);
  batch.update(doc(db, PICKERS, pickerId), { totalKg, totalPay });
  await batch.commit();

  await recalcCollectionTotals(collectionId);
}

/** Get pricePerKgPicker from collection */
async function getPricePerKgPicker(collectionId: string): Promise<number> {
  const colSnap = await getDoc(doc(db, COLLECTIONS, collectionId));
  const data = colSnap.data();
  return data?.pricePerKgPicker ?? 0;
}

/** Recompute collection totalHarvestKg and totalPickerCost from all pickers */
export async function recalcCollectionTotals(collectionId: string): Promise<void> {
  const pickersSnap = await getDocs(
    query(collection(db, PICKERS), where('collectionId', '==', collectionId))
  );
  let totalHarvestKg = 0;
  let totalPickerCost = 0;
  pickersSnap.docs.forEach((d) => {
    const dta = d.data();
    totalHarvestKg += dta.totalKg ?? 0;
    totalPickerCost += dta.totalPay ?? 0;
  });

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

/** Set buyer price and compute totalRevenue + profit; optionally mark buyer paid (closed) */
export async function setBuyerPriceAndMaybeClose(params: {
  collectionId: string;
  pricePerKgBuyer: number;
  markBuyerPaid: boolean;
}): Promise<void> {
  const colRef = doc(db, COLLECTIONS, params.collectionId);
  const pickersSnap = await getDocs(
    query(collection(db, PICKERS), where('collectionId', '==', params.collectionId))
  );
  const allPaid = pickersSnap.docs.every((d) => d.data().isPaid === true);
  if (params.markBuyerPaid && !allPaid) {
    throw new Error('Cannot close harvest: some pickers are still unpaid.');
  }

  const colSnap = await getDoc(doc(db, COLLECTIONS, params.collectionId));
  const col = colSnap.data();
  const totalHarvestKg = col?.totalHarvestKg ?? 0;
  const totalPickerCost = col?.totalPickerCost ?? 0;
  const totalRevenue = totalHarvestKg * params.pricePerKgBuyer;
  const profit = totalRevenue - totalPickerCost;

  const update: Record<string, unknown> = {
    pricePerKgBuyer: params.pricePerKgBuyer,
    totalRevenue,
    profit,
    status: params.markBuyerPaid ? 'closed' : 'sold',
  };
  if (params.markBuyerPaid) {
    update.buyerPaidAt = serverTimestamp();
  }
  await updateDoc(colRef, update);
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
