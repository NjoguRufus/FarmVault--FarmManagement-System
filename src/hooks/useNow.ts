import { useEffect, useState } from 'react';

/**
 * Reactive clock for time-based UI (e.g. trial expiry).
 * Updates every `tickMs` (default: 60s) to refresh computed status badges.
 */
export function useNow(tickMs: number = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), Math.max(5_000, tickMs));
    return () => window.clearInterval(id);
  }, [tickMs]);

  return now;
}

