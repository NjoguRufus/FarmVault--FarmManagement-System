/**
 * Hook for accessing effective plan and feature gating.
 * Combines subscription status with plan access logic.
 */

import { useMemo } from 'react';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useAuth } from '@/contexts/AuthContext';
import {
  getEffectivePlanAccessFromSubscription,
  getEffectivePlanLabel,
  checkBasicLimitsExceeded,
  type EffectivePlanAccess,
} from '@/lib/access/subscriptionAccess';
import type { CompanySubscription } from '@/services/companyService';
import type { FeatureKey } from '@/config/featureAccess';

export interface UseEffectivePlanAccessResult extends EffectivePlanAccess {
  isLoading: boolean;
  isDeveloper: boolean;
  isCompanyAdmin: boolean;
  planLabel: string;
  checkLimits: (counts: { activeProjects?: number; employees?: number }) => {
    projectsExceeded: boolean;
    employeesExceeded: boolean;
  };
}

/**
 * Hook to get effective plan access for the current user's company.
 * Developers always have full access (treated as Enterprise).
 */
export function useEffectivePlanAccess(): UseEffectivePlanAccessResult {
  const { user } = useAuth();
  const sub = useSubscriptionStatus();

  const isDeveloper = user?.role === 'developer';
  const isCompanyAdmin = user?.role === 'company-admin' || user?.role === 'company_admin';

  const access = useMemo<EffectivePlanAccess>(() => {
    // Developers get full Enterprise access
    if (isDeveloper) {
      return {
        plan: 'enterprise',
        status: 'active',
        isTrial: false,
        isOverride: false,
        overrideMode: null,
        expiresAt: null,
        daysRemaining: null,
        canAccessFeature: () => true,
        limits: {
          maxActiveProjects: null,
          maxEmployees: null,
        },
      };
    }

    // Build subscription object from hook data
    const subscription: CompanySubscription = {
      plan: sub.plan as any,
      status: sub.status as any,
      trialStartAt: undefined,
      trialEndsAt: undefined,
      paidUntil: null,
      override: sub.isOverrideActive
        ? {
            enabled: true,
            type: 'custom',
            overrideEndsAt: null,
            reason: null,
          }
        : undefined,
    };

    return getEffectivePlanAccessFromSubscription(subscription);
  }, [isDeveloper, sub.plan, sub.status, sub.isOverrideActive]);

  const planLabel = useMemo(() => getEffectivePlanLabel(access), [access]);

  const checkLimits = useMemo(
    () => (counts: { activeProjects?: number; employees?: number }) =>
      checkBasicLimitsExceeded(access.plan, counts),
    [access.plan]
  );

  return {
    ...access,
    isLoading: sub.isLoading,
    isDeveloper,
    isCompanyAdmin,
    planLabel,
    checkLimits,
  };
}

/**
 * Quick helper to check a single feature.
 */
export function useCanAccessFeature(feature: FeatureKey): {
  canAccess: boolean;
  isLoading: boolean;
} {
  const { canAccessFeature, isLoading, isDeveloper } = useEffectivePlanAccess();

  return {
    canAccess: isDeveloper || canAccessFeature(feature),
    isLoading,
  };
}
