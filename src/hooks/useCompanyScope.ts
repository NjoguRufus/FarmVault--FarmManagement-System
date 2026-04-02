import { useMemo } from 'react';
import type { User } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

export const NO_COMPANY = 'NO_COMPANY' as const;
/** Profile load fell back to cache; company-scoped queries are paused until sync. */
export const TENANT_SYNC_REQUIRED = 'TENANT_SYNC_REQUIRED' as const;

/**
 * Single source for effective company ID: user.companyId.
 * Use in pages/hooks when passing companyId to useCollection or services.
 * Returns '' when no company (caller should not query company-scoped data).
 */
export function getEffectiveCompanyId(user: User | null): string {
  return user?.companyId ?? '';
}

export type CompanyScopeResult =
  | { companyId: string; userId: string; role: string; isDeveloper: boolean; error: null }
  | { companyId: null; userId: string; role: string; isDeveloper: boolean; error: typeof NO_COMPANY }
  | {
      companyId: null;
      userId: string;
      role: string;
      isDeveloper: boolean;
      error: typeof TENANT_SYNC_REQUIRED;
    };

/**
 * Single source of truth for company-scoped data access.
 * Use in pages/services/hooks to avoid ad-hoc companyId logic.
 * When companyId is missing (non-developer), returns error state so callers can show "Finish setup".
 */
export function useCompanyScope(): CompanyScopeResult {
  const { user, tenantSessionTrust: sessionTrust } = useAuth();

  return useMemo((): CompanyScopeResult => {
    const userId = user?.id ?? '';
    const role = user?.role ?? 'employee';
    const isDeveloper = role === 'developer';
    const companyId = user?.companyId ?? null;

    if (!isDeveloper && sessionTrust === 'provisional' && companyId) {
      return {
        companyId: null,
        userId,
        role,
        isDeveloper: false,
        error: TENANT_SYNC_REQUIRED,
      };
    }

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
  }, [user?.id, user?.role, user?.companyId, sessionTrust]);
}
