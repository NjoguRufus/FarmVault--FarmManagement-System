import { useEffect, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Realtime: broker notebook + dispatch totals → React Query + admin tomato caches.
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

    const invalidate = () => {
      const qc = qcRef.current;
      void qc.invalidateQueries({ queryKey: ['broker-tomato-dispatches', cid] });
      void qc.invalidateQueries({ queryKey: ['broker-tomato-dispatch'], exact: false });
      void qc.invalidateQueries({ queryKey: ['broker-tomato-sales'], exact: false });
      void qc.invalidateQueries({ queryKey: ['broker-tomato-expenses'], exact: false });
      void qc.invalidateQueries({ queryKey: ['broker-tomato-market-expenses', cid] });
      void qc.invalidateQueries({ queryKey: ['broker-tomato-templates', cid] });
      void qc.invalidateQueries({ queryKey: ['tomato-harvest-dispatch', cid] });
      void qc.invalidateQueries({ queryKey: ['tomato-dashboard-totals', cid] });
      void qc.invalidateQueries({ queryKey: ['tomato-harvest-sessions', cid] });
      void qc.invalidateQueries({ queryKey: ['tomato-harvest-session', cid] });
      void qc.invalidateQueries({ queryKey: ['farm-analytics'] });
    };

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
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'tomato_market_sales_entries',
          filter: `company_id=eq.${cid}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'tomato_market_expense_lines',
          filter: `company_id=eq.${cid}`,
        },
        invalidate,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [companyId]);
}
