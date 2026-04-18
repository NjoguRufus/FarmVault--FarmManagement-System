import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Realtime invalidation for fallback harvest engine.
 * Keeps Harvest UI, dashboard, and reports up to date as sessions/dispatches/expenses change.
 */
export function useFallbackHarvestRealtime(params: { companyId: string | null; projectId?: string | null }) {
  const qc = useQueryClient();
  const cid = params.companyId;
  const pid = params.projectId ?? null;

  useEffect(() => {
    if (!cid) return;
    const channel = supabase
      .channel(`realtime:fallback-harvest:${cid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'harvest', table: 'fallback_harvest_sessions', filter: `company_id=eq.${cid}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['fallback-harvest-sessions'], exact: false });
          void qc.invalidateQueries({ queryKey: ['fallback-harvest-session'], exact: false });
          void qc.invalidateQueries({ queryKey: ['reports'], exact: false });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'harvest', table: 'fallback_market_dispatches', filter: `company_id=eq.${cid}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['fallback-harvest-sessions'], exact: false });
          void qc.invalidateQueries({ queryKey: ['fallback-market-dispatch'], exact: false });
          void qc.invalidateQueries({ queryKey: ['reports'], exact: false });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'harvest', table: 'fallback_market_sales_entries', filter: `company_id=eq.${cid}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['fallback-market-sales'], exact: false });
          void qc.invalidateQueries({ queryKey: ['fallback-market-dispatch'], exact: false });
          void qc.invalidateQueries({ queryKey: ['fallback-harvest-session'], exact: false });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'harvest', table: 'fallback_market_expense_lines', filter: `company_id=eq.${cid}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['fallback-market-expenses'], exact: false });
          void qc.invalidateQueries({ queryKey: ['fallback-market-dispatch'], exact: false });
          void qc.invalidateQueries({ queryKey: ['fallback-harvest-session'], exact: false });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'finance', table: 'expense_links', filter: `company_id=eq.${cid}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['fallback-harvest-session'], exact: false });
          void qc.invalidateQueries({ queryKey: ['fallback-harvest-sessions'], exact: false });
          void qc.invalidateQueries({ queryKey: ['expenses'], exact: false });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'finance', table: 'expenses', filter: `company_id=eq.${cid}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['expenses'], exact: false });
          void qc.invalidateQueries({ queryKey: ['fallback-harvest-session'], exact: false });
        },
      )
      .subscribe();

    // project-scoped lists are optional keys; we just invalidate broadly.
    void qc.invalidateQueries({ queryKey: ['fallback-harvest-sessions', cid, pid], exact: false });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, cid, pid]);
}

