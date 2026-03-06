import {
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
} from '@/lib/firestore-stub';

type WithCacheOptions = {
  /** When true, try cache first before hitting the server. Default: false (server first). */
  preferCache?: boolean;
};

function isOfflineLikeError(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code ?? '').toLowerCase();
  const message = String((error as { message?: string } | null)?.message ?? '').toLowerCase();
  if (!code && !message) return false;
  return (
    code === 'unavailable' ||
    code === 'failed-precondition' ||
    message.includes('offline') ||
    message.includes('unavailable') ||
    message.includes('network request failed') ||
    message.includes('failed to get') ||
    message.includes('client is offline')
  );
}

/**
 * getDoc with offline fallback.
 * - Server first; on offline/unavailable errors falls back to getDocFromCache.
 * - If both fail, rethrows the original error so callers can keep previous UI state.
 */
export async function getDocWithCache<T = DocumentData>(
  ref: DocumentReference<T>,
  opts?: WithCacheOptions,
): Promise<DocumentSnapshot<T>> {
  if (opts?.preferCache) {
    try {
      return await getDocFromCache(ref);
    } catch {
      // Fall through to server attempt.
    }
  }

  try {
    return await getDoc(ref);
  } catch (err) {
    if (!isOfflineLikeError(err)) {
      throw err;
    }
    // Try cache on offline-like errors.
    return await getDocFromCache(ref);
  }
}

/**
 * getDocs with offline fallback.
 * - Server first; on offline/unavailable errors falls back to getDocsFromCache.
 * - If both fail, rethrows so callers can keep last known list in state/React Query.
 */
export async function getDocsWithCache<T = DocumentData>(
  q: Query<T>,
  opts?: WithCacheOptions,
): Promise<QuerySnapshot<T>> {
  if (opts?.preferCache) {
    try {
      return await getDocsFromCache(q);
    } catch {
      // Fall through to server attempt.
    }
  }

  try {
    return await getDocs(q);
  } catch (err) {
    if (!isOfflineLikeError(err)) {
      throw err;
    }
    return await getDocsFromCache(q);
  }
}

