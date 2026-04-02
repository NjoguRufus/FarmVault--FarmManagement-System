import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  fetchAnalyticsCropProfit,
  fetchAnalyticsCropYield,
  fetchAnalyticsExpenseBreakdown,
  fetchAnalyticsMonthlyRevenue,
} from '@/services/analyticsReportsService';

const staleTime = 60_000;

export function useFarmAnalyticsReports(companyId: string | null | undefined) {
  const id = (companyId ?? '').trim();
  const enabled = id.length > 0;

  const results = useQueries({
    queries: [
      {
        queryKey: ['farm-analytics', 'crop-profit', id],
        queryFn: () => fetchAnalyticsCropProfit(id),
        enabled,
        staleTime,
      },
      {
        queryKey: ['farm-analytics', 'crop-yield', id],
        queryFn: () => fetchAnalyticsCropYield(id),
        enabled,
        staleTime,
      },
      {
        queryKey: ['farm-analytics', 'monthly-revenue', id],
        queryFn: () => fetchAnalyticsMonthlyRevenue(id),
        enabled,
        staleTime,
      },
      {
        queryKey: ['farm-analytics', 'expense-breakdown', id],
        queryFn: () => fetchAnalyticsExpenseBreakdown(id),
        enabled,
        staleTime,
      },
    ],
  });

  const [profitQ, yieldQ, revenueQ, expenseQ] = results;

  const isLoading = enabled && results.some((q) => q.isLoading);
  const isFetching = enabled && results.some((q) => q.isFetching);
  const isError = results.some((q) => q.isError);
  const error = results.find((q) => q.error)?.error ?? null;

  const cropProfit = useMemo(() => profitQ.data ?? [], [profitQ.data]);
  const cropYield = useMemo(() => yieldQ.data ?? [], [yieldQ.data]);
  const monthlyRevenue = useMemo(() => revenueQ.data ?? [], [revenueQ.data]);
  const expenseBreakdown = useMemo(() => expenseQ.data ?? [], [expenseQ.data]);

  const totals = useMemo(() => {
    const totalRevenue = cropProfit.reduce((s, r) => s + r.total_revenue, 0);
    const totalExpenses = expenseBreakdown.reduce((s, r) => s + r.total, 0);
    const totalProfit = totalRevenue - totalExpenses;
    return { totalRevenue, totalExpenses, totalProfit };
  }, [cropProfit, expenseBreakdown]);

  const bestCrop = useMemo(() => {
    if (!cropProfit.length) return null;
    const ranked = [...cropProfit].filter((r) => (r.crop ?? '').length > 0 || r.profit !== 0 || r.total_revenue !== 0);
    if (!ranked.length) return null;
    ranked.sort((a, b) => b.profit - a.profit || b.total_revenue - a.total_revenue);
    return ranked[0];
  }, [cropProfit]);

  const refetchAll = () => Promise.all(results.map((q) => q.refetch()));

  return {
    enabled,
    companyId: id,
    cropProfit,
    cropYield,
    monthlyRevenue,
    expenseBreakdown,
    totals,
    bestCrop,
    isLoading,
    isFetching,
    isError,
    error,
    refetchAll,
  };
}
