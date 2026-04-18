/**
 * Finance expenses — Supabase canonical schema.
 * Table: finance.expenses
 * Columns: id, company_id, project_id, category, amount, currency, expense_date, note, created_by, created_at.
 */

import { db, requireCompanyId } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { ConcurrentUpdateConflictError } from '@/lib/concurrentUpdate';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import { enqueueUnifiedNotification } from '@/services/unifiedNotificationPipeline';

const LARGE_EXPENSE_KES = 50_000;

const harvest = () => supabase.schema('harvest');

/** Strip machine suffix so toasts and lists never show raw UUID anchors. */
export function displayPickerPayoutExpenseNote(note: string | null): string {
  if (!note) return 'Picker payout';
  const cut = note.indexOf(' | collection:');
  if (cut >= 0) {
    const head = note.slice(0, cut).trim();
    return head || 'Picker payout';
  }
  return (
    note
      .replace(/\s*\|\s*collection:[a-f0-9-]{36}\s*\|\s*picker:[a-f0-9-]{36}\s*$/i, '')
      .trim() || 'Picker payout'
  );
}

function parsePickerPayoutNoteIds(note: string): { collectionId?: string; pickerId?: string } {
  const collectionMatch = note.match(/collection:([a-f0-9-]{36})/i);
  const pickerMatch = note.match(/picker:([a-f0-9-]{36})/i);
  return {
    collectionId: collectionMatch?.[1],
    pickerId: pickerMatch?.[1],
  };
}

async function loadHarvestPickerPayoutLabels(
  companyId: string,
  collectionIds: string[],
  pickerIds: string[],
): Promise<{ collections: Map<string, string>; pickers: Map<string, string> }> {
  const collections = new Map<string, string>();
  const pickers = new Map<string, string>();
  const cids = [...new Set(collectionIds)].filter(Boolean);
  const pids = [...new Set(pickerIds)].filter(Boolean);

  if (cids.length) {
    const { data, error } = await harvest()
      .from('harvest_collections')
      .select('id, notes, collection_date')
      .eq('company_id', companyId)
      .in('id', cids)
      .is('deleted_at', null);
    if (error) throw error;
    for (const row of data ?? []) {
      const r = row as { id: string; notes?: string | null; collection_date?: string | null };
      const name = String(r.notes ?? '').trim();
      const ds = r.collection_date ? String(r.collection_date).slice(0, 10) : '';
      collections.set(r.id, name || (ds ? `Collection ${ds}` : 'Harvest collection'));
    }
  }
  if (pids.length) {
    const { data, error } = await harvest()
      .from('harvest_pickers')
      .select('id, picker_number, picker_name')
      .eq('company_id', companyId)
      .in('id', pids);
    if (error) throw error;
    for (const row of data ?? []) {
      const r = row as { id: string; picker_number?: number | null; picker_name?: string | null };
      const pname = String(r.picker_name ?? '').trim();
      const num = r.picker_number;
      const label = pname
        ? num != null
          ? `#${num} ${pname}`
          : pname
        : num != null
          ? `Picker #${num}`
          : 'Picker';
      pickers.set(r.id, label);
    }
  }
  return { collections, pickers };
}

export type FinanceExpenseRow = {
  id: string;
  company_id: string;
  farm_id: string;
  project_id: string | null;
  category: string;
  amount: number;
  currency: string | null;
  expense_date: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  row_version?: number | null;
  source?: string | null;
  reference_id?: string | null;
};

/** Shape compatible with Expense for listing (date as Date or string). */
export type ExpenseLike = {
  id: string;
  companyId: string;
  farmId: string;
  projectId?: string;
  category: string;
  description: string;
  amount: number;
  date: Date | string;
  meta?: {
    source?: string;
    harvestCollectionId?: string;
    pickerId?: string;
  };
};

/**
 * Fetch expenses from finance.expenses (Supabase).
 * Same source as picker payout sync; use for Expenses page list and totals.
 */
