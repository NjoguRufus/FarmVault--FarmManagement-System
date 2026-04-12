/**
 * Canonical values for `core.companies.plan` (marketing / admin tier column).
 * Billing RPCs already use basic|pro; this aligns the company row with that vocabulary.
 */
export type CanonicalCompanyPlan = 'basic' | 'pro' | 'enterprise';

export function normalizeCompanyPlanColumn(raw: string | null | undefined): CanonicalCompanyPlan {
  const s = (raw ?? '').toLowerCase().trim();
  if (s === 'enterprise') return 'enterprise';
  if (s === 'pro' || s === 'professional') return 'pro';
  if (s === 'basic' || s === 'starter') return 'basic';
  return 'basic';
}
