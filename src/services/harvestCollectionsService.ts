/**
 * French Beans harvest collections – Supabase-only.
 * Tables: harvest.harvest_collections, harvest.harvest_pickers,
 * harvest.picker_intake_entries, harvest.picker_payment_entries.
 * Wallet: finance.project_wallets + finance.project_wallet_ledger (source of truth).
 * Prefers RPCs (harvest.record_intake, harvest.record_payment) when recording intake/payment by picker_id.
 * No Firebase/Firestore.
 */

import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import type { HarvestCollectionStatus } from '@/types';

/** Use same authenticated supabase client for all harvest tables so JWT/defaults (e.g. created_by) apply. */
const harvest = () => supabase.schema('harvest');

/** Ensure a row exists in finance.project_wallets for company_id + project_id (for Harvest Cash). */
async function ensureProjectWallet(companyId: string, projectId: string): Promise<void> {
  const { data: existing } = await db
    .finance()
    .from('project_wallets')
    .select('id')
    .eq('company_id', companyId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (existing?.id) return;
  const { error } = await db
    .finance()
    .from('project_wallets')
    .insert({ company_id: companyId, project_id: projectId, currency: 'KES' });
  if (error) throw error;
}

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

// ---- Collection financials (DB-backed) ----

export type HarvestCollectionFinancials = {
  totalHarvestQty: number;
  pickerPricePerUnit: number;
  buyerPricePerUnit: number;
  totalPickerDue: number;
  totalPaidOut: number;
  pickerBalance: number;
  revenue: number;
  profit: number;
};

const PICKER_PRICE_FALLBACK = 20;

/**
 * Compute collection-level financials from DB-backed data only.
 * Uses harvest.harvest_collections (picker_price_per_unit, buyer_price_per_unit),
 * harvest.picker_intake_entries (quantity), harvest.picker_payment_entries (amount_paid).
 */
export function computeCollectionFinancials(params: {
  collection: { picker_price_per_unit?: number | null; buyer_price_per_unit?: number | null };
  intakeEntries: { quantity?: number; weightKg?: number }[];
  paymentEntries: { amount_paid: number }[];
}): HarvestCollectionFinancials {
  const totalHarvestQty =
    (params.intakeEntries ?? []).reduce(
      (sum, e) => sum + (Number(e.quantity ?? e.weightKg ?? 0) || 0),
      0
    ) || 0;
  const pickerPricePerUnit =
    Number(params.collection.picker_price_per_unit ?? null) || PICKER_PRICE_FALLBACK;
  const buyerPricePerUnit =
    Number(params.collection.buyer_price_per_unit ?? null) || 0;
  const totalPickerDue = totalHarvestQty * pickerPricePerUnit;
  const totalPaidOut =
    (params.paymentEntries ?? []).reduce(
      (sum, p) => sum + (Number(p.amount_paid ?? 0) || 0),
      0
    ) || 0;
  const pickerBalance = totalPickerDue - totalPaidOut;
  const revenue = totalHarvestQty * buyerPricePerUnit;
  const profit = revenue - totalPaidOut;

  return {
    totalHarvestQty,
    pickerPricePerUnit,
    buyerPricePerUnit,
    totalPickerDue,
    totalPaidOut,
    pickerBalance,
    revenue,
    profit,
  };
}

/**
 * Fetch collection, intake, and payments for a collection and return DB-backed financials.
 */
export async function getHarvestCollectionFinancials(
  collectionId: string
): Promise<HarvestCollectionFinancials | null> {
  const [collection, intake, payments] = await Promise.all([
    getHarvestCollection(collectionId),
    listPickerIntake(collectionId),
    listPickerPayments(collectionId),
  ]);
  if (!collection) return null;
  const intakeRows = intake.map((e) => ({ quantity: e.weightKg, weightKg: e.weightKg }));
  const paymentRows = payments.map((p) => ({ amount_paid: p.amount_paid }));
  return computeCollectionFinancials({
    collection: {
      picker_price_per_unit: collection.pricePerKgPicker,
      buyer_price_per_unit: collection.pricePerKgBuyer ?? null,
    },
    intakeEntries: intakeRows,
    paymentEntries: paymentRows,
  });
}

// ---- Company/project financial aggregation (dashboard + harvest sales) ----

export type CollectionFinancialRow = {
  collectionId: string;
  projectId: string;
  collectionDate: string;
  totalHarvestQty: number;
  buyerPricePerUnit: number;
  revenue: number;
  totalPaidOut: number;
  profit: number;
  status: string;
  isClosed: boolean;
};

export type CompanyFinancialTotals = {
  collections: CollectionFinancialRow[];
  totalRevenue: number;
  totalExpenses: number;
  profitLoss: number;
  totalHarvestKg: number;
  totalSales: number;
  completedSales: number;
  pendingSales: number;
};

const FRENCH_BEANS_CROP = 'french_beans';

/**
 * Aggregate French Beans collection financials for a company (optionally by project).
 * Uses harvest.harvest_collections, picker_intake_entries, picker_payment_entries.
 */
export async function getCompanyCollectionFinancialsAggregate(
  companyId: string,
  projectId?: string | null
): Promise<CompanyFinancialTotals> {
  const collections = await listHarvestCollections(companyId, projectId ?? undefined);
  const frenchCollections = collections.filter(
    (c) => (c.cropType ?? '').toString().toLowerCase().replace('_', '-') === 'french-beans' ||
      (c.cropType ?? '').toString().toLowerCase() === 'french_beans'
  );
  if (frenchCollections.length === 0) {
    return {
      collections: [],
      totalRevenue: 0,
      totalExpenses: 0,
      profitLoss: 0,
      totalHarvestKg: 0,
      totalSales: 0,
      completedSales: 0,
      pendingSales: 0,
    };
  }
  const collectionIds = frenchCollections.map((c) => c.id);
  const [intakeList, paymentList] = await Promise.all([
    listPickerIntakeByCollectionIds(collectionIds),
    listPickerPaymentsByCollectionIds(collectionIds),
  ]);
  const intakeByCollection = new Map<string, number>();
  intakeList.forEach((e) => {
    const cur = intakeByCollection.get(e.collectionId) ?? 0;
    intakeByCollection.set(e.collectionId, cur + (e.weightKg ?? 0));
  });
  const paidByCollection = new Map<string, number>();
  paymentList.forEach((p) => {
    const cur = paidByCollection.get(p.collection_id) ?? 0;
    paidByCollection.set(p.collection_id, cur + Number(p.amount_paid ?? 0));
  });
  const rows: CollectionFinancialRow[] = [];
  let totalRevenue = 0;
  let totalExpenses = 0;
  let totalHarvestKg = 0;
  let completedSales = 0;
  let pendingSales = 0;
  frenchCollections.forEach((c) => {
    const totalHarvestQty = intakeByCollection.get(c.id) ?? 0;
    const totalPaidOut = paidByCollection.get(c.id) ?? 0;
    const buyerPricePerUnit = Number(c.pricePerKgBuyer ?? 0) || 0;
    const revenue = totalHarvestQty * buyerPricePerUnit;
    const profit = revenue - totalPaidOut;
    const isClosed = c.status === 'closed' || (c as { is_closed?: boolean }).is_closed === true;
    rows.push({
      collectionId: c.id,
      projectId: c.projectId,
      collectionDate: c.harvestDate != null ? String(c.harvestDate) : '',
      totalHarvestQty,
      buyerPricePerUnit,
      revenue,
      totalPaidOut,
      profit,
      status: c.status ?? 'open',
      isClosed: !!isClosed,
    });
    totalRevenue += revenue;
    totalExpenses += totalPaidOut;
    totalHarvestKg += totalHarvestQty;
    if (isClosed) completedSales += revenue;
    else pendingSales += revenue;
  });
  return {
    collections: rows,
    totalRevenue,
    totalExpenses,
    profitLoss: totalRevenue - totalExpenses,
    totalHarvestKg,
    totalSales: totalRevenue,
    completedSales,
    pendingSales,
  };
}

/** Record a single picker payment (marks as paid in DB). Uses direct insert so we get id for expense sync. */
export async function recordPickerPayment(params: {
  collectionId: string;
  companyId: string;
  pickerId: string;
  amount: number;
  note?: string | null;
}): Promise<string> {
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

/** Ensure one expense row in finance.expenses for this picker payment (no duplicates). Uses real schema: category, amount, currency, expense_date, note. */
async function syncPickerPaymentToExpense(params: {
  companyId: string;
  projectId: string;
  collectionId: string;
  pickerId: string;
  amountPaid: number;
  paymentEntryId: string;
}): Promise<void> {
  const note = `French beans picker payout | collection:${params.collectionId} | picker:${params.pickerId}`;
  const expenseDate = new Date().toISOString().slice(0, 10);

  const { data: existing } = await db
    .finance()
    .from('expenses')
    .select('id')
    .eq('project_id', params.projectId)
    .eq('category', 'picker_payout')
    .eq('amount', params.amountPaid)
    .eq('note', note)
    .maybeSingle();
  if (existing?.id) return;

  const payload = {
    company_id: params.companyId,
    project_id: params.projectId,
    category: 'picker_payout',
    amount: params.amountPaid,
    currency: 'KES',
    expense_date: expenseDate,
    note,
  };
  console.log('[Picker Payment Expense Payload]', payload);

  const { error } = await db
    .finance()
    .from('expenses')
    .insert(payload);

  if (error) {
    console.error('[Picker Payment Expense Error]', error);
    throw error;
  }
}

/** Mark one picker as paid by recording a payment entry and syncing to finance.expenses. */
export async function markPickerCashPaid(params: {
  collectionId: string;
  companyId: string;
  pickerId: string;
  amount: number;
  projectId?: string;
  note?: string | null;
}): Promise<void> {
  if (params.amount <= 0) return;
  const paymentEntryId = await recordPickerPayment({
    companyId: params.companyId,
    collectionId: params.collectionId,
    pickerId: params.pickerId,
    amount: params.amount,
    note: params.note ?? null,
  });
  if (params.projectId && paymentEntryId) {
    await syncPickerPaymentToExpense({
      companyId: params.companyId,
      projectId: params.projectId,
      collectionId: params.collectionId,
      pickerId: params.pickerId,
      amountPaid: params.amount,
      paymentEntryId,
    });
  }
}

/** Mark multiple pickers as paid (record payment entry per picker and sync to expenses). */
export async function markPickersPaidInBatch(params: {
  companyId: string;
  collectionId: string;
  pickerIds: string[];
  totalAmount: number;
  pickerAmountsById?: Record<string, number>;
  projectId?: string;
}): Promise<void> {
  const { companyId, collectionId, pickerIds, totalAmount, pickerAmountsById, projectId } = params;
  if (pickerIds.length === 0) return;

  const perPicker = pickerAmountsById ?? {};
  const fallbackEach = totalAmount / pickerIds.length;
  for (const pickerId of pickerIds) {
    const amount = perPicker[pickerId] ?? fallbackEach;
    if (amount > 0) {
      const paymentEntryId = await recordPickerPayment({ companyId, collectionId, pickerId, amount });
      if (projectId && paymentEntryId) {
        await syncPickerPaymentToExpense({
          companyId,
          projectId,
          collectionId,
          pickerId,
          amountPaid: amount,
          paymentEntryId,
        });
      }
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

// ---- Harvest Cash Wallet: finance.project_wallets + finance.project_wallet_ledger ----

/**
 * Register harvest cash: ensure wallet exists, then insert a CREDIT into finance.project_wallet_ledger.
 * Balance is derived from ledger (credits - debits). No success unless DB write succeeds.
 */
export async function registerHarvestCash(params: {
  collectionId: string;
  projectId: string;
  companyId: string;
  cropType: string;
  cashReceived: number;
  source: string;
  receivedBy: string;
}): Promise<void> {
  const amount = Number(params.cashReceived);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Cash received must be greater than 0.');
  }
  await ensureProjectWallet(params.companyId, params.projectId);
  const note = `Harvest cash: ${params.source} (${params.receivedBy})`;
  const payload = {
    company_id: params.companyId,
    project_id: params.projectId,
    entry_type: 'credit' as const,
    amount,
    note,
    ref_type: 'harvest_cash' as const,
    ref_id: params.collectionId || null,
  };
  if (import.meta.env.DEV) {
    console.log('[Harvest Cash Register payload]', payload);
  }
  const { data, error } = await db
    .finance()
    .from('project_wallet_ledger')
    .insert(payload)
    .select('id')
    .single();

  if (import.meta.env.DEV) {
    console.log('[Harvest Cash Register result]', { data, error });
  }
  if (error) throw error;
}

/**
 * Record a wallet DEBIT when paying a picker (single payment).
 * Call after recording the payment in harvest.picker_payment_entries.
 */
export async function applyHarvestCashPayment(params: {
  companyId: string;
  projectId: string;
  cropType: string;
  collectionId: string;
  amount: number;
}): Promise<void> {
  const amount = Number(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) return;
  await ensureProjectWallet(params.companyId, params.projectId);
  const payload = {
    company_id: params.companyId,
    project_id: params.projectId,
    entry_type: 'debit' as const,
    amount,
    note: 'Picker cash payout',
    ref_type: 'picker_payment' as const,
    ref_id: params.collectionId || null,
  };
  const { error } = await db
    .finance()
    .from('project_wallet_ledger')
    .insert(payload);

  if (error) throw error;
}

/** Mark multiple pickers as paid: record payment entries, sync each to expenses, and one wallet DEBIT for total. */
export async function payPickersFromWalletBatchFirestore(params: {
  companyId: string;
  projectId: string;
  cropType: string;
  collectionId: string;
  pickerIds: string[];
  pickerAmountsById?: Record<string, number>;
}): Promise<void> {
  const amounts = params.pickerAmountsById ?? {};
  let totalDebit = 0;
  for (const pickerId of params.pickerIds) {
    const amount = amounts[pickerId];
    if (amount != null && amount > 0) {
      const paymentEntryId = await recordPickerPayment({
        companyId: params.companyId,
        collectionId: params.collectionId,
        pickerId,
        amount,
      });
      if (paymentEntryId) {
        await syncPickerPaymentToExpense({
          companyId: params.companyId,
          projectId: params.projectId,
          collectionId: params.collectionId,
          pickerId,
          amountPaid: amount,
          paymentEntryId,
        });
      }
      totalDebit += amount;
    }
  }
  if (totalDebit > 0) {
    await ensureProjectWallet(params.companyId, params.projectId);
    const { error } = await db
      .finance()
      .from('project_wallet_ledger')
      .insert({
        company_id: params.companyId,
        project_id: params.projectId,
        entry_type: 'debit',
        amount: totalDebit,
        note: 'Picker batch payout',
        ref_type: 'picker_payment',
        ref_id: params.collectionId || null,
      });
    if (error) throw error;
  }
}

export async function syncClosedCollectionToHarvestSale(_collectionId: string): Promise<boolean> {
  return false;
}

export { mapCollection, mapPicker, mapIntakeEntry };
export type { DbCollection, DbPicker, DbIntakeEntry, DbPaymentEntry };
