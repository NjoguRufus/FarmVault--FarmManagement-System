import { supabase } from '@/lib/supabase';
import {
  getTomatoDashboardSummary,
  fetchTomatoMonthlyRevenueByCompany,
} from '@/services/tomatoHarvestService';

export type AnalyticsCropProfitRow = {
  crop: string | null;
  total_revenue: number;
  total_expenses: number;
  profit: number;
};

export type AnalyticsCropYieldRow = {
  crop: string | null;
  total_yield: number;
};

export type AnalyticsMonthlyRevenueRow = {
  month: string;
  revenue: number;
};

export type AnalyticsExpenseBreakdownRow = {
  category: string | null;
  total: number;
};

export type AnalyticsReportDetailRow = {
  date: string; // YYYY-MM-DD
  crop: string | null;
  revenue: number;
  expenses: number;
  profit: number;
  yield: number;
};

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function logSupabaseError(context: Record<string, unknown>, error: unknown) {
  // eslint-disable-next-line no-console
  console.error('Supabase error:', {
    ...context,
    message: (error as any)?.message,
    code: (error as any)?.code,
    details: (error as any)?.details,
    hint: (error as any)?.hint,
    error,
  });
  // eslint-disable-next-line no-console
  console.error('Supabase error (json):', JSON.stringify({ ...context, error }, null, 2));
}

function isTomatoesCropName(c: string | null): boolean {
  if (!c) return false;
  const n = c.toLowerCase().replace(/_/g, '-').trim();
  return n === 'tomatoes' || n === 'tomato';
}

export async function fetchAnalyticsCropProfit(companyId: string): Promise<AnalyticsCropProfitRow[]> {
  const [{ data, error }, tomatoAgg] = await Promise.all([
    supabase.rpc('analytics_crop_profit', { p_company_id: companyId }),
    getTomatoDashboardSummary({ companyId, projectId: null }).catch(() => null),
  ]);
  if (error) {
    logSupabaseError({ op: 'rpc', fn: 'analytics_crop_profit', p_company_id: companyId }, error);
    throw error;
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  const mapped: AnalyticsCropProfitRow[] = rows.map((r) => ({
    crop: typeof r.crop === 'string' ? r.crop : r.crop == null ? null : String(r.crop),
    total_revenue: toNumber(r.total_revenue),
    total_expenses: toNumber(r.total_expenses),
    profit: toNumber(r.profit),
  }));

  const tomatoRev = tomatoAgg?.totalRevenue ?? 0;
  const tomatoExp = tomatoAgg?.totalExpenses ?? 0;
  if (tomatoRev > 0 || tomatoExp > 0) {
    const idx = mapped.findIndex((r) => isTomatoesCropName(r.crop));
    if (idx >= 0) {
      mapped[idx] = {
        crop: mapped[idx].crop,
        total_revenue: tomatoRev,
        total_expenses: tomatoExp,
        profit: tomatoRev - tomatoExp,
      };
    } else {
      mapped.push({
        crop: 'tomatoes',
        total_revenue: tomatoRev,
        total_expenses: tomatoExp,
        profit: tomatoRev - tomatoExp,
      });
    }
  }

  return mapped;
}

export async function fetchAnalyticsCropYield(companyId: string): Promise<AnalyticsCropYieldRow[]> {
  const { data, error } = await supabase.rpc('analytics_crop_yield', { p_company_id: companyId });
  if (error) {
    logSupabaseError({ op: 'rpc', fn: 'analytics_crop_yield', p_company_id: companyId }, error);
    throw error;
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map((r) => ({
    crop: typeof r.crop === 'string' ? r.crop : r.crop == null ? null : String(r.crop),
    total_yield: toNumber(r.total_yield ?? r.total_yield_kg ?? r.total ?? r.quantity),
  }));
}

function normalizeMonthKey(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.slice(0, 10);
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return String(raw).slice(0, 10);
}

export async function fetchAnalyticsMonthlyRevenue(companyId: string): Promise<AnalyticsMonthlyRevenueRow[]> {
  const [{ data, error }, tomatoMonths] = await Promise.all([
    supabase.rpc('analytics_monthly_revenue', { p_company_id: companyId }),
    fetchTomatoMonthlyRevenueByCompany(companyId).catch(() => []),
  ]);
  if (error) {
    logSupabaseError({ op: 'rpc', fn: 'analytics_monthly_revenue', p_company_id: companyId }, error);
    throw error;
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  const byMonth = new Map<string, number>();
  for (const r of rows) {
    const mk = normalizeMonthKey(r.month);
    if (!mk) continue;
    const key = mk.length >= 7 ? `${mk.slice(0, 7)}-01` : mk;
    byMonth.set(key, (byMonth.get(key) ?? 0) + toNumber(r.revenue));
  }
  for (const t of tomatoMonths) {
    const mk = normalizeMonthKey(t.month);
    if (!mk) continue;
    const key = mk.length >= 7 ? `${mk.slice(0, 7)}-01` : mk;
    byMonth.set(key, (byMonth.get(key) ?? 0) + t.revenue);
  }
  return Array.from(byMonth.entries())
    .map(([month, revenue]) => ({ month, revenue }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export async function fetchAnalyticsExpenseBreakdown(companyId: string): Promise<AnalyticsExpenseBreakdownRow[]> {
  const { data, error } = await supabase.rpc('analytics_expense_breakdown', { p_company_id: companyId });
  if (error) {
    logSupabaseError({ op: 'rpc', fn: 'analytics_expense_breakdown', p_company_id: companyId }, error);
    throw error;
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map((r) => ({
    category: typeof r.category === 'string' ? r.category : r.category == null ? null : String(r.category),
    total: toNumber(r.total),
  }));
}

export async function fetchAnalyticsReportDetailRows(companyId: string): Promise<AnalyticsReportDetailRow[]> {
  const { data, error } = await supabase.rpc('analytics_report_detail_rows', { p_company_id: companyId });
  if (error) {
    logSupabaseError({ op: 'rpc', fn: 'analytics_report_detail_rows', p_company_id: companyId }, error);
    throw error;
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map((r) => {
    const d = r.date;
    const date =
      typeof d === 'string'
        ? d.slice(0, 10)
        : d instanceof Date
          ? d.toISOString().slice(0, 10)
          : String(d ?? '');
    return {
      date,
      crop: typeof r.crop === 'string' ? r.crop : r.crop == null ? null : String(r.crop),
      revenue: toNumber(r.revenue),
      expenses: toNumber(r.expenses),
      profit: toNumber(r.profit),
      yield: toNumber(r.yield),
    };
  });
}
