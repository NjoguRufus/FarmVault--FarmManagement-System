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
        // Use default session token (no template). Only use template if you created "supabase" in Clerk Dashboard → JWT Templates.)
        return (await getToken()) ?? null;
      } catch {
        return null;
      }
    });
    return () => setClerkTokenGetter(null);
  }, [getToken]);

  return null;
}
