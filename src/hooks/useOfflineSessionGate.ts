import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { readCachedClerkSession } from '@/lib/localData/clerkSessionCache';

/**
 * When offline: the app is usable if Clerk still reports a session OR a previous session
 * cached a Supabase-scoped JWT (e.g. after a successful online sign-in on this device).
 * First-time sign-in without network cannot complete — Clerk must reach its servers.
 */
export function useOfflineSessionGate() {
  const { isLoaded, isSignedIn } = useAuth();
  const [cachedOk, setCachedOk] = useState(true);

  useEffect(() => {
    if (typeof navigator === 'undefined' || navigator.onLine) {
      setCachedOk(true);
      return;
    }
    if (isSignedIn) {
      setCachedOk(true);
      return;
    }
    void readCachedClerkSession().then((c) => setCachedOk(Boolean(c?.userId && c?.supabaseJwt)));
  }, [isSignedIn]);

  const online = typeof navigator === 'undefined' || navigator.onLine;
  if (!isLoaded) {
    return { isReady: false, isBlocked: false, message: null as string | null };
  }
  if (online || isSignedIn) {
    return { isReady: true, isBlocked: false, message: null as string | null };
  }
  if (cachedOk) {
    return { isReady: true, isBlocked: false, message: null as string | null };
  }
  return {
    isReady: true,
    isBlocked: true,
    message: 'Internet is required to sign in. Once you have signed in on this device, you can work offline.',
  };
}

export async function canUseAppOfflineWithCachedClerkSession(): Promise<boolean> {
  if (typeof navigator === 'undefined' || navigator.onLine) return true;
  const c = await readCachedClerkSession();
  return Boolean(c?.userId && c.supabaseJwt);
}
