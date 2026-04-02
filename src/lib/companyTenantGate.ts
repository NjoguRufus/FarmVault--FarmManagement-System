/**
 * Gates Supabase company-scoped queries so they never run with a stale Clerk/session pair
 * or after a cached-auth fallback until the tenant is revalidated.
 */
export type TenantSessionTrust = 'verified' | 'provisional';

export function computeCompanyDataQueriesEnabled(params: {
  clerkStateNull: boolean;
  isEmergencySession: boolean;
  clerkLoaded: boolean;
  isSignedIn: boolean;
  clerkUserId: string | null;
  authReady: boolean;
  activationResolved: boolean;
  tenantSessionTrust: TenantSessionTrust;
  isDeveloper: boolean;
  userCompanyId: string | null;
}): boolean {
  if (params.clerkStateNull) {
    return params.isEmergencySession && (!!params.userCompanyId || params.isDeveloper);
  }
  if (!params.clerkLoaded || !params.isSignedIn || !params.clerkUserId) {
    return false;
  }
  if (!params.authReady || !params.activationResolved) {
    return false;
  }
  if (params.tenantSessionTrust === 'provisional') {
    return false;
  }
  return params.isDeveloper || !!params.userCompanyId;
}
