import { useEffect, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { debounce } from '@/lib/debounce';

const INVALIDATION_DEBOUNCE_MS = 1100;

/**
 * Realtime: broker notebook + dispatch totals → React Query.
 * Debounced so burst writes (sales lines, expenses) do not refetch the same graphs dozens of times per second.
 */
export function useBrokerTomatoRealtime(
  companyId: string | null | undefined,
  queryClient: QueryClient,
): void {
  const qcRef = useRef(queryClient);
  qcRef.current = queryClient;

  useEffect(() => {
    const cid = companyId?.trim();
    if (!cid) return;

    const scheduleInvalidate = debounce(() => {
      const qc = qcRef.current;
      void qc.invalidateQueries({ queryKey: ['broker-assigned-dispatches', cid] });
      void qc.invalidateQueries({ queryKey: ['broker-tomato-dispatches', cid] });
      void qc.invalidateQueries({ queryKey: ['broker-tomato-dispatch'], exact: false });
      void qc.invalidateQueries({ queryKey: ['broker-tomato-sales'], exact: false });
      void qc.invalidateQueries({ queryKey: ['broker-tomato-expenses'], exact: false });
      void qc.invalidateQueries({ queryKey: ['broker-tomato-market-expenses', cid] });
      void qc.invalidateQueries({ queryKey: ['broker-tomato-templates', cid] });
      void qc.invalidateQueries({ queryKey: ['broker-fallback-dispatch'], exact: false });
      void qc.invalidateQueries({ queryKey: ['broker-fallback-sales'], exact: false });
      void qc.invalidateQueries({ queryKey: ['broker-fallback-expenses'], exact: false });
      void qc.invalidateQueries({ queryKey: ['broker-fallback-templates', cid] });
      void qc.invalidateQueries({ queryKey: ['tomato-harvest-dispatch', cid] });
      void qc.invalidateQueries({ queryKey: ['tomato-market-notebook-sales'], exact: false });
      void qc.invalidateQueries({ queryKey: ['tomato-market-notebook-expenses'], exact: false });
      void qc.invalidateQueries({ queryKey: ['tomato-dashboard-totals', cid] });
      void qc.invalidateQueries({ queryKey: ['tomato-harvest-sessions', cid] });
      void qc.invalidateQueries({ queryKey: ['tomato-harvest-session', cid] });
    }, INVALIDATION_DEBOUNCE_MS);

    const channel = supabase
      .channel(`broker-tomato:${cid}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'tomato_market_dispatches',
          filter: `company_id=eq.${cid}`,
        },
        () => scheduleInvalidate(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'tomato_market_sales_entries',
          filter: `company_id=eq.${cid}`,
        },
        () => scheduleInvalidate(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'tomato_market_expense_lines',
          filter: `company_id=eq.${cid}`,
        },
        () => scheduleInvalidate(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'fallback_market_dispatches',
          filter: `company_id=eq.${cid}`,
        },
        () => scheduleInvalidate(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'fallback_market_sales_entries',
          filter: `company_id=eq.${cid}`,
        },
        () => scheduleInvalidate(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'fallback_market_expense_lines',
          filter: `company_id=eq.${cid}`,
        },
        () => scheduleInvalidate(),
      )
      .subscribe();

    return () => {
      scheduleInvalidate.cancel();
      void supabase.removeChannel(channel);
    };
  }, [companyId]);
}
