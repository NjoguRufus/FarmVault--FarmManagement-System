import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { BillingSubmissionCycle, BillingSubmissionPlan } from '@/lib/billingPricing';
import {
  BILLING_PRICES_QUERY_KEY,
  type BillingPriceMatrix,
  type BillingPriceRow,
  fetchBillingPrices,
  rowsToMatrix,
  getAmountFromMatrix,
  computeBundleSavingsFromMatrix,
} from '@/services/billingPricesService';
import { debounce } from '@/lib/debounce';

export interface UseBillingPricesResult {
  rows: BillingPriceRow[] | undefined;
  matrix: BillingPriceMatrix | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
  getAmount: (plan: BillingSubmissionPlan, cycle: BillingSubmissionCycle) => number | null;
  getBundleSavings: (plan: BillingSubmissionPlan, cycle: BillingSubmissionCycle) => number;
}

export function useBillingPrices(options?: { enabled?: boolean }): UseBillingPricesResult {
  const enabled = options?.enabled ?? true;
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: BILLING_PRICES_QUERY_KEY,
    queryFn: () => fetchBillingPrices(supabase),
    staleTime: 60 * 60 * 1000,
    enabled,
  });

  useEffect(() => {
    if (!enabled) return;

    const flush = debounce(() => {
      void queryClient.invalidateQueries({ queryKey: BILLING_PRICES_QUERY_KEY });
    }, 600);

    const channel = supabase
      .channel('core_billing_prices')
      .on(
        'postgres_changes',
        { event: '*', schema: 'core', table: 'billing_prices' },
        () => flush(),
      )
      .subscribe();

    return () => {
      flush.cancel();
      void supabase.removeChannel(channel);
    };
  }, [enabled, queryClient]);

  const matrix = useMemo(() => (data && data.length > 0 ? rowsToMatrix(data) : null), [data]);

  const getAmount = useCallback(
    (plan: BillingSubmissionPlan, cycle: BillingSubmissionCycle) => getAmountFromMatrix(matrix, plan, cycle),
    [matrix],
  );

  const getBundleSavings = useCallback(
    (plan: BillingSubmissionPlan, cycle: BillingSubmissionCycle) => {
      if (!matrix) return 0;
      return computeBundleSavingsFromMatrix(matrix, plan, cycle);
    },
    [matrix],
  );

  return {
    rows: data,
    matrix,
    isLoading,
    error: error instanceof Error ? error : error ? new Error(String(error)) : null,
    refetch,
    getAmount,
    getBundleSavings,
  };
}
