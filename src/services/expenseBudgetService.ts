import { db, requireCompanyId } from '@/lib/db';
import { decrementPoolRemaining } from './budgetPoolService';

/**
 * After creating an expense linked to a project with a budget pool, decrement the pool's remaining balance.
 * Projects with a separate budget (no pool) keep their allocated `budget` unchanged; spend is derived from finance.expenses.
 */
export async function applyExpenseDeduction(
  companyId: string,
  projectId: string,
  amount: number,
): Promise<void> {
  if (!projectId || !companyId || Number(amount) <= 0) return;
  const tenant = requireCompanyId(companyId);

  const { data: proj, error } = await db
    .projects()
    .from('projects')
    .select('budget_pool_id')
    .eq('id', projectId)
    .eq('company_id', tenant)
    .maybeSingle();

  if (error || !proj) return;

  const poolId = (proj as { budget_pool_id?: string | null }).budget_pool_id;
  if (!poolId) return;

  await decrementPoolRemaining(poolId, tenant, amount);
}
