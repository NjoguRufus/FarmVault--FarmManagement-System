import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { toast } from '@/hooks/use-toast';
import {
  getPendingCount,
  getIsSyncing,
  syncQueue,
  resetOfflineRetrySchedule,
  OFFLINE_QUEUE_CHANGE_EVENT,
} from '@/lib/offlineQueue';
import { getLocalSyncQueuePendingCount } from '@/lib/localData/localSyncQueue';
import { LOCAL_SYNC_STATE_EVENT } from '@/lib/localData/types';
import { runLocalDataSyncEngine, getIsLocalDataSyncRunning } from '@/lib/localData/syncEngine';

type ConnectivityStatus = 'online' | 'offline' | 'syncing' | 'sync_failed';

interface ConnectivityContextValue {
  status: ConnectivityStatus;
  isOnline: boolean;
  isSyncing: boolean;
  hasPendingWrites: boolean;
  /** Unsynced items: legacy harvest queue + local-first sync queue. */
  pendingCount: number;
  /** True after a sync run that had one or more failures (retry available). */
  lastSyncFailed: boolean;
  fromCache: boolean;
  /** Run offline queue sync (harvest intake/payment/wallet). */
  triggerSync: () => Promise<{ synced: number; failed: number }>;
}

const ConnectivityContext = createContext<ConnectivityContextValue | undefined>(undefined);

function refreshPendingAndSyncing(
  setHasPendingWrites: (v: boolean) => void,
  setPendingCount: (n: number) => void,
  setIsSyncing: (v: boolean) => void
) {
  void Promise.all([getPendingCount(), getLocalSyncQueuePendingCount()]).then(([harvest, local]) => {
    const n = harvest + local;
    setHasPendingWrites(n > 0);
    setPendingCount(n);
  });
  setIsSyncing(getIsSyncing() || getIsLocalDataSyncRunning());
}

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [hasPendingWrites, setHasPendingWrites] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncFailed, setLastSyncFailed] = useState(false);
  const [isSyncingState, setIsSyncingState] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const hasShownOfflineToastRef = useRef(false);

  const refresh = useCallback(() => {
    refreshPendingAndSyncing(setHasPendingWrites, setPendingCount, setIsSyncingState);
  }, []);

  const triggerSync = useCallback(async () => {
    const [harvest, local] = await Promise.all([syncQueue(), runLocalDataSyncEngine(null)]);
    setLastSyncFailed(harvest.failed > 0 || local.failed > 0);
    refresh();
    return { synced: harvest.synced + local.processed, failed: harvest.failed + local.failed };
  }, [refresh]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void (async () => {
        await resetOfflineRetrySchedule();
        const r = await syncQueue();
        const l = await runLocalDataSyncEngine(null);
        setLastSyncFailed(r.failed > 0 || l.failed > 0);
        refresh();
      })();
    };
    const handleOffline = () => setIsOnline(false);

    const onVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        void Promise.all([syncQueue(), runLocalDataSyncEngine(null)]).then(([r, l]) => {
          setLastSyncFailed(r.failed > 0 || l.failed > 0);
          refresh();
        });
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    refresh();
    const onQueueChange = () => refresh();
    window.addEventListener(OFFLINE_QUEUE_CHANGE_EVENT, onQueueChange);
    window.addEventListener(LOCAL_SYNC_STATE_EVENT, onQueueChange);
    return () => {
      window.removeEventListener(OFFLINE_QUEUE_CHANGE_EVENT, onQueueChange);
      window.removeEventListener(LOCAL_SYNC_STATE_EVENT, onQueueChange);
    };
  }, [refresh]);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      void Promise.all([syncQueue(), runLocalDataSyncEngine(null)]).then(([r, l]) => {
        setLastSyncFailed(r.failed > 0 || l.failed > 0);
        refresh();
      });
    }
  }, [refresh]);

  useEffect(() => {
    if (!isOnline) {
      if (!hasShownOfflineToastRef.current) {
        toast({
          title: "You're offline",
          description: 'Offline mode — your data will sync automatically when you reconnect.',
        });
        hasShownOfflineToastRef.current = true;
      }
      return;
    }

    if (hasShownOfflineToastRef.current) {
      toast({
        title: 'Back online',
        description: 'Syncing offline entries…',
      });
      hasShownOfflineToastRef.current = false;
    }
  }, [isOnline]);

  useEffect(() => {
    setFromCache(false);
  }, []);

  const isSyncing = isSyncingState || (isOnline && hasPendingWrites);
  const status: ConnectivityStatus =
    !isOnline ? 'offline'
    : lastSyncFailed && hasPendingWrites ? 'sync_failed'
    : isSyncing ? 'syncing'
    : 'online';
  const value = useMemo<ConnectivityContextValue>(
    () => ({
      status,
      isOnline,
      isSyncing,
      hasPendingWrites,
      pendingCount,
      lastSyncFailed,
      fromCache,
      triggerSync,
    }),
    [fromCache, hasPendingWrites, isOnline, isSyncing, lastSyncFailed, pendingCount, status, triggerSync]
  );

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivityStatus() {
  const context = useContext(ConnectivityContext);
  if (!context) {
    throw new Error('useConnectivityStatus must be used within ConnectivityProvider');
  }
  return context;
}