export async function getFinanceExpenses(
  companyId: string,
  options?: { farmId?: string | null; projectId?: string | null },
): Promise<ExpenseLike[]> {
  if (!companyId) return [];
  const farmId = options?.farmId ?? null;
  const projectId = options?.projectId ?? null;
  let q = db
    .finance()
    .from('expenses')
    .select(
      'id,company_id,farm_id,project_id,category,amount,currency,expense_date,note,created_by,created_at,row_version,source,reference_id',
    )
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('expense_date', { ascending: false });

  if (farmId) {
    q = q.eq('farm_id', farmId);
  }
  if (projectId) {
    q = q.eq('project_id', projectId);
  }

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as FinanceExpenseRow[];

  const parsed = rows.map((row) => {
    const note = row.note ?? '';
    const rowSource = (row as { source?: string }).source;
    const isPickerPayout =
      row.category === 'picker_payout' ||
      rowSource === 'picker_payment' ||
      note.toLowerCase().includes('picker payout');
    let harvestCollectionId: string | undefined;
    let pickerId: string | undefined;
    if (isPickerPayout && note) {
      const ids = parsePickerPayoutNoteIds(note);
      harvestCollectionId = ids.collectionId;
      pickerId = ids.pickerId;
    }
    return { row, note, isPickerPayout, harvestCollectionId, pickerId };
  });

  const collectionIds: string[] = [];
  const pickerIds: string[] = [];
  for (const p of parsed) {
    if (!p.isPickerPayout) continue;
    if (p.harvestCollectionId) collectionIds.push(p.harvestCollectionId);
    if (p.pickerId) pickerIds.push(p.pickerId);
  }

  let collMap = new Map<string, string>();
  let pickMap = new Map<string, string>();
  try {
    const loaded = await loadHarvestPickerPayoutLabels(companyId, collectionIds, pickerIds);
    collMap = loaded.collections;
    pickMap = loaded.pickers;
  } catch {
    // Harvest schema may be unavailable; descriptions still fall back to generic text.
  }

  return parsed.map(({ row, note, isPickerPayout, harvestCollectionId, pickerId }) => {
    let description: string;
    if (isPickerPayout) {
      const head = displayPickerPayoutExpenseNote(note);
      const segments = head.split(' · ').filter(Boolean);
      const looksFriendly = segments.length >= 3;
      if (looksFriendly) {
        description = head;
      } else if (harvestCollectionId && pickerId) {
        description = `Picker payout · ${collMap.get(harvestCollectionId) ?? 'Harvest collection'} · ${pickMap.get(pickerId) ?? 'Picker'}`;
      } else {
        description = head;
      }
    } else {
      description = (note || row.category || 'Expense').trim() || 'Expense';
    }

    return {
      id: row.id,
      companyId: row.company_id,
      farmId: row.farm_id,
      projectId: row.project_id ?? undefined,
      category: row.category,
      description,
      amount: Number(row.amount ?? 0),
      date: row.expense_date,
      meta: isPickerPayout
        ? {
            source: 'harvest_wallet_picker_payment',
            harvestCollectionId,
            pickerId,
          }
        : undefined,
    };
  });
}

export interface CreateExpenseInput {
  companyId: string;
  farmId: string;
  projectId?: string | null;
  category: string;
  amount: number;
  note?: string | null;
  expenseDate?: string | null;
  createdBy?: string | null;
  /** Row origin (default manual). */
  source?: string | null;
  /** Optional linkage UUID (e.g. picker payment entry id). */
  referenceId?: string | null;
}

/**
 * Insert a new expense into finance.expenses (Supabase).
 * Returns the created row mapped to ExpenseLike.
 */
export async function createFinanceExpense(input: CreateExpenseInput): Promise<ExpenseLike> {
  const tenant = requireCompanyId(input.companyId);
  const expenseDate = input.expenseDate ?? new Date().toISOString().slice(0, 10);

  const insertRow: Record<string, unknown> = {
    company_id: tenant,
    farm_id: input.farmId,
    project_id: input.projectId ?? null,
    category: input.category,
    amount: input.amount,
    currency: 'KES',
    expense_date: expenseDate,
    note: input.note ?? null,
    created_by: input.createdBy ?? null,
  };
  if (input.source != null && String(input.source).trim()) {
    insertRow.source = String(input.source).trim();
  }
  if (input.referenceId != null && String(input.referenceId).trim()) {
    insertRow.reference_id = String(input.referenceId).trim();
  }

  const { data, error } = await db
    .finance()
    .from('expenses')
    .insert(insertRow)
    .select('id,company_id,farm_id,project_id,category,amount,currency,expense_date,note,created_by,created_at,row_version')
    .single();

  if (error) throw error;
  const row = data as FinanceExpenseRow;
  captureEvent(AnalyticsEvents.EXPENSE_CREATED, {
    company_id: row.company_id,
    project_id: row.project_id ?? undefined,
    expense_category: row.category,
    module_name: 'expenses',
  });

  if (typeof window !== 'undefined') {
    const amt = Number(row.amount ?? 0);
    const rawNote = (row.note || row.category || 'Expense').trim() || 'Expense';
    const isPicker =
      row.category === 'picker_payout' ||
      String((row as { source?: string }).source ?? '') === 'picker_payment' ||
      String(row.note ?? '').toLowerCase().includes('picker payout');
    const desc = isPicker ? displayPickerPayoutExpenseNote(row.note) : rawNote;
    enqueueUnifiedNotification({
      tier: 'activity',
      kind: 'activity_expense_added',
      title: 'Expense recorded',
      body: `${desc} — KES ${Math.round(amt).toLocaleString('en-KE')}`,
      path: '/expenses',
      toastType: 'success',
    });
    if (amt >= LARGE_EXPENSE_KES) {
      enqueueUnifiedNotification({
        tier: 'insights',
        kind: 'insight_expense',
        title: 'Large expense logged',
        body: `KES ${Math.round(amt).toLocaleString('en-KE')} — ${desc}. Review in Expenses.`,
        path: '/expenses',
        toastType: 'warning',
      });
    }
  }

  const rawDesc = (row.note || row.category || 'Expense').trim() || 'Expense';
  const isPicker =
    row.category === 'picker_payout' ||
    String((row as { source?: string }).source ?? '') === 'picker_payment' ||
    String(row.note ?? '').toLowerCase().includes('picker payout');

  return {
    id: row.id,
    companyId: row.company_id,
    farmId: row.farm_id,
    projectId: row.project_id ?? undefined,
    category: row.category,
    description: isPicker ? displayPickerPayoutExpenseNote(row.note) : rawDesc,
    amount: Number(row.amount ?? 0),
    date: row.expense_date,
  };
}

