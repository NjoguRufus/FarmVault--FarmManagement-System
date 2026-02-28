import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export const NO_COMPANY = 'NO_COMPANY' as const;

export type CompanyScopeResult =
  | { companyId: string; userId: string; role: string; isDeveloper: boolean; error: null }
  | { companyId: null; userId: string; role: string; isDeveloper: boolean; error: typeof NO_COMPANY };

/**
 * Single source of truth for company-scoped data access.
 * Use in pages/services/hooks to avoid ad-hoc companyId logic.
 * When companyId is missing (non-developer), returns error state so callers can show "Finish setup".
 */
export function useCompanyScope(): CompanyScopeResult {
  const { user } = useAuth();

  return useMemo((): CompanyScopeResult => {
    const userId = user?.id ?? '';
    const role = user?.role ?? 'employee';
    const isDeveloper = role === 'developer';
    const companyId = user?.companyId ?? null;

    if (isDeveloper) {
      return {
        companyId: companyId ?? null,
        userId,
        role,
        isDeveloper: true,
        error: null,
      };
    }

    if (!companyId) {
      return {
        companyId: null,
        userId,
        role,
        isDeveloper: false,
        error: NO_COMPANY,
      };
    }

    return {
      companyId,
      userId,
      role,
      isDeveloper: false,
      error: null,
    };
  }, [user?.id, user?.role, user?.companyId]);
}
