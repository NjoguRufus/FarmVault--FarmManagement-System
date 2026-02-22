import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, type QueryConstraint } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from '@/hooks/use-toast';

const offlineUnavailableToastByPath = new Set<string>();

export type UseCollectionOptions = {
  /** Deprecated: polling is ignored; realtime snapshots drive updates. */
  refetchInterval?: number;
  enabled?: boolean;
  constraints?: QueryConstraint[];
};

export type UseCollectionResult<T> = {
  data: T[];
  isLoading: boolean;
  error: Error | null;
  fromCache: boolean;
  hasPendingWrites: boolean;
};

export function useCollection<T = any>(
  key: string,
  path: string,
  options?: UseCollectionOptions
): UseCollectionResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(options?.enabled ?? true);
  const [error, setError] = useState<Error | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [hasPendingWrites, setHasPendingWrites] = useState(false);

  useEffect(() => {
    if (options?.enabled === false) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const source = options?.constraints?.length
      ? query(collection(db, path), ...options.constraints)
      : collection(db, path);

    const unsub = onSnapshot(
      source,
      { includeMetadataChanges: true },
      (snap) => {
        setData(
          snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
            pending: docSnap.metadata.hasPendingWrites,
            fromCache: snap.metadata.fromCache,
          })) as T[]
        );
        setFromCache(snap.metadata.fromCache);
        setHasPendingWrites(snap.metadata.hasPendingWrites);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error(`[useCollection] Snapshot error for ${path} (key: ${key}):`, err);
        // Preserve last known data on errors/offline.
        setIsLoading(false);
        setError(err);
        if (typeof navigator !== 'undefined' && !navigator.onLine && !offlineUnavailableToastByPath.has(path)) {
          offlineUnavailableToastByPath.add(path);
          toast({
            title: 'Offline data unavailable',
            description: "This data isn't available offline yet.",
          });
        }
      }
    );

    return () => unsub();
  }, [key, path, options?.enabled, options?.constraints]);

  return {
    data,
    isLoading,
    error,
    fromCache,
    hasPendingWrites,
  };
}
