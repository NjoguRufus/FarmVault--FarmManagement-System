import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy, limit, type QueryConstraint } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from '@/hooks/use-toast';
import { NO_COMPANY } from '@/hooks/useCompanyScope';

const offlineUnavailableToastByPath = new Set<string>();

export type UseCollectionOptions = {
  /** When true (default), query is scoped by companyId. Requires companyId unless isDeveloper. */
  companyScoped?: boolean;
  /** Current user's companyId. Required when companyScoped is true and user is not developer. */
  companyId?: string | null;
  /** Optional project scope. */
  projectId?: string | null;
  /** Set true for admin/developer views that load all companies (e.g. companies list). */
  isDeveloper?: boolean;
  /** Deprecated: polling is ignored; realtime snapshots drive updates. */
  refetchInterval?: number;
  enabled?: boolean;
  /** Additional Firestore constraints (applied after companyId/projectId). */
  constraints?: QueryConstraint[];
  /** Field path for orderBy (e.g. 'createdAt'). */
  orderByField?: string;
  /** 'asc' | 'desc' for orderBy. */
  orderByDirection?: 'asc' | 'desc';
  /** Max docs to return. */
  limitCount?: number;
};

export type UseCollectionResult<T> = {
  data: T[];
  isLoading: boolean;
  /** Error from snapshot, or NO_COMPANY when companyScoped but companyId missing. */
  error: Error | string | null;
  fromCache: boolean;
  hasPendingWrites: boolean;
};

function buildScopedConstraints(options: UseCollectionOptions): QueryConstraint[] {
  const {
    companyScoped = true,
    companyId,
    projectId,
    isDeveloper = false,
    constraints = [],
    orderByField,
    orderByDirection = 'desc',
    limitCount,
  } = options;

  const out: QueryConstraint[] = [];

  if (companyScoped && (companyId || isDeveloper)) {
    if (companyId) {
      out.push(where('companyId', '==', companyId));
    }
  }

  if (projectId) {
    out.push(where('projectId', '==', projectId));
  }

  out.push(...constraints);

  if (orderByField) {
    out.push(orderBy(orderByField, orderByDirection));
  }
  if (limitCount != null && limitCount > 0) {
    out.push(limit(limitCount));
  }

  return out;
}

/**
 * Realtime company-scoped collection subscription.
 * - When companyScoped is true and companyId is missing (non-developer), returns empty data and error NO_COMPANY.
 * - Query key for cache/subs: key + companyId + projectId so changing company/project resubscribes.
 */
export function useCollection<T = any>(
  key: string,
  path: string,
  options?: UseCollectionOptions
): UseCollectionResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [hasPendingWrites, setHasPendingWrites] = useState(false);

  const companyScoped = options?.companyScoped !== false;
  const companyId = options?.companyId ?? null;
  const projectId = options?.projectId ?? null;
  const isDeveloper = options?.isDeveloper === true;
  const enabled = options?.enabled !== false;

  const noCompany = companyScoped && !isDeveloper && !companyId;
  const shouldSubscribe = enabled && !noCompany;

  useEffect(() => {
    if (!enabled) {
      setData([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    if (noCompany) {
      setData([]);
      setIsLoading(false);
      setError(NO_COMPANY);
      return;
    }

    setIsLoading(true);
    setError(null);

    const constraints = buildScopedConstraints({
      ...options,
      companyId: companyId ?? undefined,
      projectId: projectId ?? undefined,
    });

    const source = constraints.length > 0
      ? query(collection(db, path), ...constraints)
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
    // Exclude options?.constraints from deps to avoid infinite loop (array reference changes every render).
    // To resubscribe when constraints change, pass a different key or memoize constraints.
  }, [
    key,
    path,
    enabled,
    noCompany,
    companyId ?? 'none',
    projectId ?? 'all',
    options?.orderByField,
    options?.orderByDirection,
    options?.limitCount,
  ]);

  return {
    data,
    isLoading,
    error,
    fromCache,
    hasPendingWrites,
  };
}
