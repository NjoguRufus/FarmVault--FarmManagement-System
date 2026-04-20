import { useMemo } from 'react';
import { usePlan } from '@/contexts/PlanContext';
import type { WorkspaceSubscriptionPlan, WorkspaceSubscriptionStatus } from '@/lib/resolveWorkspaceSubscriptionState';

export type SubscriptionPlan = WorkspaceSubscriptionPlan;
export type SubscriptionStatus = WorkspaceSubscriptionStatus;

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
  /** Trial ended, is_trial still true in DB — company admin must call choose_post_trial_plan. */
  trialExpiredNeedsPlan: boolean;
  /** Raw trial end from gate RPC (for effective plan / feature access). */
  trialEndsAt: string | null;
  /** From gate: trial end or paid period end — use for billing renewal line. */
  displayAccessEndIso: string | null;
  /** Active paid (or equivalent); trial countdown hidden. */
  isActivePaid: boolean;
  /** From get_subscription_gate_state (same source as plan/status). */
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
      trialExpiredNeedsPlan: plan.trialExpiredNeedsPlan,
      trialEndsAt: plan.trialEndsAt,
      displayAccessEndIso: plan.displayAccessEndIso,
      isActivePaid: plan.isActivePaid,
      billingModeFromGate: plan.billingModeFromGate,
      billingCycleFromGate: plan.billingCycleFromGate,
      billingReferenceFromGate: plan.billingReferenceFromGate,
    }),
    [plan],
  );
}
