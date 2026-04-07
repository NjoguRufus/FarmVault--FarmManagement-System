import { logger } from "@/lib/logger";
/**
 * French Beans harvest collections – Supabase-only.
 * Tables: harvest.harvest_collections, harvest.harvest_pickers,
 * harvest.picker_intake_entries, harvest.picker_payment_entries.
 * Wallet: finance.project_wallets + finance.project_wallet_ledger (source of truth).
 * Prefers RPCs (harvest.record_intake, harvest.record_payment) when recording intake/payment by picker_id.
 * Harvest collections backed by Supabase.
 * Offline: intake/payment are queued via lib/offlineQueue and synced later with client_entry_id for dedup.
 */

import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import type { HarvestCollectionStatus } from '@/types';
import { addToOfflineQueue } from '@/lib/offlineQueue';
import { logActivity } from '@/services/employeeAccessService';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';

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

/** Exported for offline queue sync: ensure wallet exists before inserting ledger. */
export async function ensureProjectWalletForSync(companyId: string, projectId: string): Promise<void> {
  return ensureProjectWallet(companyId, projectId);
}

/** Exported for offline queue sync: insert one wallet ledger entry (credit or debit). */
export async function insertWalletLedgerEntry(params: {
  company_id: string;
  project_id: string;
  entry_type: 'credit' | 'debit';
  amount: number;
  note: string;
  ref_type: string;
  ref_id: string | null;
}): Promise<void> {
  const { error } = await db
    .finance()
    .from('project_wallet_ledger')
    .insert({
      company_id: params.company_id,
      project_id: params.project_id,
      entry_type: params.entry_type,
      amount: params.amount,
      note: params.note,
      ref_type: params.ref_type,
      ref_id: params.ref_id,
    });
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
  sequence_number?: number | null;
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

type SequencePreviewRpcRow = {
  next_sequence?: number | string | null;
  preview_name?: string | null;
} | null;

type CreateCollectionRpcRow = {
  id: string;
};

function hasSecondsTimestamp(value: unknown): value is { seconds: number } {
  return typeof value === 'object' &&
    value !== null &&
    'seconds' in value &&
    typeof (value as { seconds?: unknown }).seconds === 'number';
}

// ---- Map to app types ----

function mapCollection(row: DbCollection): {
  id: string;
  companyId: string;
  projectId: string;
  cropType: string;
  name?: string;
  sequenceNumber?: number;
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
    sequenceNumber: row.sequence_number != null ? Number(row.sequence_number) : undefined,
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

// ---- Sequence helpers (project-specific; forward-only) ----

export async function previewNextHarvestCollectionSequence(params: {
  projectId: string;
  companyId: string;
}): Promise<{ nextSequence: number; previewName: string }> {
  const { data, error } = await supabase.schema('harvest').rpc('preview_next_collection_sequence', {
    p_project_id: params.projectId,
    p_company_id: params.companyId,
  });
  if (error) throw error;
  const row: SequencePreviewRpcRow = Array.isArray(data) ? (data[0] as SequencePreviewRpcRow) : (data as SequencePreviewRpcRow);
  const nextSequence = Number(row?.next_sequence ?? 0);
  const previewName = String(row?.preview_name ?? '').trim();
  if (!Number.isFinite(nextSequence) || nextSequence <= 0) {
    throw new Error('Failed to preview harvest collection sequence');
  }
  return { nextSequence, previewName };
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
      : new Date(hasSecondsTimestamp(dateSource) ? dateSource.seconds * 1000 : dateSource).toISOString().slice(0, 10);

  const pickerRatePerKg = params.pricePerKg ?? params.pricePerKgPicker ?? 20;
  const customName = params.notes ?? params.name ?? null;

  if (import.meta.env.DEV) {
    const { data: whoami, error: whoErr } = await supabase.schema('admin').rpc('whoami');
    logger.log('[HC whoami]', { whoami, whoErr });
  }

  const { data, error } = await supabase.schema('harvest').rpc('create_collection', {
    p_project_id: params.projectId,
    p_company_id: params.companyId,
    p_custom_name: customName,
    p_collection_date: collection_date,
    p_picker_price_per_unit: pickerRatePerKg,
    p_crop_type: params.cropType ?? 'french_beans',
  });

  if (error) {
    if (import.meta.env.DEV) {
      console.error('[createHarvestCollection] error', error);
    }
    throw error;
  }

  const row: CreateCollectionRpcRow | null = Array.isArray(data)
    ? ((data[0] as CreateCollectionRpcRow | null) ?? null)
    : ((data as CreateCollectionRpcRow | null) ?? null);

  if (import.meta.env.DEV && row) {
    logger.log('[createHarvestCollection] returned row', row);
  }

  if (!row?.id) throw new Error('Create harvest collection failed');
  const collectionId = String(row.id);
  captureEvent(AnalyticsEvents.HARVEST_COLLECTION_CREATED, {
    company_id: params.companyId,
    project_id: params.projectId,
    collection_id: collectionId,
    crop_type: params.cropType ?? 'french_beans',
    module_name: 'harvest',
  });
  return collectionId;
}

// Explicit columns matching harvest.harvest_collections; do not use select('*') to avoid schema cache errors.
const HARVEST_COLLECTIONS_SELECT =
  'id,company_id,project_id,crop_type,collection_date,buyer_price_per_unit,unit,is_closed,closed_at,sequence_number,created_by,created_at,price_per_kg,notes,picker_price_per_unit,status';

export async function listHarvestCollections(
  companyId: string,
  projectId?: string | null
): Promise<ReturnType<typeof mapCollection>[]> {
  let q = harvest()
    .from('harvest_collections')
    .select(HARVEST_COLLECTIONS_SELECT)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

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

export type RenameHarvestCollectionResult = {
  updatedName: string;
  auditLogged: boolean;
};

export type HarvestCollectionProjectTransfer = {
  id: string;
  collectionId: string;
  fromProjectId: string | null;
  toProjectId: string | null;
  reason: string | null;
  transferredBy: string | null;
  transferredAt: string | null;
};

function readFirstString(
  row: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

/**
 * Rename a harvest collection session.
 * IMPORTANT: Update only the "notes" (collection name) column; do not touch totals or child harvest records.
 */
export async function renameHarvestCollection(params: {
  collectionId: string;
  companyId: string;
  oldName?: string | null;
  newName: string;
  actorUserId?: string | null;
}): Promise<RenameHarvestCollectionResult> {
  const trimmed = params.newName.trim();
  if (!trimmed) throw new Error('Collection name cannot be empty');
  if (trimmed.length > 100) throw new Error('Collection name must be 100 characters or fewer');

  const { data, error } = await harvest()
    .from('harvest_collections')
    .update({ notes: trimmed })
    .eq('id', params.collectionId)
    .eq('company_id', params.companyId)
    .select('id, notes')
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error('Rename failed');

  let auditLogged = false;
  try {
    await logActivity({
      companyId: params.companyId,
      employeeId: params.actorUserId ?? null,
      action: 'harvest_collection_renamed',
      module: 'harvest',
      metadata: {
        old_name: params.oldName ?? null,
        new_name: trimmed,
      },
    });
    auditLogged = true;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.error('[renameHarvestCollection] audit log insert failed', err);
    }
    auditLogged = false;
  }

  return { updatedName: trimmed, auditLogged };
}

export async function transferCollectionToProject(params: {
  companyId: string;
  collectionId: string;
  targetProjectId: string;
  reason?: string | null;
  transferredBy?: string | null;
}): Promise<void> {
  const { error } = await supabase
    .schema('harvest')
    .rpc('transfer_collection_to_project', {
      p_company_id: params.companyId,
      p_collection_id: params.collectionId,
      p_target_project_id: params.targetProjectId,
      p_reason: params.reason ?? null,
      p_transferred_by: params.transferredBy ?? null,
    });
  if (error) throw error;
}

export async function listHarvestCollectionProjectTransfers(params: {
  companyId: string;
  collectionId: string;
}): Promise<HarvestCollectionProjectTransfer[]> {
  const { data, error } = await harvest()
    .from('harvest_collection_project_transfers')
    .select('*')
    .eq('company_id', params.companyId)
    .eq('collection_id', params.collectionId)
    .order('transferred_at', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const id = readFirstString(row, ['id']) ?? crypto.randomUUID();
    const collectionId = readFirstString(row, ['collection_id']) ?? params.collectionId;
    const fromProjectId = readFirstString(row, [
      'from_project_id',
      'source_project_id',
      'old_project_id',
      'previous_project_id',
    ]);
    const toProjectId = readFirstString(row, [
      'to_project_id',
      'target_project_id',
      'new_project_id',
      'destination_project_id',
    ]);
    const reason = readFirstString(row, ['reason', 'transfer_reason']);
    const transferredBy = readFirstString(row, ['transferred_by', 'created_by', 'actor_user_id']);
    const transferredAt = readFirstString(row, ['transferred_at', 'created_at']);
    return {
      id,
      collectionId,
      fromProjectId,
      toProjectId,
      reason,
      transferredBy,
      transferredAt,
    };
  });
}

/** Delete a harvest collection session (cascades to pickers + intake/payment entries). */
export async function deleteHarvestCollection(params: { collectionId: string; companyId: string }): Promise<void> {
  const { error } = await harvest()
    .from('harvest_collections')
    .delete()
    .eq('id', params.collectionId)
    .eq('company_id', params.companyId);

  if (error) throw error;
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

export async function updateHarvestPicker(params: {
  companyId: string;
  pickerId: string;
  pickerName: string;
}): Promise<void> {
  const { error } = await harvest()
    .from('harvest_pickers')
    .update({
      picker_name: params.pickerName,
    })
    .eq('id', params.pickerId)
    .eq('company_id', params.companyId);

  if (error) throw error;
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
  recordedBy?: string | null;
  pricePerKg?: number;
  clientEntryId?: string;
}): Promise<string> {
  const clientEntryId = params.clientEntryId ?? crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const queuePayload = {
    client_entry_id: clientEntryId,
    collection_id: params.collectionId,
    picker_id: params.pickerId,
    kg: params.kg,
    price: params.pricePerKg ?? null,
    timestamp,
    recorded_by: params.recordedBy ?? null,
    company_id: params.companyId,
    unit: params.unit ?? 'kg',
  };

  const queueAndReturn = async () => {
    await addToOfflineQueue('intake', queuePayload, { createdBy: params.recordedBy ?? undefined });
    return clientEntryId;
  };

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return queueAndReturn();
  }

  try {
    const { error: rpcError } = await supabase
      .schema('harvest')
      .rpc('record_intake', {
        p_collection_id: params.collectionId,
        p_picker_id: params.pickerId,
        p_quantity: params.kg,
        p_unit: params.unit ?? 'kg',
      });

    if (!rpcError) {
      captureEvent(AnalyticsEvents.PICKER_WEIGHT_RECORDED, {
        company_id: params.companyId,
        collection_id: params.collectionId,
        picker_id: params.pickerId,
        module_name: 'harvest',
      });
      return 'rpc-ok';
    }

    const insertPayload: Record<string, unknown> = {
      company_id: params.companyId,
      collection_id: params.collectionId,
      picker_id: params.pickerId,
      quantity: params.kg,
      unit: params.unit ?? 'kg',
    };
    if (clientEntryId) insertPayload.client_entry_id = clientEntryId;

    const { data, error } = await harvest()
      .from('picker_intake_entries')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) throw error;
    if (!data?.id) throw new Error('Add picker intake failed');
    captureEvent(AnalyticsEvents.PICKER_WEIGHT_RECORDED, {
      company_id: params.companyId,
      collection_id: params.collectionId,
      picker_id: params.pickerId,
      module_name: 'harvest',
    });
    return data.id;
  } catch (_) {
    await queueAndReturn();
    return clientEntryId;
  }
}

