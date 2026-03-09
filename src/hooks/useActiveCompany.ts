/**
 * Resolves the active company for the current Clerk user from profiles.active_company_id.
 * Identity from Clerk only; Supabase for data only.
 */
import { useAuth } from '@clerk/react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';

export function useActiveCompany() {
  const { userId } = useAuth();

  const { data: activeCompanyId, isLoading, error } = useQuery({
    queryKey: ['activeCompany', userId],
    queryFn: async (): Promise<string | null> => {
      if (!userId) return null;
      const { data, error: err } = await db
        .core()
        .from('profiles')
        .select('active_company_id')
        .eq('clerk_user_id', userId)
        .maybeSingle();
      if (err) throw err;
      const id = data?.active_company_id;
      return id != null ? String(id) : null;
    },
    enabled: Boolean(userId),
  });

  return { activeCompanyId: activeCompanyId ?? null, isLoading, error };
}
