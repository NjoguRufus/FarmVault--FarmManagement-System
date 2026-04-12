/**
 * Finance expenses — Supabase canonical schema.
 * Table: finance.expenses
 * Columns: id, company_id, project_id, category, amount, currency, expense_date, note, created_by, created_at.
 */

import { db, requireCompanyId } from '@/lib/db';
import { ConcurrentUpdateConflictError } from '@/lib/concurrentUpdate';
import { AnalyticsEvents, captureEvent } from '@/lib/analytics';
import { enqueueUnifiedNotification } from '@/services/unifiedNotificationPipeline';

const LARGE_EXPENSE_KES = 50_000;

export type FinanceExpenseRow = {
  id: string;
  company_id: string;
  project_id: string | null;
  category: string;
  amount: number;
  currency: string | null;
  expense_date: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  row_version?: number | null;
};

/** Shape compatible with Expense for listing (date as Date or string). */
export type ExpenseLike = {
  id: string;
  companyId: string;
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
  projectId?: string | null,
): Promise<ExpenseLike[]> {
  if (!companyId) return [];
  let q = db
    .finance()
    .from('expenses')
    .select('id,company_id,project_id,category,amount,currency,expense_date,note,created_by,created_at,row_version')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('expense_date', { ascending: false });

  if (projectId) {
    q = q.eq('project_id', projectId);
  }

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as FinanceExpenseRow[];

  return rows.map((row) => {
    const note = row.note ?? '';
    const isPickerPayout = row.category === 'picker_payout' || note.toLowerCase().includes('picker payout');
    
    // Parse collection and picker IDs from note format: "... | collection:UUID | picker:UUID"
    let harvestCollectionId: string | undefined;
    let pickerId: string | undefined;
    if (isPickerPayout && note) {
      const collectionMatch = note.match(/collection:([a-f0-9-]{36})/i);
      const pickerMatch = note.match(/picker:([a-f0-9-]{36})/i);
      if (collectionMatch) harvestCollectionId = collectionMatch[1];
      if (pickerMatch) pickerId = pickerMatch[1];
    }
    
    // Create clean description for picker payouts
    let description: string;
    if (isPickerPayout) {
      // Clean up the note - remove collection/picker UUIDs for display
      description = 'French Beans Picker Payout';
    } else {
      description = (note || row.category || 'Expense').trim() || 'Expense';
    }
    
    return {
      id: row.id,
      companyId: row.company_id,
      projectId: row.project_id ?? undefined,
      category: row.category,
      description,
      amount: Number(row.amount ?? 0),
      date: row.expense_date,
      meta: isPickerPayout ? {
        source: 'harvest_wallet_picker_payment',
        harvestCollectionId,
        pickerId,
      } : undefined,
    };
  });
}

export interface CreateExpenseInput {
  companyId: string;
  projectId?: string | null;
  category: string;
  amount: number;
  note?: string | null;
  expenseDate?: string | null;
  createdBy?: string | null;
}

/**
 * Insert a new expense into finance.expenses (Supabase).
 * Returns the created row mapped to ExpenseLike.
 */
export async function createFinanceExpense(input: CreateExpenseInput): Promise<ExpenseLike> {
  const tenant = requireCompanyId(input.companyId);
  const expenseDate = input.expenseDate ?? new Date().toISOString().slice(0, 10);

  const { data, error } = await db
    .finance()
    .from('expenses')
    .insert({
      company_id: tenant,
      project_id: input.projectId ?? null,
      category: input.category,
      amount: input.amount,
      currency: 'KES',
      expense_date: expenseDate,
      note: input.note ?? null,
      created_by: input.createdBy ?? null,
    })
    .select('id,company_id,project_id,category,amount,currency,expense_date,note,created_by,created_at,row_version')
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
    const desc = (row.note || row.category || 'Expense').trim() || 'Expense';
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

  return {
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id ?? undefined,
    category: row.category,
    description: (row.note || row.category || 'Expense').trim() || 'Expense',
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
  projectId?: string | null;
}): Promise<void> {
  const tenant = requireCompanyId(params.companyId);
  const patch: Record<string, unknown> = {};
  if (params.amount !== undefined) patch.amount = params.amount;
  if (params.note !== undefined) patch.note = params.note;
  if (params.expenseDate !== undefined) patch.expense_date = params.expenseDate;
  if (params.category !== undefined) patch.category = params.category;
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
