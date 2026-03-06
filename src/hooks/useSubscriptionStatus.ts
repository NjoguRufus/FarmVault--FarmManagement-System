import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { getCompany, type CompanyDoc } from '@/services/companyService';

type SubscriptionPlan = 'trial' | 'basic' | 'pro' | 'enterprise';
type SubscriptionStatus = 'active' | 'expired' | 'grace' | 'paused' | 'pending_payment';

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
  isTrial: boolean;
  isExpired: boolean;
  daysRemaining: number | null;
  isOverrideActive: boolean;
  plan: SubscriptionPlan;
   status: SubscriptionStatus;
  isLoading: boolean;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const ts = value as { toDate?: () => Date; seconds?: number };
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  return null;
}

function mapLegacyPlanToSubscriptionPlan(plan: string | null | undefined): SubscriptionPlan {
  if (!plan) return 'basic';
  switch (plan) {
    case 'trial':
      return 'trial';
    case 'starter':
    case 'basic':
      return 'basic';
    case 'professional':
    case 'pro':
      return 'pro';
    case 'enterprise':
      return 'enterprise';
    default:
      return 'basic';
  }
}

export function useSubscriptionStatus(): SubscriptionStatusResult {
  const { user } = useAuth();
  const isDeveloper = user?.role === 'developer';
  const companyId = user?.companyId ?? null;

  const { data: company, isLoading } = useQuery<CompanyDoc | null>({
    queryKey: ['company-subscription', companyId],
    enabled: !!companyId,
    queryFn: () => getCompany(companyId!),
    staleTime: 60_000,
  });

  return useMemo<SubscriptionStatusResult>(() => {
    // Developers are never blocked by subscription
    if (isDeveloper) {
      return {
        canWrite: true,
        isTrial: false,
        isExpired: false,
        daysRemaining: null,
        isOverrideActive: false,
        plan: 'enterprise',
        status: 'active',
        isLoading,
      };
    }

    // No company yet (onboarding, driver without company, etc.) – do not block writes here.
    if (!companyId || !company) {
      return {
        canWrite: true,
        isTrial: false,
        isExpired: false,
        daysRemaining: null,
        isOverrideActive: false,
        plan: 'basic',
        status: 'active',
        isLoading,
      };
    }

    const rawSub = (company as any).subscription as CompanySubscription | undefined;

    const subPlan: SubscriptionPlan = rawSub?.plan ?? mapLegacyPlanToSubscriptionPlan(
      (company as any).plan ?? (company as any).subscriptionPlan,
    );
    const subStatus: SubscriptionStatus = rawSub?.status ?? 'active';

    const trialEndsAt = toDate(rawSub?.trialEndsAt);
    const paidUntil = toDate(rawSub?.paidUntil ?? null);

    const override = rawSub?.override;
    const overrideEndsAt = toDate(override?.overrideEndsAt ?? null);
    const now = new Date();

    const overrideActive =
      Boolean(override?.enabled) &&
      !!overrideEndsAt &&
      overrideEndsAt.getTime() > now.getTime();

    const hasPaid = !!paidUntil && paidUntil.getTime() > now.getTime();
    const hasTrial = !!trialEndsAt && trialEndsAt.getTime() > now.getTime();

    let canWrite = overrideActive || hasPaid || hasTrial;
    let isTrial = subPlan === 'trial' && (hasTrial || (overrideActive && override?.type === 'extended_trial'));
    const isExpired = !canWrite;

    // If there is no structured subscription yet for legacy tenants, do not block writes.
    if (!rawSub) {
      canWrite = true;
    }

    let daysRemaining: number | null = null;
    if (overrideActive && overrideEndsAt) {
      daysRemaining = Math.max(
        0,
        Math.ceil((overrideEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      );
    } else if (hasPaid && paidUntil) {
      daysRemaining = Math.max(
        0,
        Math.ceil((paidUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      );
    } else if (hasTrial && trialEndsAt) {
      daysRemaining = Math.max(
        0,
        Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      );
    }

    return {
      canWrite,
      isTrial,
      isExpired,
      daysRemaining,
      isOverrideActive: overrideActive,
      plan: subPlan,
      status: subStatus,
      isLoading,
    };
  }, [company, companyId, isDeveloper, isLoading]);
}

