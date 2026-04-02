import { describe, expect, it } from 'vitest';
import { computeCompanyDataQueriesEnabled } from '@/lib/companyTenantGate';

describe('computeCompanyDataQueriesEnabled', () => {
  const base = {
    clerkStateNull: false,
    isEmergencySession: false,
    clerkLoaded: true,
    isSignedIn: true,
    clerkUserId: 'user_1',
    authReady: true,
    activationResolved: true,
    tenantSessionTrust: 'verified' as const,
    isDeveloper: false,
    userCompanyId: '00000000-0000-0000-0000-000000000001',
  };

  it('enables when signed-in tenant is verified and company is set', () => {
    expect(computeCompanyDataQueriesEnabled(base)).toBe(true);
  });

  it('disables when Clerk session is missing', () => {
    expect(computeCompanyDataQueriesEnabled({ ...base, isSignedIn: false })).toBe(false);
  });

  it('disables when trust is provisional (cached fallback)', () => {
    expect(
      computeCompanyDataQueriesEnabled({ ...base, tenantSessionTrust: 'provisional' }),
    ).toBe(false);
  });

  it('disables when auth bootstrap is not finished', () => {
    expect(computeCompanyDataQueriesEnabled({ ...base, authReady: false })).toBe(false);
  });

  it('allows emergency session with company when clerk state is null', () => {
    expect(
      computeCompanyDataQueriesEnabled({
        ...base,
        clerkStateNull: true,
        isEmergencySession: true,
        clerkLoaded: true,
        isSignedIn: false,
        clerkUserId: null,
        authReady: true,
        activationResolved: true,
        userCompanyId: '00000000-0000-0000-0000-000000000002',
      }),
    ).toBe(true);
  });

  it('allows developer without company id', () => {
    expect(
      computeCompanyDataQueriesEnabled({
        ...base,
        isDeveloper: true,
        userCompanyId: null,
      }),
    ).toBe(true);
  });
});