/**
 * Update an existing finance.expenses row with optional optimistic concurrency.
 * Prefer passing expectedRowVersion from the row the user edited.
 */
export async function updateFinanceExpense(params: {
  id: string;
  companyId: string;
  expectedRowVersion?: number | null;
  amount?: number;
  note?: string | null;
  expenseDate?: string | null;
  category?: string;
  farmId?: string;
  projectId?: string | null;
}): Promise<void> {
  const tenant = requireCompanyId(params.companyId);
  const patch: Record<string, unknown> = {};
  if (params.amount !== undefined) patch.amount = params.amount;
  if (params.note !== undefined) patch.note = params.note;
  if (params.expenseDate !== undefined) patch.expense_date = params.expenseDate;
  if (params.category !== undefined) patch.category = params.category;
  if (params.farmId !== undefined) patch.farm_id = params.farmId;
  if (params.projectId !== undefined) patch.project_id = params.projectId;
  if (Object.keys(patch).length === 0) return;

  const v = params.expectedRowVersion;
  if (v == null || !Number.isFinite(Number(v))) {
    throw new ConcurrentUpdateConflictError(
      'Record updated by another user. Please refresh the page and try again.',
    );
  }

  const q = db
    .finance()
    .from('expenses')
    .update(patch)
    .eq('id', params.id)
    .eq('company_id', tenant)
    .is('deleted_at', null)
    .eq('row_version', Number(v));
  const { data, error } = await q.select('id').maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new ConcurrentUpdateConflictError();
  }
}

export async function countUnlinkedFarmExpenses(params: {
  companyId: string;
  farmId: string;
}): Promise<number> {
  const tenant = requireCompanyId(params.companyId);
  const { count, error } = await db
    .finance()
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', tenant)
    .eq('farm_id', params.farmId)
    .is('project_id', null)
    .is('deleted_at', null);
  if (error) throw error;
  return Number(count ?? 0);
}

export async function linkFarmExpensesToProject(params: {
  companyId: string;
  farmId: string;
  projectId: string;
}): Promise<number> {
  const tenant = requireCompanyId(params.companyId);
  const { data, error } = await db
    .finance()
    .from('expenses')
    .update({ project_id: params.projectId })
    .eq('company_id', tenant)
    .eq('farm_id', params.farmId)
    .is('project_id', null)
    .is('deleted_at', null)
    .select('id');
  if (error) throw error;
  return (data ?? []).length;
}

/** Soft-delete a finance.expense (e.g. rollback when payment insert fails). */
export async function softDeleteFinanceExpense(params: { companyId: string; expenseId: string }): Promise<void> {
  const tenant = requireCompanyId(params.companyId);
  const { error } = await db
    .finance()
    .from('expenses')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', params.expenseId)
    .eq('company_id', tenant)
    .is('deleted_at', null);
  if (error) throw error;
}

/** Link expense row to picker payment entry after both exist. */
export async function setFinanceExpenseReferenceId(params: {
  companyId: string;
  expenseId: string;
  referenceId: string;
}): Promise<void> {
  const tenant = requireCompanyId(params.companyId);
  const { error } = await db
    .finance()
    .from('expenses')
    .update({ reference_id: params.referenceId })
    .eq('id', params.expenseId)
    .eq('company_id', tenant)
    .is('deleted_at', null);
  if (error) throw error;
}
