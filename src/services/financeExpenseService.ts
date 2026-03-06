/**
 * Read finance.expenses from Supabase (canonical schema).
 * Real columns: id, company_id, project_id, category, amount, currency, expense_date, note, created_by, created_at.
 * No item_name, no notes (use note), no payment_method.
 */

import { db } from '@/lib/db';

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
  meta?: { source: string };
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
    .select('id,company_id,project_id,category,amount,currency,expense_date,note,created_by,created_at')
    .eq('company_id', companyId)
    .order('expense_date', { ascending: false });

  if (projectId) {
    q = q.eq('project_id', projectId);
  }

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as FinanceExpenseRow[];

  return rows.map((row) => {
    const description = (row.note || row.category || 'Expense').trim() || 'Expense';
    const isPickerPayout = row.category === 'picker_payout' || (row.note != null && row.note.includes('picker payout'));
    return {
      id: row.id,
      companyId: row.company_id,
      projectId: row.project_id ?? undefined,
      category: row.category,
      description,
      amount: Number(row.amount ?? 0),
      date: row.expense_date,
      meta: isPickerPayout ? { source: 'harvest_wallet_picker_payment' } : undefined,
    };
  });
}
