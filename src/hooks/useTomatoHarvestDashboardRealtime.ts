import { useEffect, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { debounce } from '@/lib/debounce';

/**
 * High-frequency tomato_harvest_picker_logs rows must NOT fan out into analytics / broker refetches
 * (each log row would otherwise trigger multiple heavy RPCs via React Query invalidation).
 */
const PICKER_LOG_DEBOUNCE_MS = 900;
const SESSION_DEBOUNCE_MS = 1600;

function invalidatePickerHeavyViews(qc: QueryClient, cid: string) {
  void qc.invalidateQueries({ queryKey: ['tomato-dashboard-summary', cid] });
  void qc.invalidateQueries({ queryKey: ['tomato-harvest-sessions', cid] });
  void qc.invalidateQueries({ queryKey: ['tomato-harvest-session', cid] });
  void qc.invalidateQueries({ queryKey: ['tomato-session-summary', cid], exact: false });
}

function invalidateSessionScopedCaches(qc: QueryClient, cid: string) {
  invalidatePickerHeavyViews(qc, cid);
  void qc.invalidateQueries({ queryKey: ['dashboard-expenses-supa', cid] });
  void qc.invalidateQueries({ queryKey: ['dashboard-expenses'], exact: false });
  void qc.invalidateQueries({ queryKey: ['financeExpenses'], exact: false });
  void qc.invalidateQueries({ queryKey: ['tomato-custom-markets', cid] });
  void qc.invalidateQueries({ queryKey: ['broker-tomato-dispatches'], exact: false });
  void qc.invalidateQueries({ queryKey: ['broker-tomato-dispatch'], exact: false });
  void qc.invalidateQueries({ queryKey: ['broker-tomato-sales'], exact: false });
  void qc.invalidateQueries({ queryKey: ['broker-tomato-expenses'], exact: false });
  void qc.invalidateQueries({ queryKey: ['broker-tomato-crates-sold'], exact: false });
}

/**
 * Invalidate dashboard + tomato list caches when tomato harvest data changes (multi-tab / multi-user).
 * Intentionally does NOT touch `farm-analytics` — Reports page uses a long stale cache + manual refetch.
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

    const onPickerBurst = debounce(() => {
      invalidatePickerHeavyViews(qcRef.current, cid);
    }, PICKER_LOG_DEBOUNCE_MS);

    const onSessionScopedBurst = debounce(() => {
      invalidateSessionScopedCaches(qcRef.current, cid);
    }, SESSION_DEBOUNCE_MS);

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
        () => onSessionScopedBurst(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'tomato_harvest_picker_logs',
          filter: `company_id=eq.${cid}`,
        },
        () => onPickerBurst(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'tomato_market_dispatches',
          filter: `company_id=eq.${cid}`,
        },
        () => onSessionScopedBurst(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'tomato_market_sales_entries',
          filter: `company_id=eq.${cid}`,
        },
        () => onSessionScopedBurst(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'tomato_market_expense_lines',
          filter: `company_id=eq.${cid}`,
        },
        () => onSessionScopedBurst(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'tomato_custom_markets',
          filter: `company_id=eq.${cid}`,
        },
        () => onSessionScopedBurst(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'finance',
          table: 'expenses',
          filter: `company_id=eq.${cid}`,
        },
        () => onSessionScopedBurst(),
      )
      .subscribe();

    return () => {
      onPickerBurst.cancel();
      onSessionScopedBurst.cancel();
      void supabase.removeChannel(channel);
    };
  }, [companyId]);
}
