import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { debounce } from '@/lib/debounce';

const INVALIDATION_DEBOUNCE_MS = 1200;

/**
 * Realtime invalidation for fallback harvest engine.
 * Debounced: one user action can touch several tables in quick succession.
 */
export function useFallbackHarvestRealtime(params: { companyId: string | null; projectId?: string | null }) {
  const qc = useQueryClient();
  const cid = params.companyId;

  useEffect(() => {
    if (!cid) return;

    const flush = debounce(() => {
      void qc.invalidateQueries({ queryKey: ['fallback-harvest-sessions'], exact: false });
      void qc.invalidateQueries({ queryKey: ['fallback-harvest-session'], exact: false });
      void qc.invalidateQueries({ queryKey: ['fallback-session-summary', cid], exact: false });
      void qc.invalidateQueries({ queryKey: ['fallback-dashboard-summary', cid], exact: false });
      void qc.invalidateQueries({ queryKey: ['reports'], exact: false });
      void qc.invalidateQueries({ queryKey: ['fallback-market-dispatch'], exact: false });
      void qc.invalidateQueries({ queryKey: ['fallback-market-sales'], exact: false });
      void qc.invalidateQueries({ queryKey: ['fallback-market-expenses'], exact: false });
      void qc.invalidateQueries({ queryKey: ['expenses'], exact: false });
    }, INVALIDATION_DEBOUNCE_MS);

    const channel = supabase
      .channel(`realtime:fallback-harvest:${cid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'harvest', table: 'fallback_harvest_sessions', filter: `company_id=eq.${cid}` },
        () => flush(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'harvest', table: 'fallback_market_dispatches', filter: `company_id=eq.${cid}` },
        () => flush(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'harvest', table: 'fallback_market_sales_entries', filter: `company_id=eq.${cid}` },
        () => flush(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'harvest', table: 'fallback_market_expense_lines', filter: `company_id=eq.${cid}` },
        () => flush(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'harvest', table: 'fallback_harvest_units', filter: `company_id=eq.${cid}` },
        () => flush(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'harvest', table: 'fallback_session_pickers', filter: `company_id=eq.${cid}` },
        () => flush(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'harvest', table: 'fallback_session_picker_logs', filter: `company_id=eq.${cid}` },
        () => flush(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'finance', table: 'expense_links', filter: `company_id=eq.${cid}` },
        () => flush(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'finance', table: 'expenses', filter: `company_id=eq.${cid}` },
        () => flush(),
      )
      .subscribe();

    return () => {
      flush.cancel();
      void supabase.removeChannel(channel);
    };
  }, [qc, cid]);
}
