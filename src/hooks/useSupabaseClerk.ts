/**
 * Returns a Supabase client that injects the current Clerk JWT on every request.
 * Uses Clerk JWT template `supabase` (see CLERK_JWT_TEMPLATE_SUPABASE).
 */
import { useMemo } from 'react';
import { useAuth } from '@clerk/react';
import { CLERK_JWT_TEMPLATE_SUPABASE } from '@/lib/supabase';
import { createSupabaseClientWithClerkToken } from '@/lib/supabase/client';

export function useSupabaseClerk() {
  const { getToken } = useAuth();

  const supabase = useMemo(() => {
    return createSupabaseClientWithClerkToken(async () => {
      try {
        const token = await getToken({ template: CLERK_JWT_TEMPLATE_SUPABASE });
        return token ?? null;
      } catch {
        return null;
      }
    });
  }, [getToken]);

  return supabase;
}
