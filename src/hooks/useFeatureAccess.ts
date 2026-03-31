import { useMemo } from 'react';
import { features, type SubscriptionFeatureKey, type SubscriptionTier } from '@/config/subscriptionFeatureMatrix';
import { useEffectivePlanAccess } from '@/hooks/useEffectivePlanAccess';

export interface FeatureAccessResult {
  canAccess: boolean;
  isLocked: boolean;
  requiredTier: SubscriptionTier;
}

function tierRank(tier: SubscriptionTier): number {
  return tier === 'pro' ? 1 : 0;
}

export function useFeatureAccess(feature: SubscriptionFeatureKey): FeatureAccessResult {
  const access = useEffectivePlanAccess();

  return useMemo(() => {
    const requiredTier = features[feature] ?? 'pro';

    // Treat dev / enterprise / override as Pro access.
    const currentTier: SubscriptionTier =
      access.isDeveloper || access.plan === 'enterprise' || access.isOverride
        ? 'pro'
        : access.plan === 'pro'
          ? 'pro'
          : 'basic';

    const canAccess = tierRank(currentTier) >= tierRank(requiredTier);
    return {
      canAccess,
      isLocked: !canAccess,
      requiredTier,
    };
  }, [access.isDeveloper, access.isOverride, access.plan, feature]);
}

