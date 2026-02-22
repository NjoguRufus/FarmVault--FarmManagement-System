import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

type ConnectivityStatus = 'online' | 'offline' | 'syncing';

interface ConnectivityContextValue {
  status: ConnectivityStatus;
  isOnline: boolean;
  isSyncing: boolean;
  hasPendingWrites: boolean;
  fromCache: boolean;
}

const ConnectivityContext = createContext<ConnectivityContextValue | undefined>(undefined);

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, authReady, user } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [hasPendingWrites, setHasPendingWrites] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const hasShownOfflineToastRef = useRef(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOnline) {
      if (!hasShownOfflineToastRef.current) {
        toast({
          title: "You're offline",
          description: 'Changes will sync automatically.',
        });
        hasShownOfflineToastRef.current = true;
      }
      return;
    }

    if (hasShownOfflineToastRef.current) {
      toast({
        title: 'Back online',
        description: 'Pending changes are syncing.',
      });
      hasShownOfflineToastRef.current = false;
    }
  }, [isOnline]);

  useEffect(() => {
    const isDeveloper = user?.role === 'developer';
    const companyId = user?.companyId ?? null;
    const canProbeProjects = authReady && isAuthenticated && (isDeveloper || !!companyId);

    if (!canProbeProjects) {
      setHasPendingWrites(false);
      setFromCache(false);
      return;
    }

    // Single lightweight listener for metadata-only sync state.
    const syncProbeQuery = isDeveloper
      ? query(collection(db, 'projects'), limit(1))
      : query(collection(db, 'projects'), where('companyId', '==', companyId), limit(1));

    const unsub = onSnapshot(
      syncProbeQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        setHasPendingWrites(snapshot.metadata.hasPendingWrites);
        setFromCache(snapshot.metadata.fromCache);
      },
      (error) => {
        console.warn('[connectivity] Sync probe listener unavailable:', error);
        setHasPendingWrites(false);
      }
    );

    return () => unsub();
  }, [authReady, isAuthenticated, user?.companyId, user?.role]);

  const value = useMemo<ConnectivityContextValue>(() => {
    const isSyncing = isOnline && hasPendingWrites;
    const status: ConnectivityStatus = isOnline ? (isSyncing ? 'syncing' : 'online') : 'offline';

    return {
      status,
      isOnline,
      isSyncing,
      hasPendingWrites,
      fromCache,
    };
  }, [fromCache, hasPendingWrites, isOnline]);

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivityStatus() {
  const context = useContext(ConnectivityContext);
  if (!context) {
    throw new Error('useConnectivityStatus must be used within ConnectivityProvider');
  }
  return context;
}

