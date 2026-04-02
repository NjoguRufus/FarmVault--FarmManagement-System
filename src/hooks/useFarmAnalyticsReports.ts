import { useCallback, useEffect, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  fetchAnalyticsCropProfit,
  fetchAnalyticsCropYield,
  fetchAnalyticsExpenseBreakdown,
  fetchAnalyticsMonthlyRevenue,
} from '@/services/analyticsReportsService';
import { supabase } from '@/lib/supabase';

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
    const totalYield = cropYield.reduce((s, r) => s + r.total_yield, 0);
    return { totalRevenue, totalExpenses, totalProfit, totalYield };
  }, [cropProfit, expenseBreakdown, cropYield]);

  const bestCrop = useMemo(() => {
    if (!cropProfit.length) return null;
    const ranked = [...cropProfit].filter((r) => (r.crop ?? '').length > 0 || r.profit !== 0 || r.total_revenue !== 0);
    if (!ranked.length) return null;
    // Best crop = crop with highest revenue (per requirements)
    ranked.sort((a, b) => b.total_revenue - a.total_revenue);
    return ranked[0];
  }, [cropProfit]);

  const refetchAll = useCallback(() => Promise.all(results.map((q) => q.refetch())), [results]);

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel(`farm-analytics-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'harvests', filter: `company_id=eq.${id}` },
        () => void refetchAll(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expenses', filter: `company_id=eq.${id}` },
        () => void refetchAll(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_usage_logs', filter: `company_id=eq.${id}` },
        () => void refetchAll(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'operations_work_cards', filter: `company_id=eq.${id}` },
        () => void refetchAll(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, id, refetchAll]);

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
