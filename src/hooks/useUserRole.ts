import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import type { Employee } from '@/types';
import { db } from '@/lib/db';
import { EMPLOYEES_SELECT } from '@/lib/employees/employeesColumns';
import { mapEmployeeFromSupabaseRow } from '@/lib/employees/mapEmployeeFromSupabaseRow';
import {
  type CanonicalEmployeeRole,
  isCompanyAdminAppUser,
  mapEmployeeRoleToCanonical,
} from '@/lib/roles/canonicalEmployeeRole';

export type AppEntryCompany = {
  id: string;
  onboarding_completed: boolean | null;
};

export type UseUserRoleResult = {
  role: CanonicalEmployeeRole | null;
  loading: boolean;
  companyId: string | null;
  company: AppEntryCompany | null;
  employee: Employee | null;
};

/**
 * Role gate: loads `public.employees` (by `clerk_user_id`) and `core.companies` (onboarding flag)
 * from Supabase. Company-admin/developer sessions resolve as ADMIN without an employee row.
 */
export function useUserRole(): UseUserRoleResult {
  const { user, authReady, isDeveloper } = useAuth();
  const companyId = user?.companyId ?? null;
  const isCompanyAdmin = Boolean(user && isCompanyAdminAppUser(user));
  const skipEmployeeFetch = Boolean(
    !user?.id || isDeveloper || user.role === 'developer' || isCompanyAdmin,
  );

  const companyQuery = useQuery({
    queryKey: ['app-entry-company', companyId],
    enabled: authReady && Boolean(companyId),
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<AppEntryCompany | null> => {
      const { data, error } = await db
        .core()
        .from('companies')
        .select('id, onboarding_completed')
        .eq('id', companyId as string)
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) return null;
      return {
        id: String(data.id),
        onboarding_completed:
          data.onboarding_completed === null || data.onboarding_completed === undefined
            ? null
            : Boolean(data.onboarding_completed),
      };
    },
  });

  const employeeQuery = useQuery({
    queryKey: ['app-entry-employee', user?.id],
    enabled: authReady && Boolean(user?.id) && !skipEmployeeFetch,
    staleTime: 60_000,
    retry: 1,
    queryFn: async (): Promise<Employee | null> => {
      const { data, error } = await db
        .public()
        .from('employees')
        .select(EMPLOYEES_SELECT)
        .eq('clerk_user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
      if (!row) return null;
      return mapEmployeeFromSupabaseRow(row as Record<string, unknown>);
    },
  });

  return useMemo((): UseUserRoleResult => {
    if (!authReady) {
      return { role: null, loading: true, companyId: null, company: null, employee: null };
    }

    if (!user) {
      return { role: null, loading: false, companyId: null, company: null, employee: null };
    }

    // Company row is informational for app entry; do not block routing on it (RLS/network can hang or 403).
    const employeeLoading = !skipEmployeeFetch && employeeQuery.isPending;
    const loading = employeeLoading;

    const company = companyQuery.data ?? null;

    if (isDeveloper || user.role === 'developer') {
      return {
        role: 'ADMIN',
        loading,
        companyId,
        company,
        employee: null,
      };
    }

    if (isCompanyAdmin) {
      return {
        role: 'ADMIN',
        loading,
        companyId,
        company,
        employee: null,
      };
    }

    const employee = employeeQuery.data ?? null;
    const raw = employee?.employeeRole ?? employee?.role;
    const role = employee ? mapEmployeeRoleToCanonical(raw) : null;

    return {
      role,
      loading,
      companyId: employee?.companyId ?? companyId,
      company,
      employee,
    };
  }, [
    authReady,
    user,
    companyId,
    isDeveloper,
    isCompanyAdmin,
    skipEmployeeFetch,
    companyQuery.data,
    employeeQuery.data,
    employeeQuery.isPending,
  ]);
}
