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
} from '@/lib/documentLayer';

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
 * getDoc with offline fallback (legacy). Prefer Supabase + React Query.
 */
export async function getDocWithCache<T = DocumentData>(
  ref: DocumentReference<T>,
  opts?: WithCacheOptions,
): Promise<DocumentSnapshot<T>> {
  if (opts?.preferCache) {
    try {
      return (await getDocFromCache(ref)) as DocumentSnapshot<T>;
    } catch {
      // Fall through to server attempt.
    }
  }

  try {
    return (await getDoc(ref)) as DocumentSnapshot<T>;
  } catch (err) {
    if (!isOfflineLikeError(err)) {
      throw err;
    }
    return (await getDocFromCache(ref)) as DocumentSnapshot<T>;
  }
}

/**
 * getDocs with offline fallback (legacy). Prefer Supabase + React Query.
 */
export async function getDocsWithCache<T = DocumentData>(
  q: Query<T>,
  opts?: WithCacheOptions,
): Promise<QuerySnapshot<T>> {
  if (opts?.preferCache) {
    try {
      return (await getDocsFromCache(q)) as QuerySnapshot<T>;
    } catch {
      // Fall through to server attempt.
    }
  }

  try {
    return (await getDocs(q)) as QuerySnapshot<T>;
  } catch (err) {
    if (!isOfflineLikeError(err)) {
      throw err;
    }
    return (await getDocsFromCache(q)) as QuerySnapshot<T>;
  }
}
