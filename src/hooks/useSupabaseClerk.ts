/**
 * Returns a Supabase client that injects the current Clerk session token on every request.
 * Use for data access; never use supabase.auth (identity comes from Clerk only).
 * 
 * IMPORTANT: ONLY uses the 'supabase' JWT template - no fallback to default Clerk tokens.
 */
import { useMemo } from 'react';
import { useAuth } from '@clerk/react';
import { createSupabaseClientWithClerkToken } from '@/lib/supabase/client';

export function useSupabaseClerk() {
  const { getToken } = useAuth();

  const supabase = useMemo(() => {
    return createSupabaseClientWithClerkToken(async () => {
      try {
        // ONLY use the 'supabase' template - NO fallback to default Clerk token
        const token = await getToken({ template: 'supabase' });
        return token ?? null;
      } catch {
        return null;
      }
    });
  }, [getToken]);

  return supabase;
}
