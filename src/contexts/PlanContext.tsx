import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getCompanySubscription, type ResolvedCompanySubscription, type ResolvedCompanyPlan, type ResolvedCompanySubscriptionStatus } from '@/services/subscriptionService';

export interface PlanContextValue {
  companyId: string | null;
  isDeveloper: boolean;
  /** Raw resolved subscription object when available. */
  subscription: ResolvedCompanySubscription | null;
  /** True once subscription has been resolved from backend or we are showing cached (offline) data. */
  isResolved: boolean;
  /** True when data is confirmed from backend for this session. */
  isVerified: boolean;
  /** Non-null when resolver failed and no cache could be used. */
  error: string | null;
  /**
   * Null until confirmed from Supabase.
   * Under no circumstances should UI assume a plan before confirmation.
   */
  plan: ResolvedCompanyPlan | null;
  status: ResolvedCompanySubscriptionStatus | null;
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
  const { user, authReady } = useAuth();
  const isDeveloper = user?.role === 'developer';
  const companyId = user?.companyId ?? null;
  const cacheKey = useMemo(
    () => (companyId ? `farmvault:subscription:v2:${companyId}` : null),
    [companyId],
  );

  const [cached, setCached] = useState<ResolvedCompanySubscription | null>(() => {
    if (!cacheKey || typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(cacheKey);
      if (!raw) return null;
      return JSON.parse(raw) as ResolvedCompanySubscription;
    } catch {
      return null;
    }
  });

  const {
    data: resolved,
    isPending,
    isFetching,
    isSuccess,
    error: resolveError,
  } = useQuery({
    queryKey: ['company-subscription', companyId],
    enabled: authReady && !!companyId && !isDeveloper,
    queryFn: () => getCompanySubscription(companyId!),
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  useEffect(() => {
    if (!cacheKey || typeof window === 'undefined') return;
    if (isSuccess && resolved) {
      try {
        window.localStorage.setItem(cacheKey, JSON.stringify(resolved));
        setCached(resolved);
      } catch {
        // ignore
      }
    }
  }, [cacheKey, isSuccess, resolved]);

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;

  const effectiveSub: ResolvedCompanySubscription | null = resolved ?? cached ?? null;
  const isVerified = Boolean(resolved && isSuccess);
  const canUseCache = !isOnline && !resolved && cached != null;
  const isResolved = isVerified || canUseCache;
  const error = useMemo(() => {
    if (isResolved) return null;
    if (!companyId || isDeveloper) return null;
    if (resolveError) return resolveError instanceof Error ? resolveError.message : String(resolveError);
    // Still pending and no cache available: no error, just unresolved.
    return null;
  }, [isResolved, companyId, isDeveloper, resolveError]);

  const validUntil = effectiveSub?.valid_until ?? null;
  const validUntilDate = useMemo(() => {
    if (!validUntil) return null;
    const d = new Date(validUntil);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [validUntil]);

  const daysRemaining = useMemo(() => {
    if (!validUntilDate) return null;
    // Infinity shows as Invalid Date; in that case validUntilDate would be null.
    const diff = validUntilDate.getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }, [validUntilDate]);

  const isExpired = effectiveSub?.status === 'expired';
  const canWrite = effectiveSub ? effectiveSub.status !== 'expired' : true;
  const isTrial = effectiveSub?.is_trial === true;
  const isActivePaid = effectiveSub?.plan === 'pro' && (effectiveSub.status === 'active' || effectiveSub.status === 'grace');

  const value = useMemo<PlanContextValue>(() => {
    return {
      companyId,
      isDeveloper,
      subscription: effectiveSub,
      isResolved,
      isVerified,
      error,
      plan: effectiveSub?.plan ?? null,
      status: effectiveSub?.status ?? null,
      canWrite,
      isTrial,
      isExpired,
      daysRemaining,
      isOverrideActive: false,
      trialExpiredNeedsPlan: false,
      trialEndsAt: null,
      displayAccessEndIso: effectiveSub?.valid_until ?? null,
      isActivePaid,
      billingModeFromGate: null,
      billingCycleFromGate: null,
      billingReferenceFromGate: null,
      loadingPlan: !isResolved && (isPending || isFetching),
    };
  }, [
    companyId,
    isDeveloper,
    effectiveSub,
    isResolved,
    isVerified,
    error,
    canWrite,
    isTrial,
    isExpired,
    daysRemaining,
    isActivePaid,
    isPending,
    isFetching,
  ]);

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) {
    throw new Error('usePlan must be used within a PlanProvider');
  }
  return ctx;
}

