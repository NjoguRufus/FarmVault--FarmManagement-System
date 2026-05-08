import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getConnectivityState,
  subscribeConnectivity,
  isBrowserOnline,
  type ConnectivityState,
} from '@/lib/sync/connectivityManager';

const DEFAULT_STATE: ConnectivityState = {
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
};

/**
 * Returns live connectivity + sync state.
 * companyId is required to compute pending/failed counts.
 */
export function useConnectivity(companyId?: string | null): ConnectivityState {
  const [state, setState] = useState<ConnectivityState>(() => ({
    ...DEFAULT_STATE,
    isOnline: isBrowserOnline(),
  }));

  const cidRef = useRef(companyId);
  cidRef.current = companyId;

  const refresh = useCallback(async () => {
    const next = await getConnectivityState(cidRef.current);
    setState(next);
  }, []);

  useEffect(() => {
    void refresh();
    const unsub = subscribeConnectivity(() => void refresh());
    return unsub;
  }, [refresh]);

  // Re-fetch counts when companyId changes
  useEffect(() => {
    void refresh();
  }, [companyId, refresh]);

  return state;
}

/** Lightweight hook — just online/offline, no async counts. */
export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState(isBrowserOnline);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return isOnline;
}
