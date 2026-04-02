import { useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { TenantSessionTrust } from '@/lib/companyTenantGate';

export type CompanyContextStatus =
  | 'loading'
  | 'no_clerk_session'
  | 'no_company'
  | 'provisional_tenant'
  | 'ready';

/**
 * Single place for dashboard / tenant UIs: Clerk id, company id, membership trust, and query gates.
 */
export function useCompanyContext() {
  const {
    user,
    authReady,
    clerkLoaded,
    clerkSignedIn,
    tenantSessionTrust,
    companyDataQueriesEnabled,
    syncTenantCompanyFromServer,
    isEmergencySession,
    isDeveloper: authIsDeveloper,
  } = useAuth();

  const clerkUserId = user?.id ?? null;
  const activeCompanyId = user?.companyId ?? null;
  const isDeveloper = authIsDeveloper || user?.role === 'developer';

  const status: CompanyContextStatus = useMemo(() => {
    if (isEmergencySession) {
      return activeCompanyId || isDeveloper ? 'ready' : 'no_company';
    }
    if (!clerkLoaded) return 'loading';
    if (!clerkSignedIn || !clerkUserId) return 'no_clerk_session';
    if (!authReady) return 'loading';
    if (tenantSessionTrust === 'provisional') return 'provisional_tenant';
    if (!isDeveloper && !activeCompanyId) return 'no_company';
    return 'ready';
  }, [
    isEmergencySession,
    clerkLoaded,
    clerkSignedIn,
    clerkUserId,
    authReady,
    tenantSessionTrust,
    isDeveloper,
    activeCompanyId,
  ]);

  const isReady = status === 'ready';

  const revalidateTenant = useCallback(async (): Promise<boolean> => {
    return syncTenantCompanyFromServer();
  }, [syncTenantCompanyFromServer]);

  return {
    status,
    isReady,
    clerkUserId,
    activeCompanyId,
    role: user?.role ?? null,
    tenantSessionTrust: tenantSessionTrust as TenantSessionTrust,
    companyDataQueriesEnabled,
    isDeveloper,
    revalidateTenant,
  };
}
