import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { Employee } from '@/types';
import {
  type CanonicalEmployeeRole,
  isCompanyAdminAppUser,
  mapEmployeeRoleToCanonical,
} from '@/lib/roles/canonicalEmployeeRole';

export type UseUserRoleResult = {
  /** Canonical role from `employees.role` (source of truth) or ADMIN for company-admin sessions. */
  role: CanonicalEmployeeRole | null;
  loading: boolean;
  companyId: string | null;
  /** Linked `employees` row when loaded for this session (omitted for company admins by design). */
  employee: Employee | null;
};

/**
 * Resolves the signed-in user's canonical role from the `employees` row loaded in AuthContext
 * (`clerk_user_id` match — same source as the rest of the app). Company admins are ADMIN without
 * consulting `employees` for routing.
 */
export function useUserRole(): UseUserRoleResult {
  const { user, authReady, employeeProfile, isDeveloper } = useAuth();

  return useMemo((): UseUserRoleResult => {
    if (!authReady) {
      return { role: null, loading: true, companyId: null, employee: null };
    }

    if (!user) {
      return { role: null, loading: false, companyId: null, employee: null };
    }

    if (isDeveloper || user.role === 'developer') {
      return { role: 'ADMIN', loading: false, companyId: user.companyId ?? null, employee: null };
    }

    if (isCompanyAdminAppUser(user)) {
      return {
        role: 'ADMIN',
        loading: false,
        companyId: user.companyId ?? null,
        employee: null,
      };
    }

    if (!employeeProfile) {
      return {
        role: null,
        loading: false,
        companyId: user.companyId ?? null,
        employee: null,
      };
    }

    const raw = employeeProfile.employeeRole ?? employeeProfile.role;
    const role = mapEmployeeRoleToCanonical(raw);

    return {
      role,
      loading: false,
      companyId: employeeProfile.companyId ?? user.companyId ?? null,
      employee: employeeProfile,
    };
  }, [authReady, user, employeeProfile, isDeveloper]);
}
