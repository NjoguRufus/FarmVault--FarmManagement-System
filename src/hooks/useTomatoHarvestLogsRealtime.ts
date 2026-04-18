import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Subscribes to INSERT/DELETE on tomato picker bucket logs for a session (multi-device tally sync).
 */
export function useTomatoHarvestLogsRealtime(
  sessionId: string | null | undefined,
  onChange: () => void,
): void {
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (!sessionId) return;

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
        () => {
          cbRef.current();
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'harvest',
          table: 'tomato_harvest_picker_logs',
          filter: `harvest_session_id=eq.${sessionId}`,
        },
        () => {
          cbRef.current();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'tomato_harvest_sessions',
          filter: `id=eq.${sessionId}`,
        },
        () => {
          cbRef.current();
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'harvest',
          table: 'tomato_market_dispatches',
          filter: `harvest_session_id=eq.${sessionId}`,
        },
        () => {
          cbRef.current();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId]);
}
