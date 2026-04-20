import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { debounce } from '@/lib/debounce';

const NOTIFY_DEBOUNCE_MS = 400;

/**
 * Subscribes to INSERT/DELETE on tomato picker bucket logs for a session (multi-device tally sync).
 * Debounces UI refetch so rapid bucket taps do not enqueue one network round-trip per log row.
 */
export function useTomatoHarvestLogsRealtime(
  sessionId: string | null | undefined,
  onChange: () => void,
): void {
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (!sessionId) return;

    const notify = debounce(() => {
      cbRef.current();
    }, NOTIFY_DEBOUNCE_MS);

    const channel = supabase
      .channel(`tomato-harvest-logs:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'harvest',
          table: 'tomato_harvest_picker_logs',
          filter: `harvest_session_id=eq.${sessionId}`,
        },
        () => notify(),
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'harvest',
          table: 'tomato_harvest_picker_logs',
          filter: `harvest_session_id=eq.${sessionId}`,
        },
        () => notify(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'tomato_harvest_sessions',
          filter: `id=eq.${sessionId}`,
        },
        () => notify(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'tomato_market_dispatches',
          filter: `harvest_session_id=eq.${sessionId}`,
        },
        () => notify(),
      )
      .subscribe();

    return () => {
      notify.cancel();
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);
}
