import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getSubscriptionGateState, hasConfirmedMpesaStkForCompany } from '@/services/subscriptionService';
import { resolveWorkspaceSubscriptionState } from '@/lib/resolveWorkspaceSubscriptionState';
import type { WorkspaceSubscriptionPlan, WorkspaceSubscriptionStatus } from '@/lib/resolveWorkspaceSubscriptionState';
import { logger } from "@/lib/logger";

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
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
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
  const { user } = useAuth();
  const isDeveloper = user?.role === 'developer';
  const companyId = user?.companyId ?? null;

  const { data: subscriptionState, isLoading } = useQuery({
    // Shared key with SubscriptionAccessGate + billing realtime refetch (single cache for gate RPC).
    queryKey: ['subscription-gate', companyId],
    enabled: !!companyId,
    queryFn: () => getSubscriptionGateState(),
    // Paid-plan transitions: useCompanySubscriptionRealtime + explicit refetchQueries keep this fresh without focus refetch storms.
    staleTime: 45_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: stkConfirmed, isLoading: stkConfirmedLoading } = useQuery({
    queryKey: ['company-mpesa-stk-confirmed', companyId],
    enabled: !!companyId && !isDeveloper,
    queryFn: () => hasConfirmedMpesaStkForCompany(companyId!),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const resolved = useMemo(
    () =>
      resolveWorkspaceSubscriptionState(subscriptionState ?? null, companyId, Boolean(isDeveloper), new Date(), {
        hasConfirmedStkPayment: stkConfirmed === true,
      }),
    [subscriptionState, companyId, isDeveloper, stkConfirmed],
  );

  useEffect(() => {
    if (!import.meta.env.DEV || !companyId) return;
    // eslint-disable-next-line no-console
    logger.log('[SubscriptionStatus] gate row + resolver', {
      companyId,
      rawGate: subscriptionState ?? null,
      resolved,
    });
  }, [companyId, subscriptionState, resolved]);

  return useMemo<SubscriptionStatusResult>(
    () => {
      const stk = stkConfirmed === true && !isDeveloper;
      const rawMode = subscriptionState?.billing_mode ?? null;
      const rawCycle = subscriptionState?.billing_cycle ?? null;
      const cycleFromStk = !stk
        ? rawCycle
        : rawCycle && String(rawCycle).toLowerCase() !== 'trial'
          ? rawCycle
          : 'monthly';

      return {
        canWrite: resolved.canWrite,
        isTrial: resolved.isTrial,
        isExpired: resolved.isExpired,
        daysRemaining: resolved.daysRemaining,
        isOverrideActive: resolved.isOverrideActive,
        plan: resolved.plan,
        status: resolved.status,
        isLoading: isLoading || (!!companyId && !isDeveloper && stkConfirmedLoading),
        trialExpiredNeedsPlan: resolved.trialExpiredNeedsPlan,
        trialEndsAt: resolved.trialEndsAt,
        displayAccessEndIso: resolved.displayAccessEndIso,
        isActivePaid: resolved.isActivePaid,
        billingModeFromGate: stk ? 'mpesa_stk' : rawMode,
        billingCycleFromGate: cycleFromStk,
        billingReferenceFromGate: subscriptionState?.billing_reference ?? null,
      };
    },
    [
      resolved,
      isLoading,
      stkConfirmedLoading,
      isDeveloper,
      stkConfirmed,
      subscriptionState?.billing_mode,
      subscriptionState?.billing_cycle,
      subscriptionState?.billing_reference,
    ],
  );
}