/**
 * Update an existing intake entry (picker and/or quantity). Used when editing a recent Quick Intake entry.
 * Entry identity is by database row id only; do not use picker, kg, or timestamp to identify entries.
 */
export async function updatePickerIntakeEntry(params: {
  entryId: string;
  collectionId: string;
  companyId: string;
  pickerId: string;
  quantity: number;
  unit?: string;
}): Promise<void> {
  const { entryId, pickerId, quantity, unit } = params;
  const updatePayload: Record<string, unknown> = {
    picker_id: pickerId,
    quantity: Number(quantity),
  };
  if (unit) updatePayload.unit = unit;

  const { error } = await harvest()
    .from('picker_intake_entries')
    .update(updatePayload)
    .eq('id', entryId)
    .eq('collection_id', params.collectionId);

  if (error) throw error;
}

/**
 * Delete an intake entry by its database row id. Recalculates picker/collection totals after invalidation.
 * Entry identity is by id only; identical-looking entries (same picker, kg, time) remain separate records.
 */
export async function deletePickerIntakeEntry(params: { entryId: string; collectionId: string }): Promise<void> {
  const { entryId, collectionId } = params;
  const { error } = await harvest()
    .from('picker_intake_entries')
    .delete()
    .eq('id', entryId)
    .eq('collection_id', collectionId);

  if (error) throw error;
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

export type RecentPayoutSummary = {
  collectionId: string;
  collectionName: string;
  harvestDate: string;
  totalPaid: number;
  pickersPaidCount: number;
};

/** Recent payouts from harvest.picker_payment_entries grouped by collection. For Expenses page "Recent Payouts" section. */
export async function getRecentPayoutsSummary(
  companyId: string,
  projectId?: string | null
): Promise<RecentPayoutSummary[]> {
  const collections = await listHarvestCollections(companyId, projectId);
  if (collections.length === 0) return [];
  const collectionIds = collections.map((c) => c.id);
  const payments = await listPickerPaymentsByCollectionIds(collectionIds);
  const byCollection = new Map<
    string,
    { totalPaid: number; pickerIds: Set<string> }
  >();
  payments.forEach((p) => {
    const cid = p.collection_id;
    if (!byCollection.has(cid)) {
      byCollection.set(cid, { totalPaid: 0, pickerIds: new Set() });
    }
    const rec = byCollection.get(cid)!;
    rec.totalPaid += Number(p.amount_paid ?? 0);
    rec.pickerIds.add(p.picker_id);
  });
  return collections
    .filter((c) => byCollection.has(c.id) && (byCollection.get(c.id)!.totalPaid > 0 || byCollection.get(c.id)!.pickerIds.size > 0))
    .map((c) => {
      const rec = byCollection.get(c.id)!;
      return {
        collectionId: c.id,
        collectionName: (c.name ?? '').trim() || String(c.harvestDate ?? c.id),
        harvestDate: c.harvestDate != null ? String(c.harvestDate) : '',
        totalPaid: rec.totalPaid,
        pickersPaidCount: rec.pickerIds.size,
      };
    })
    .sort((a, b) => (b.harvestDate || '').localeCompare(a.harvestDate || ''));
}

export type CollectionPayoutDetailRow = {
  pickerNumber: number | string;
  pickerName: string;
  totalKg: number;
  amountPaid: number;
  lastPaidAt: string | null;
};

export type CollectionPayoutDetail = {
  collectionName: string;
  rows: CollectionPayoutDetailRow[];
  totalKg: number;
  totalPaid: number;
};

/** Picker-level payout detail for a collection. For "Recent Payouts" detail modal. */
export async function getCollectionPayoutDetail(collectionId: string): Promise<CollectionPayoutDetail | null> {
  const [collection, intake, payments, pickers] = await Promise.all([
    getHarvestCollection(collectionId),
    listPickerIntake(collectionId),
    listPickerPayments(collectionId),
    listPickers(collectionId),
  ]);
  if (!collection) return null;
  const kgByPicker = new Map<string, number>();
  intake.forEach((e) => {
    const pid = e.pickerId;
    const kg = Number(e.weightKg ?? 0);
    kgByPicker.set(pid, (kgByPicker.get(pid) ?? 0) + kg);
  });
  const paidByPicker = new Map<string, { total: number; lastAt: string | null }>();
  payments.forEach((p) => {
    const pid = p.picker_id;
    const amt = Number(p.amount_paid ?? 0);
    const at = p.paid_at ?? null;
    if (!paidByPicker.has(pid)) {
      paidByPicker.set(pid, { total: 0, lastAt: null });
    }
    const rec = paidByPicker.get(pid)!;
    rec.total += amt;
    if (at && (!rec.lastAt || at > rec.lastAt)) rec.lastAt = at;
  });
  const pickerMap = new Map(pickers.map((p) => [p.id, p]));
  const rows: CollectionPayoutDetailRow[] = [];
  let totalKg = 0;
  let totalPaid = 0;
  paidByPicker.forEach((rec, pickerId) => {
    const p = pickerMap.get(pickerId);
    const totalKgP = kgByPicker.get(pickerId) ?? 0;
    totalKg += totalKgP;
    totalPaid += rec.total;
    rows.push({
      pickerNumber: p?.picker_number ?? pickerId.slice(0, 8),
      pickerName: p?.picker_name ?? '—',
      totalKg: totalKgP,
      amountPaid: rec.total,
      lastPaidAt: rec.lastAt,
    });
  });
  rows.sort((a, b) => Number(a.pickerNumber) - Number(b.pickerNumber));
  return {
    collectionName: (collection.name ?? '').trim() || String(collection.harvestDate ?? collectionId),
    rows,
    totalKg,
    totalPaid,
  };
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

/** Record a single picker payment (marks as paid in DB). Uses direct insert so we get id for expense sync. Offline or on failure: queues and returns local id. */
export async function recordPickerPayment(params: {
  collectionId: string;
  companyId: string;
  pickerId: string;
  amount: number;
  note?: string | null;
  paidBy?: string | null;
  projectId?: string | null;
  clientEntryId?: string;
}): Promise<string> {
  const clientEntryId = params.clientEntryId ?? crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const queuePayload = {
    client_entry_id: clientEntryId,
    collection_id: params.collectionId,
    picker_id: params.pickerId,
    amount: params.amount,
    note: params.note ?? null,
    timestamp,
    paid_by: params.paidBy ?? null,
    company_id: params.companyId,
    project_id: params.projectId ?? null,
  };

  const queueAndReturn = async () => {
    await addToOfflineQueue('payment', queuePayload, { createdBy: params.paidBy ?? undefined });
    return clientEntryId;
  };

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return queueAndReturn();
  }

  try {
    const insertPayload: Record<string, unknown> = {
      company_id: params.companyId,
      collection_id: params.collectionId,
      picker_id: params.pickerId,
      amount_paid: params.amount,
      note: params.note ?? null,
    };
    if (params.paidBy != null) insertPayload.paid_by = params.paidBy;

    logger.log('[Payment Insert Payload]', insertPayload);

    const { data, error } = await harvest()
      .from('picker_payment_entries')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) throw error;
    if (!data?.id) throw new Error('Record payment failed');
    captureEvent(AnalyticsEvents.PICKER_PAYMENT_RECORDED, {
      company_id: params.companyId,
      collection_id: params.collectionId,
      picker_id: params.pickerId,
      module_name: 'harvest',
    });
    return data.id;
  } catch (err) {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (isOffline) {
      await queueAndReturn();
      return clientEntryId;
    }
    console.warn('[Harvest] Payment insert failed.', err);
    throw err;
  }
}

