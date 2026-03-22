/**
 * Budget pools — Supabase finance.budget_pools (company-scoped).
 */

import { db, requireCompanyId } from '@/lib/db';
import type { BudgetPool } from '@/types';

type BudgetPoolRow = {
  id: string;
  company_id: string;
  name: string;
  total_amount: number | string | null;
  remaining_amount: number | string | null;
  created_at: string;
};

function mapRow(row: BudgetPoolRow): BudgetPool {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    totalAmount: Number(row.total_amount ?? 0),
    remainingAmount: Number(row.remaining_amount ?? 0),
    createdAt: row.created_at,
  };
}

export interface CreateBudgetPoolInput {
  companyId: string;
  name: string;
  totalAmount: number;
}

export async function createBudgetPool(input: CreateBudgetPoolInput): Promise<string> {
  const companyId = requireCompanyId(input.companyId);
  const amount = Math.max(0, Number(input.totalAmount) || 0);
  const { data, error } = await db
    .finance()
    .from('budget_pools')
    .insert({
      company_id: companyId,
      name: input.name.trim(),
      total_amount: amount,
      remaining_amount: amount,
    })
    .select('id')
    .single();

  if (error) throw error;
  return (data as { id: string }).id;
}

export async function getBudgetPoolsByCompany(companyId: string): Promise<BudgetPool[]> {
  if (!companyId) return [];
  const { data, error } = await db
    .finance()
    .from('budget_pools')
    .select('id,company_id,name,total_amount,remaining_amount,created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as BudgetPoolRow[]).map(mapRow);
}

export async function getBudgetPool(poolId: string, companyId: string): Promise<BudgetPool | null> {
  if (!poolId || !companyId) return null;
  const { data, error } = await db
    .finance()
    .from('budget_pools')
    .select('id,company_id,name,total_amount,remaining_amount,created_at')
    .eq('id', poolId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapRow(data as BudgetPoolRow);
}

/** Decrement pool remaining balance (e.g. after recording an expense). Clamped at zero. */
export async function decrementPoolRemaining(poolId: string, companyId: string, amount: number): Promise<void> {
  if (!poolId || !companyId || Number(amount) <= 0) return;
  const tenant = requireCompanyId(companyId);
  const dec = Number(amount);
  const { data: row, error: fe } = await db
    .finance()
    .from('budget_pools')
    .select('remaining_amount')
    .eq('id', poolId)
    .eq('company_id', tenant)
    .maybeSingle();

  if (fe) throw fe;
  if (!row) return;

  const cur = Number((row as { remaining_amount?: number | string }).remaining_amount ?? 0);
  const next = Math.max(0, cur - dec);
  const { error: ue } = await db
    .finance()
    .from('budget_pools')
    .update({ remaining_amount: next })
    .eq('id', poolId)
    .eq('company_id', tenant);

  if (ue) throw ue;
}
