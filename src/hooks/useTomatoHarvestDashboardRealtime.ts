import { useEffect, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Invalidate dashboard + analytics + tomato list caches when tomato harvest data changes (multi-tab / multi-user).
 */
export function useTomatoHarvestDashboardRealtime(
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
      void qc.invalidateQueries({ queryKey: ['tomato-dashboard-totals', cid] });
      void qc.invalidateQueries({ queryKey: ['tomato-harvest-sessions', cid] });
      void qc.invalidateQueries({ queryKey: ['tomato-harvest-session', cid] });
      void qc.invalidateQueries({ queryKey: ['farm-analytics'] });
      void qc.invalidateQueries({ queryKey: ['dashboard-expenses-supa', cid] });
      void qc.invalidateQueries({ queryKey: ['dashboard-expenses'], exact: false });
      void qc.invalidateQueries({ queryKey: ['financeExpenses'], exact: false });
      void qc.invalidateQueries({ queryKey: ['tomato-custom-markets', cid] });
      void qc.invalidateQueries({ queryKey: ['broker-tomato-dispatches'], exact: false });
      void qc.invalidateQueries({ queryKey: ['broker-tomato-dispatch'], exact: false });
      void qc.invalidateQueries({ queryKey: ['broker-tomato-sales'], exact: false });
      void qc.invalidateQueries({ queryKey: ['broker-tomato-expenses'], exact: false });
      void qc.invalidateQueries({ queryKey: ['broker-tomato-crates-sold'], exact: false });
    };

    const channel = supabase
      .channel(`tomato-dashboard:${cid}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'tomato_harvest_sessions',
          filter: `company_id=eq.${cid}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'tomato_harvest_picker_logs',
          filter: `company_id=eq.${cid}`,
        },
        invalidate,
      )
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
          table: 'tomato_custom_markets',
          filter: `company_id=eq.${cid}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'finance',
          table: 'expenses',
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
