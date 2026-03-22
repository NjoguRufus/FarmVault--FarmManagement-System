import { type BillingMode, getPlanPrice } from '@/config/plans';

export type BillingSubmissionPlan = 'basic' | 'pro';
export type BillingSubmissionCycle = 'monthly' | 'seasonal' | 'annual';

export function billingCycleToPlanMode(cycle: BillingSubmissionCycle): BillingMode {
  if (cycle === 'seasonal') return 'season';
  if (cycle === 'annual') return 'annual';
  return 'monthly';
}

export function getBillingAmountKes(plan: BillingSubmissionPlan, cycle: BillingSubmissionCycle): number {
  const mode = billingCycleToPlanMode(cycle);
  const n = getPlanPrice(plan, mode);
  if (n == null) throw new Error('Price not configured for this plan.');
  return n;
}

export function billingCycleDurationMonths(cycle: BillingSubmissionCycle): number {
  switch (cycle) {
    case 'monthly':
      return 1;
    case 'seasonal':
      return 3;
    case 'annual':
      return 12;
  }
}

export function billingCycleLabel(cycle: BillingSubmissionCycle): string {
  switch (cycle) {
    case 'monthly':
      return 'Monthly';
    case 'seasonal':
      return 'Seasonal (3 months)';
    case 'annual':
      return 'Annual';
  }
}

export function billingPlanLabel(plan: BillingSubmissionPlan): string {
  return plan === 'basic' ? 'Basic' : 'Pro';
}

/** Map DB / legacy values to checkout cycle. */
export function parseBillingCycle(raw: string | null | undefined): BillingSubmissionCycle | null {
  const s = (raw ?? '').toLowerCase().trim();
  if (s === 'monthly' || s === 'month') return 'monthly';
  if (s === 'seasonal' || s === 'season' || s === 'per season') return 'seasonal';
  if (s === 'annual' || s === 'yearly' || s === 'year') return 'annual';
  return null;
}

export function computeBundleSavingsKes(plan: BillingSubmissionPlan, cycle: BillingSubmissionCycle): number {
  if (cycle === 'monthly') return 0;
  const monthly = getPlanPrice(plan, 'monthly');
  if (monthly == null) return 0;
  const months = billingCycleDurationMonths(cycle);
  const baseline = monthly * months;
  const price = getBillingAmountKes(plan, cycle);
  return Math.max(0, baseline - price);
}
