import { describe, expect, it } from 'vitest';
import { resolveWorkspaceSubscriptionState } from '@/lib/resolveWorkspaceSubscriptionState';

describe('resolveWorkspaceSubscriptionState', () => {
  it('does not assume a plan when subscription gate is not yet loaded', () => {
    const resolved = resolveWorkspaceSubscriptionState(null, 'company-1', false, new Date());
    expect(resolved.plan).toBeNull();
    expect(resolved.status).toBeNull();
    expect(resolved.isActivePaid).toBe(false);
  });

  it('does not assume a plan when companyId is missing (unknown context)', () => {
    const resolved = resolveWorkspaceSubscriptionState(null, null, false, new Date());
    expect(resolved.plan).toBeNull();
    expect(resolved.status).toBeNull();
  });

  it('returns enterprise/active immediately for developer sessions', () => {
    const resolved = resolveWorkspaceSubscriptionState(null, null, true, new Date());
    expect(resolved.plan).toBe('enterprise');
    expect(resolved.status).toBe('active');
    expect(resolved.isActivePaid).toBe(true);
  });
});

