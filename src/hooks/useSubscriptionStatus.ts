import { useMemo } from 'react';
import { usePlan } from '@/contexts/PlanContext';
import type { ResolvedCompanyPlan, ResolvedCompanySubscriptionStatus } from '@/services/subscriptionService';

export type SubscriptionPlan = ResolvedCompanyPlan;
export type SubscriptionStatus = ResolvedCompanySubscriptionStatus;

export interface CompanySubscriptionOverride {
  enabled: boolean;
  type?: 'full_free' | 'extended_trial' | 'custom';
  overrideEndsAt?: Date | string | null;
  reason?: string | null;
  grantedBy?: string;
  grantedAt?: Date | string;
}

export interface CompanySubscription {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  trialStartAt?: Date | string;
  trialEndsAt?: Date | string;
  paidUntil?: Date | string | null;
  override?: CompanySubscriptionOverride;
}

export interface SubscriptionStatusResult {
  canWrite: boolean;
  /** True while approved Pro trial is running (countdown active). */
  isTrial: boolean;
  /** Subscription record says expired, or Pro trial window ended and plan must be chosen. */
  isExpired: boolean;
  daysRemaining: number | null;
  isOverrideActive: boolean;
  plan: SubscriptionPlan | null;
  status: SubscriptionStatus | null;
  isLoading: boolean;
  /** From resolver: access end (trial end or paid period end), if applicable. */
  displayAccessEndIso: string | null;
  /** Active paid (or equivalent); trial countdown hidden. */
  isActivePaid: boolean;
  /** Present for legacy callers; may be null under deterministic resolver. */
  billingModeFromGate: string | null;
  billingCycleFromGate: string | null;
  /** From get_subscription_gate_state — fallback when company doc has no billing_reference yet. */
  billingReferenceFromGate: string | null;
}

export function useSubscriptionStatus(): SubscriptionStatusResult {
  const plan = usePlan();

  return useMemo(
    () => ({
      canWrite: plan.canWrite,
      isTrial: plan.isTrial,
      isExpired: plan.isExpired,
      daysRemaining: plan.daysRemaining,
      isOverrideActive: plan.isOverrideActive,
      plan: plan.plan,
      status: plan.status,
      isLoading: plan.loadingPlan,
      displayAccessEndIso: plan.displayAccessEndIso,
      isActivePaid: plan.isActivePaid,
      billingModeFromGate: plan.billingModeFromGate,
      billingCycleFromGate: plan.billingCycleFromGate,
      billingReferenceFromGate: plan.billingReferenceFromGate,
    }),
    [plan],
  );
}
