import React, { createContext, useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
  getSubscriptionGateState,
  hasConfirmedMpesaStkForCompany,
} from '@/services/subscriptionService';
import {
  resolveWorkspaceSubscriptionState,
  type WorkspaceSubscriptionPlan,
  type WorkspaceSubscriptionStatus,
} from '@/lib/resolveWorkspaceSubscriptionState';

export interface PlanContextValue {
  companyId: string | null;
  isDeveloper: boolean;
  /** Non-null when subscription-gate queries failed to load. */
  error: string | null;
  /**
   * Null until confirmed from Supabase.
   * Under no circumstances should UI assume a plan before confirmation.
   */
  plan: WorkspaceSubscriptionPlan | null;
  status: WorkspaceSubscriptionStatus | null;
  canWrite: boolean;
  isTrial: boolean;
  isExpired: boolean;
  daysRemaining: number | null;
  isOverrideActive: boolean;
  trialExpiredNeedsPlan: boolean;
  trialEndsAt: string | null;
  displayAccessEndIso: string | null;
  isActivePaid: boolean;
  billingModeFromGate: string | null;
  billingCycleFromGate: string | null;
  billingReferenceFromGate: string | null;
  /**
   * True while the subscription plan is not yet confirmed from Supabase.
   * Use this as a hard render gate for plan-dependent UI.
   */
  loadingPlan: boolean;
}

const PlanContext = createContext<PlanContextValue | undefined>(undefined);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isDeveloper = user?.role === 'developer';
  const companyId = user?.companyId ?? null;

  const {
    data: subscriptionState,
    isLoading: gateLoading,
    isFetching: gateFetching,
    error: gateError,
  } = useQuery({
    queryKey: ['subscription-gate', companyId],
    enabled: !!companyId && !isDeveloper,
    queryFn: () => getSubscriptionGateState(),
    // Subscription state changes infrequently; keep this cache warm to reduce RPC calls.
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Don't retry in a tight loop; failing here previously caused "stuck loading" UX.
    retry: false,
  });

  const {
    data: stkConfirmed,
    isLoading: stkLoading,
    isFetching: stkFetching,
    error: stkError,
  } = useQuery({
    queryKey: ['company-mpesa-stk-confirmed', companyId],
    enabled: !!companyId && !isDeveloper,
    queryFn: () => hasConfirmedMpesaStkForCompany(companyId!),
    // Payment confirmation does not need second-by-second accuracy; reduce reads.
    staleTime: 5 * 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  const loadError = useMemo(() => {
    const e = gateError ?? stkError;
    if (!e) return null;
    return e instanceof Error ? e.message : String(e);
  }, [gateError, stkError]);

  const resolved = useMemo(() => {
    return resolveWorkspaceSubscriptionState(
      subscriptionState ?? null,
      companyId,
      Boolean(isDeveloper),
      new Date(),
      { hasConfirmedStkPayment: stkConfirmed === true },
    );
  }, [subscriptionState, companyId, isDeveloper, stkConfirmed]);

  const loadingPlan =
    Boolean(companyId) &&
    !isDeveloper &&
    // If we have not received a gate row yet, plan is not confirmed.
    !loadError &&
    (gateLoading || gateFetching || stkLoading || stkFetching || !subscriptionState || resolved.plan == null);

  const value = useMemo<PlanContextValue>(() => {
    const stk = stkConfirmed === true && !isDeveloper;
    const rawMode = (subscriptionState as any)?.billing_mode ?? null;
    const rawCycle = (subscriptionState as any)?.billing_cycle ?? null;
    const cycleFromStk = !stk
      ? rawCycle
      : rawCycle && String(rawCycle).toLowerCase() !== 'trial'
        ? rawCycle
        : 'monthly';

    return {
      companyId,
      isDeveloper,
      error: loadError,
      plan: resolved.plan,
      status: resolved.status,
      canWrite: resolved.canWrite,
      isTrial: resolved.isTrial,
      isExpired: resolved.isExpired,
      daysRemaining: resolved.daysRemaining,
      isOverrideActive: resolved.isOverrideActive,
      trialExpiredNeedsPlan: resolved.trialExpiredNeedsPlan,
      trialEndsAt: resolved.trialEndsAt,
      displayAccessEndIso: resolved.displayAccessEndIso,
      isActivePaid: resolved.isActivePaid,
      billingModeFromGate: stk ? 'mpesa_stk' : rawMode,
      billingCycleFromGate: cycleFromStk,
      billingReferenceFromGate: (subscriptionState as any)?.billing_reference ?? null,
      loadingPlan,
    };
  }, [companyId, isDeveloper, loadError, resolved, subscriptionState, stkConfirmed, loadingPlan]);

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) {
    throw new Error('usePlan must be used within a PlanProvider');
  }
  return ctx;
}

