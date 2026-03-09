/**
 * Returns a Supabase client that injects the current Clerk session token on every request.
 * Use for data access; never use supabase.auth (identity comes from Clerk only).
 */
import { useMemo } from 'react';
import { useAuth } from '@clerk/react';
import { createSupabaseClientWithClerkToken } from '@/lib/supabase/client';

export function useSupabaseClerk() {
  const { getToken } = useAuth();

  const supabase = useMemo(() => {
    return createSupabaseClientWithClerkToken(async () => {
      try {
        const token = await getToken();
        return token ?? null;
      } catch {
        return null;
      }
    });
  }, [getToken]);

  return supabase;
}
