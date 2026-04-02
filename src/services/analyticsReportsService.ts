import { supabase } from '@/lib/supabase';

export type AnalyticsCropProfitRow = {
  crop: string | null;
  total_revenue: number;
  total_expenses: number;
  profit: number;
};

export type AnalyticsCropYieldRow = {
  crop: string | null;
  total_crates: number;
  total_weight: number;
};

export type AnalyticsMonthlyRevenueRow = {
  month: string;
  revenue: number;
};

export type AnalyticsExpenseBreakdownRow = {
  category: string | null;
  total: number;
};

function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchAnalyticsCropProfit(companyId: string): Promise<AnalyticsCropProfitRow[]> {
  const { data, error } = await supabase.rpc('analytics_crop_profit', { p_company_id: companyId });
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map((r) => ({
    crop: typeof r.crop === 'string' ? r.crop : r.crop == null ? null : String(r.crop),
    total_revenue: toNumber(r.total_revenue),
    total_expenses: toNumber(r.total_expenses),
    profit: toNumber(r.profit),
  }));
}

export async function fetchAnalyticsCropYield(companyId: string): Promise<AnalyticsCropYieldRow[]> {
  const { data, error } = await supabase.rpc('analytics_crop_yield', { p_company_id: companyId });
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map((r) => {
    const crop =
      typeof r.crop === 'string'
        ? r.crop
        : typeof r.crop_type === 'string'
          ? r.crop_type
          : r.crop == null && r.crop_type == null
            ? null
            : String(r.crop ?? r.crop_type ?? '');
    return {
      crop,
      total_crates: toNumber(r.total_crates),
      total_weight: toNumber(r.total_weight),
    };
  });
}

export async function fetchAnalyticsMonthlyRevenue(companyId: string): Promise<AnalyticsMonthlyRevenueRow[]> {
  const { data, error } = await supabase.rpc('analytics_monthly_revenue', { p_company_id: companyId });
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map((r) => {
    const m = r.month;
    let monthStr: string;
    if (typeof m === 'string') monthStr = m;
    else if (m instanceof Date) monthStr = m.toISOString().slice(0, 10);
    else monthStr = String(m ?? '');
    return {
      month: monthStr,
      revenue: toNumber(r.revenue),
    };
  });
}

export async function fetchAnalyticsExpenseBreakdown(companyId: string): Promise<AnalyticsExpenseBreakdownRow[]> {
  const { data, error } = await supabase.rpc('analytics_expense_breakdown', { p_company_id: companyId });
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  return rows.map((r) => ({
    category: typeof r.category === 'string' ? r.category : r.category == null ? null : String(r.category),
    total: toNumber(r.total),
  }));
}