/** Close collection via RPC (status = closed, closed_at = now). Use when not setting buyer price. */
export async function closeCollection(collectionId: string): Promise<void> {
  const { error } = await supabase.schema('harvest').rpc('close_collection', {
    p_collection_id: collectionId,
  });
  if (error) throw error;
  captureEvent(AnalyticsEvents.COLLECTION_CLOSED, {
    collection_id: collectionId,
    module_name: 'harvest',
  });
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
  captureEvent(AnalyticsEvents.BUYER_SETTLEMENT_RECORDED, {
    collection_id: params.collectionId,
    module_name: 'harvest',
  });
  if (params.markBuyerPaid) {
    captureEvent(AnalyticsEvents.COLLECTION_CLOSED, {
      collection_id: params.collectionId,
      module_name: 'harvest',
    });
  }
}

// ---- Legacy-compat export names ----

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
  recordedBy?: string | null;
  pricePerKg?: number;
}): Promise<string> {
  return addPickerIntake({
    companyId: params.companyId,
    collectionId: params.collectionId,
    pickerId: params.pickerId,
    kg: params.weightKg,
    recordedBy: params.recordedBy,
    pricePerKg: params.pricePerKg,
  });
}

/** Ensure one expense row in finance.expenses for this picker payment (no duplicates). Exported for offline queue sync. */
export async function syncPickerPaymentToExpenseForOffline(params: {
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
  logger.log('[Picker Payment Expense Payload]', payload);

  const { error } = await db
    .finance()
    .from('expenses')
    .insert(payload);

  if (error) {
    console.error('[Picker Payment Expense Error]', error);
    throw error;
  }
  captureEvent(AnalyticsEvents.EXPENSE_SYNCED_TO_INVENTORY, {
    company_id: params.companyId,
    project_id: params.projectId,
    collection_id: params.collectionId,
    expense_category: 'picker_payout',
    module_name: 'harvest',
  });
}

/** Mark one picker as paid by recording a payment entry and syncing to finance.expenses. */
export async function markPickerCashPaid(params: {
  collectionId: string;
  companyId: string;
  pickerId: string;
  amount: number;
  projectId?: string;
  note?: string | null;
  paidBy?: string | null;
}): Promise<void> {
  if (params.amount <= 0) return;
  const paymentEntryId = await recordPickerPayment({
    companyId: params.companyId,
    collectionId: params.collectionId,
    pickerId: params.pickerId,
    amount: params.amount,
    note: params.note ?? null,
    paidBy: params.paidBy ?? null,
  });
  if (params.projectId && paymentEntryId) {
    await syncPickerPaymentToExpenseForOffline({
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
        await syncPickerPaymentToExpenseForOffline({
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
 * Offline or on failure: queues as wallet_entry and returns (no throw) so field workflow continues.
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
  const note = `Harvest cash: ${params.source} (${params.receivedBy})`;
  const walletPayload = {
    client_entry_id: crypto.randomUUID(),
    company_id: params.companyId,
    project_id: params.projectId,
    entry_type: 'credit' as const,
    amount,
    note,
    ref_type: 'harvest_cash' as const,
    ref_id: params.collectionId || null,
    created_by: params.receivedBy,
  };

  const queueAndReturn = async () => {
    await addToOfflineQueue('wallet_entry', walletPayload, { createdBy: params.receivedBy });
  };

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await queueAndReturn();
    return;
  }

  try {
    await ensureProjectWallet(params.companyId, params.projectId);
    logger.log('[Harvest Cash Register payload]', walletPayload);
    const { error } = await db
      .finance()
      .from('project_wallet_ledger')
      .insert({
        company_id: params.companyId,
        project_id: params.projectId,
        entry_type: 'credit',
        amount,
        note,
        ref_type: 'harvest_cash',
        ref_id: params.collectionId || null,
      })
      .select('id')
      .single();
    if (error) throw error;
  } catch (_) {
    await queueAndReturn();
  }
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
export async function payPickersFromWalletBatch(params: {
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
        await syncPickerPaymentToExpenseForOffline({
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
