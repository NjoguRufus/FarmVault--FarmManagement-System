/**
 * French Beans harvest collections – Supabase-only.
 * Tables: harvest.harvest_collections, harvest.harvest_pickers,
 * harvest.picker_intake_entries, harvest.picker_payment_entries.
 * Prefers RPCs (harvest.record_intake, harvest.record_payment) when recording intake/payment by picker_id.
 * No Firebase/Firestore.
 */

import { supabase } from '@/lib/supabase';
import type { HarvestCollectionStatus } from '@/types';

/** Use same authenticated supabase client for all harvest tables so JWT/defaults (e.g. created_by) apply. */
const harvest = () => supabase.schema('harvest');

// ---- Types (DB row shapes) ----

/** Matches harvest.harvest_collections. Prefer picker_price_per_unit; fallback price_per_kg for older migrations. */
type DbCollection = {
  id: string;
  company_id: string;
  project_id: string;
  collection_date: string;
  status?: string;
  unit: string | null;
  buyer_price_per_unit: number | null;
  is_closed?: boolean;
  closed_at: string | null;
  crop_type: string | null;
  price_per_kg?: number | null;
  picker_price_per_unit?: number | null;
  notes?: string | null;
  created_by: string | null;
  created_at: string;
};

type DbPicker = {
  id: string;
  company_id: string;
  collection_id: string;
  picker_number: number;
  picker_name: string;
  created_at: string;
};

type DbIntakeEntry = {
  id: string;
  company_id: string;
  collection_id: string;
  picker_id: string;
  quantity: number;
  recorded_at: string;
  recorded_by: string | null;
};

type DbPaymentEntry = {
  id: string;
  company_id: string;
  collection_id: string;
  picker_id: string;
  amount_paid: number;
  paid_at: string;
  paid_by: string | null;
  note: string | null;
};

// ---- Map to app types ----

function mapCollection(row: DbCollection): {
  id: string;
  companyId: string;
  projectId: string;
  cropType: string;
  name?: string;
  harvestDate: Date | string;
  pricePerKgPicker: number;
  pricePerKgBuyer?: number;
  totalHarvestKg: number;
  totalPickerCost: number;
  totalRevenue?: number;
  profit?: number;
  status: HarvestCollectionStatus;
  buyerPaidAt?: Date | string | null;
  harvestId?: string;
  createdAt?: string;
} {
  const status = row.status ?? (row.is_closed ? 'closed' : 'open');
  const pricePerUnit = row.picker_price_per_unit ?? row.price_per_kg;
  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    cropType: row.crop_type ?? 'french_beans',
    name: row.notes ?? undefined,
    harvestDate: row.collection_date,
    pricePerKgPicker: Number(pricePerUnit ?? 0),
    pricePerKgBuyer: row.buyer_price_per_unit != null ? Number(row.buyer_price_per_unit) : undefined,
    totalHarvestKg: 0,
    totalPickerCost: 0,
    status: mapCollectionStatus(status),
    buyerPaidAt: row.is_closed ? row.closed_at ?? undefined : undefined,
    createdAt: row.created_at,
  };
}

function mapCollectionStatus(s: string): HarvestCollectionStatus {
  if (s === 'closed' || s === 'payout_complete') return s as HarvestCollectionStatus;
  if (s === 'sold') return 'sold';
  return 'collecting';
}

function mapPicker(row: DbPicker, totalKg: number, totalPay: number, isPaid: boolean): {
  id: string;
  companyId: string;
  collectionId: string;
  pickerNumber: number;
  pickerName: string;
  totalKg: number;
  totalPay: number;
  isPaid: boolean;
  paidAt?: string | null;
  paymentBatchId?: string | null;
} {
  return {
    id: row.id,
    companyId: row.company_id,
    collectionId: row.collection_id,
    pickerNumber: row.picker_number,
    pickerName: row.picker_name,
    totalKg,
    totalPay,
    isPaid,
  };
}

function mapIntakeEntry(row: DbIntakeEntry): {
  id: string;
  companyId: string;
  pickerId: string;
  collectionId: string;
  weightKg: number;
  tripNumber: number;
  recordedAt: string;
} {
  return {
    id: row.id,
    companyId: row.company_id,
    pickerId: row.picker_id,
    collectionId: row.collection_id,
    weightKg: Number(row.quantity),
    tripNumber: 0,
    recordedAt: row.recorded_at,
  };
}

// ---- API ----

