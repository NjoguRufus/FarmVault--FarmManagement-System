import { listEntitiesByCompany } from '@/lib/localData/entityRepository';
import { requireCompanyId } from '@/lib/db';

/**
 * Farm financial snapshot from the local store (works offline after at least one pull, or for pending writes).
 * Revenue: uses harvest collection rows' best-effort `buyer_value` or `total_revenue` in `data` if present;
 * else falls back to 0. Prefer `pullRemote` to hydrate before relying on these totals in production.
 */
export async function getLocalCompanyFinancialTotals(companyId: string | null): Promise<{
  totalExpenses: number;
  totalHarvestRevenue: number;
  profit: number;
}> {
  if (!companyId) {
    return { totalExpenses: 0, totalHarvestRevenue: 0, profit: 0 };
  }
  const cid = requireCompanyId(companyId);
  const expenses = await listEntitiesByCompany('expenses', cid);
  const harvests = await listEntitiesByCompany('harvests', cid);
  const totalExpenses = expenses.reduce((sum, e) => {
    const a = e.data['amount'] ?? (e.data as { amount?: number }).amount;
    const del = e.data['deleted_at'] ?? (e.data as { deleted_at?: string | null }).deleted_at;
    if (del) return sum;
    return sum + (typeof a === 'number' ? a : Number(a ?? 0));
  }, 0);
  const totalHarvestRevenue = harvests.reduce((sum, h) => {
    const d = h.data;
    const v =
      (d['total_revenue'] as number | undefined) ??
      (d['buyer_total'] as number | undefined) ??
      (d['gross_revenue'] as number | undefined) ??
      0;
    return sum + (typeof v === 'number' ? v : Number(v));
  }, 0);
  return {
    totalExpenses,
    totalHarvestRevenue,
    profit: totalHarvestRevenue - totalExpenses,
  };
}
