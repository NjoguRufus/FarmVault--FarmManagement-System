/**
 * Loads the current employee for the Clerk user and active company via get_employee_by_clerk_and_company.
 * Identity from Clerk only; Supabase for data only.
 */
import { useAuth } from '@clerk/react';
import { useQuery } from '@tanstack/react-query';
import { useActiveCompany } from '@/hooks/useActiveCompany';
import { supabase } from '@/lib/supabase';

export interface CurrentEmployeeRow {
  id: string;
  company_id: string;
  clerk_user_id: string | null;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  department: string | null;
  permission_preset: string | null;
  permissions: Record<string, boolean> | null;
  status: string;
  created_at: string;
}

export function useCurrentEmployee() {
  const { userId } = useAuth();
  const { activeCompanyId } = useActiveCompany();

  const { data: employee, isLoading, error } = useQuery({
    queryKey: ['currentEmployee', userId, activeCompanyId],
    queryFn: async (): Promise<CurrentEmployeeRow | null> => {
      if (!userId || !activeCompanyId) return null;
      const { data, error: err } = await supabase.rpc('get_employee_by_clerk_and_company', {
        p_clerk_user_id: userId,
        p_company_id: activeCompanyId,
      });
      if (err) throw err;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return null;
      return {
        id: String(row.id),
        company_id: String(row.company_id),
        clerk_user_id: row.clerk_user_id != null ? String(row.clerk_user_id) : null,
        email: row.email != null ? String(row.email) : null,
        full_name: row.full_name != null ? String(row.full_name) : null,
        phone: row.phone != null ? String(row.phone) : null,
        role: row.role != null ? String(row.role) : null,
        department: row.department != null ? String(row.department) : null,
        permission_preset: row.permission_preset != null ? String(row.permission_preset) : null,
        permissions: (row.permissions as Record<string, boolean>) ?? null,
        status: String(row.status ?? 'active'),
        created_at: String(row.created_at),
      };
    },
    enabled: Boolean(userId && activeCompanyId),
  });

  return { employee: employee ?? null, isLoading, error };
}