export async function createHarvestCollection(params: {
  companyId: string;
  projectId: string;
  harvestedOn?: Date | string;
  harvestDate?: Date | string;
  cropType?: string;
  notes?: string | null;
  name?: string | null;
  pricePerKg?: number;
  pricePerKgPicker?: number;
}): Promise<string> {
  const dateSource = params.harvestedOn ?? params.harvestDate;
  if (!dateSource) throw new Error('harvestedOn or harvestDate is required');
  const collection_date = typeof dateSource === 'string'
    ? dateSource
    : dateSource instanceof Date
      ? dateSource.toISOString().slice(0, 10)
      : new Date((dateSource as any)?.seconds ? (dateSource as any).seconds * 1000 : dateSource).toISOString().slice(0, 10);

  const buyerPricePerKg: number | null = null;
  const pickerRatePerKg = params.pricePerKg ?? params.pricePerKgPicker ?? 20;
  const notes = params.notes ?? params.name ?? null;

  const payload = {
    company_id: params.companyId,
    project_id: params.projectId,
    crop_type: 'french_beans',
    collection_date,
    buyer_price_per_unit: buyerPricePerKg,
    unit: 'kg',
    is_closed: false,
    price_per_kg: buyerPricePerKg ?? null,
    picker_price_per_unit: pickerRatePerKg,
    notes: notes ?? null,
    status: 'open',
  };
  // TEMP debug: do NOT send created_by; DB default core.current_user_id() should set it.
  if (import.meta.env.DEV) {
    const { data: whoami, error: whoErr } = await supabase.schema('admin').rpc('whoami');
    // eslint-disable-next-line no-console
    console.log('[HC whoami]', { whoami, whoErr });
    // eslint-disable-next-line no-console
    console.log('[createHarvestCollection] payload', payload);
  }

  const { data, error } = await supabase.schema('harvest').from('harvest_collections')
    .insert(payload)
    .select('id,created_by')
    .single();

  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[createHarvestCollection] error', error);
    }
    throw error;
  }

  if (import.meta.env.DEV && data) {
    // eslint-disable-next-line no-console
    console.log('[createHarvestCollection] returned row', data);
  }

  if (!data?.id) throw new Error('Create harvest collection failed');
  return data.id;
}

// Explicit columns matching harvest.harvest_collections; do not use select('*') to avoid schema cache errors.
const HARVEST_COLLECTIONS_SELECT =
  'id,company_id,project_id,crop_type,collection_date,buyer_price_per_unit,unit,is_closed,closed_at,created_by,created_at,price_per_kg,notes,picker_price_per_unit,status';

