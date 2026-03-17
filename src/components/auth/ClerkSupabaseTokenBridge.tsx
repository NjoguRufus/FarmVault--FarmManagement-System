/**
 * Ensures the Supabase client gets the Clerk session token from React (useAuth),
 * so auth.jwt() is set in Supabase and RLS policies like current_clerk_id() work.
 * Must be mounted inside ClerkProvider.
 */
import { useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { setClerkTokenGetter } from '@/lib/supabase';

export function ClerkSupabaseTokenBridge() {
  const { getToken } = useAuth();

  useEffect(() => {
    if (!getToken) {
      setClerkTokenGetter(null);
      return;
    }
    setClerkTokenGetter(async () => {
      try {
        const token = await getToken({ template: 'supabase' });
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log('[ClerkSupabaseTokenBridge] getToken(supabase) result length', token ? token.length : 0);
        }
        return token ?? null;
      } catch (err) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[ClerkSupabaseTokenBridge] getToken(supabase) failed', err);
        }
        return null;
      }
    });
    return () => setClerkTokenGetter(null);
  }, [getToken]);

  return null;
}