export async function listHarvestCollections(
  companyId: string,
  projectId?: string | null
): Promise<ReturnType<typeof mapCollection>[]> {
  let q = harvest()
    .from('harvest_collections')
    .select(HARVEST_COLLECTIONS_SELECT)
    .eq('company_id', companyId)
    .order('collection_date', { ascending: false });

  if (projectId) {
    q = q.eq('project_id', projectId);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((row) => mapCollection(row as DbCollection));
}

export async function getHarvestCollection(collectionId: string): Promise<ReturnType<typeof mapCollection> | null> {
  const { data, error } = await harvest()
    .from('harvest_collections')
    .select(HARVEST_COLLECTIONS_SELECT)
    .eq('id', collectionId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapCollection(data as DbCollection) : null;
}

export async function addPicker(params: {
  collectionId: string;
  companyId: string;
  pickerNumber: number;
  pickerName: string;
  phone?: string | null;
}): Promise<string> {
  const { data, error } = await harvest()
    .from('harvest_pickers')
    .insert({
      company_id: params.companyId,
      collection_id: params.collectionId,
      picker_number: params.pickerNumber,
      picker_name: params.pickerName,
    })
    .select('id')
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error('Add picker failed');
  return data.id;
}

export async function listPickers(collectionId: string): Promise<DbPicker[]> {
  const { data, error } = await harvest()
    .from('harvest_pickers')
    .select('*')
    .eq('collection_id', collectionId)
    .order('picker_number', { ascending: true });

  if (error) throw error;
  return (data ?? []) as DbPicker[];
}

/** List pickers for multiple collections (e.g. for project view). */
export async function listPickersByCollectionIds(collectionIds: string[]): Promise<DbPicker[]> {
  if (collectionIds.length === 0) return [];
  const { data, error } = await harvest()
    .from('harvest_pickers')
    .select('*')
    .in('collection_id', collectionIds)
    .order('picker_number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DbPicker[];
}

export async function addPickerIntake(params: {
  collectionId: string;
  companyId: string;
  pickerId: string;
  pickedOn?: Date | string | null;
  kg: number;
  crates?: number | null;
  unit?: string;
}): Promise<string> {
  // Prefer RPC so server sets recorded_by and enforces membership; avoids RLS issues.
  const { error: rpcError } = await supabase
    .schema('harvest')
    .rpc('record_intake', {
      p_collection_id: params.collectionId,
      p_picker_id: params.pickerId,
      p_quantity: params.kg,
      p_unit: params.unit ?? 'kg',
    });

  if (!rpcError) {
    // RPC returns void; return a placeholder (UI typically refetches list).
    return 'rpc-ok';
  }

  // Fallback: direct insert (e.g. if RPC not available). Do NOT send recorded_by — DB default applies.
  const { data, error } = await harvest()
    .from('picker_intake_entries')
    .insert({
      company_id: params.companyId,
      collection_id: params.collectionId,
      picker_id: params.pickerId,
      quantity: params.kg,
      unit: params.unit ?? 'kg',
    })
    .select('id')
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error('Add picker intake failed');
  return data.id;
}

export async function listPickerIntake(collectionId: string): Promise<ReturnType<typeof mapIntakeEntry>[]> {
  const { data, error } = await harvest()
    .from('picker_intake_entries')
    .select('*')
    .eq('collection_id', collectionId)
    .order('recorded_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => mapIntakeEntry(row as DbIntakeEntry));
}

/** List intake for multiple collections. */
export async function listPickerIntakeByCollectionIds(collectionIds: string[]): Promise<ReturnType<typeof mapIntakeEntry>[]> {
  if (collectionIds.length === 0) return [];
  const { data, error } = await harvest()
    .from('picker_intake_entries')
    .select('*')
    .in('collection_id', collectionIds)
    .order('recorded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapIntakeEntry(row as DbIntakeEntry));
}

export async function listPickerPayments(collectionId: string): Promise<DbPaymentEntry[]> {
  const { data, error } = await harvest()
    .from('picker_payment_entries')
    .select('*')
    .eq('collection_id', collectionId)
    .order('paid_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as DbPaymentEntry[];
}

/** List payments for multiple collections. */
export async function listPickerPaymentsByCollectionIds(collectionIds: string[]): Promise<DbPaymentEntry[]> {
  if (collectionIds.length === 0) return [];
  const { data, error } = await harvest()
    .from('picker_payment_entries')
    .select('*')
    .in('collection_id', collectionIds)
    .order('paid_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as DbPaymentEntry[];
}

/** Record a single picker payment (marks as paid in DB). Prefers RPC so server sets paid_by. */
export async function recordPickerPayment(params: {
  collectionId: string;
  companyId: string;
  pickerId: string;
  amount: number;
  note?: string | null;
}): Promise<string> {
  const { error: rpcError } = await supabase
    .schema('harvest')
    .rpc('record_payment', {
      p_collection_id: params.collectionId,
      p_picker_id: params.pickerId,
      p_amount_paid: params.amount,
      p_note: params.note ?? null,
    });

  if (!rpcError) {
    return 'rpc-ok';
  }

  const { data, error } = await harvest()
    .from('picker_payment_entries')
    .insert({
      company_id: params.companyId,
      collection_id: params.collectionId,
      picker_id: params.pickerId,
      amount_paid: params.amount,
      note: params.note ?? null,
    })
    .select('id')
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error('Record payment failed');
  return data.id;
}

/** Close collection via RPC (status = closed, closed_at = now). Use when not setting buyer price. */
export async function closeCollection(collectionId: string): Promise<void> {
  const { error } = await supabase.schema('harvest').rpc('close_collection', {
    p_collection_id: collectionId,
  });
  if (error) throw error;
}

/** Update collection: set buyer price and optionally close. */
export async function setBuyerPriceAndClose(params: {
  collectionId: string;
  pricePerKgBuyer: number;
  markBuyerPaid: boolean;
}): Promise<void> {
  const update: Record<string, unknown> = {
    buyer_price_per_unit: params.pricePerKgBuyer,
    is_closed: params.markBuyerPaid,
    status: params.markBuyerPaid ? 'closed' : 'open',
  };
  if (params.markBuyerPaid) {
    update.closed_at = new Date().toISOString();
  }

  const { error } = await harvest()
    .from('harvest_collections')
    .update(update)
    .eq('id', params.collectionId);

  if (error) throw error;
}

// ---- Legacy-compat names (same as old Firebase service) ----

export async function addHarvestPicker(params: {
  companyId: string;
  collectionId: string;
  pickerNumber: number;
  pickerName: string;
}): Promise<string> {
  return addPicker({
    companyId: params.companyId,
    collectionId: params.collectionId,
    pickerNumber: params.pickerNumber,
    pickerName: params.pickerName,
  });
}

export async function addPickerWeighEntry(params: {
  companyId: string;
  pickerId: string;
  collectionId: string;
  weightKg: number;
  tripNumber?: number;
  suggestedTripNumber?: number;
}): Promise<string> {
  return addPickerIntake({
    companyId: params.companyId,
    collectionId: params.collectionId,
    pickerId: params.pickerId,
    kg: params.weightKg,
  });
}

/** Mark one picker as paid by recording a payment entry. */
export async function markPickerCashPaid(params: {
  collectionId: string;
  companyId: string;
  pickerId: string;
  amount: number;
}): Promise<void> {
  if (params.amount <= 0) return;
  await recordPickerPayment({
    companyId: params.companyId,
    collectionId: params.collectionId,
    pickerId: params.pickerId,
    amount: params.amount,
  });
}

/** Mark multiple pickers as paid (record payment entry per picker). */
export async function markPickersPaidInBatch(params: {
  companyId: string;
  collectionId: string;
  pickerIds: string[];
  totalAmount: number;
  pickerAmountsById?: Record<string, number>;
}): Promise<void> {
  const { companyId, collectionId, pickerIds, totalAmount, pickerAmountsById } = params;
  if (pickerIds.length === 0) return;

  const perPicker = pickerAmountsById ?? {};
  const fallbackEach = totalAmount / pickerIds.length;
  for (const pickerId of pickerIds) {
    const amount = perPicker[pickerId] ?? fallbackEach;
    if (amount > 0) {
      await recordPickerPayment({ companyId, collectionId, pickerId, amount });
    }
  }
}

/** Full signature for page (optional args). */
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
  await setBuyerPriceAndClose({
    collectionId: params.collectionId,
    pricePerKgBuyer: params.pricePerKgBuyer,
    markBuyerPaid: params.markBuyerPaid,
  });
}

/** Fetch pickers by IDs (e.g. for expense detail). */
export async function getHarvestPickersByIds(
  pickerIds: string[]
): Promise<{ id: string; pickerNumber?: number; pickerName?: string; totalPay?: number }[]> {
  if (pickerIds.length === 0) return [];

  const { data, error } = await harvest()
    .from('harvest_pickers')
    .select('id, picker_number, picker_name')
    .in('id', pickerIds);

  if (error) throw error;
  return (data ?? []).map((row: { id: string; picker_number: number; picker_name: string }) => ({
    id: row.id,
    pickerNumber: row.picker_number,
    pickerName: row.picker_name,
    totalPay: undefined,
  }));
}

// ---- Stubs for wallet / legacy compatibility (no Firebase) ----

export async function registerHarvestCash(_params: {
  collectionId: string;
  projectId: string;
  companyId: string;
  cropType: string;
  cashReceived: number;
  source: string;
  receivedBy: string;
}): Promise<void> {
  // Wallet not yet in Supabase; no-op to avoid Firebase.
}

export async function applyHarvestCashPayment(_params: {
  companyId: string;
  projectId: string;
  cropType: string;
  collectionId: string;
  amount: number;
}): Promise<void> {
  // Wallet not yet in Supabase; no-op.
}

/** Mark multiple pickers as paid by recording payment entries (no wallet). */
export async function payPickersFromWalletBatchFirestore(params: {
  companyId: string;
  projectId: string;
  cropType: string;
  collectionId: string;
  pickerIds: string[];
  pickerAmountsById?: Record<string, number>;
}): Promise<void> {
  const amounts = params.pickerAmountsById ?? {};
  for (const pickerId of params.pickerIds) {
    const amount = amounts[pickerId];
    if (amount != null && amount > 0) {
      await recordPickerPayment({
        companyId: params.companyId,
        collectionId: params.collectionId,
        pickerId,
        amount,
      });
    }
  }
}

export async function syncClosedCollectionToHarvestSale(_collectionId: string): Promise<boolean> {
  return false;
}

export { mapCollection, mapPicker, mapIntakeEntry };
export type { DbCollection, DbPicker, DbIntakeEntry, DbPaymentEntry };
