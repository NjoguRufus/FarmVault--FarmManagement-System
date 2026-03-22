/**
 * Subscription access helper.
 * Computes effective plan access from company subscription data.
 */

import {
  BASIC_LIMITS,
  FEATURE_RULES,
  planMeetsMinimum,
  type FeatureKey,
  type PlanCode,
  type SubscriptionState,
} from '@/config/featureAccess';
import type { CompanySubscription } from '@/services/companyService';

export type EffectivePlan = 'basic' | 'pro' | 'enterprise';
export type EffectiveStatus = 'trial' | 'active' | 'expired' | 'cancelled';

export interface EffectivePlanAccess {
  plan: EffectivePlan;
  status: EffectiveStatus;
  isTrial: boolean;
  isOverride: boolean;
  overrideMode: string | null;
  expiresAt: Date | null;
  daysRemaining: number | null;
  canAccessFeature: (feature: FeatureKey) => boolean;
  limits: {
    maxActiveProjects: number | null;
    maxEmployees: number | null;
  };
}

/**
 * Normalize plan string to PlanCode.
 */
function normalizePlan(plan?: string | null): EffectivePlan {
  const v = (plan ?? '').toLowerCase();
  if (v === 'pro' || v === 'professional') return 'pro';
  if (v === 'enterprise') return 'enterprise';
  return 'basic';
}

/**
 * Parse date from various formats.
 */
function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  const ts = value as { toDate?: () => Date; seconds?: number };
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  return null;
}

/**
 * Calculate days remaining from now to expiry.
 */
function calcDaysRemaining(expiresAt: Date | null): number | null {
  if (!expiresAt) return null;
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

/**
 * Derive effective status from subscription data.
 */
function deriveStatus(sub: CompanySubscription | undefined): {
  status: EffectiveStatus;
  isTrial: boolean;
  expiresAt: Date | null;
  isOverride: boolean;
  overrideMode: string | null;
} {
  if (!sub) {
    return {
      status: 'active',
      isTrial: false,
      expiresAt: null,
      isOverride: false,
      overrideMode: null,
    };
  }

  const now = new Date();
  const trialEnds = parseDate(sub.trialEndsAt);
  const paidUntil = parseDate(sub.paidUntil);
  const overrideEnds = parseDate(sub.override?.overrideEndsAt);

  const overrideActive = Boolean(
    sub.override?.enabled && (!overrideEnds || overrideEnds > now)
  );
  const hasTrial = Boolean(trialEnds && trialEnds > now);
  const hasPaid = Boolean(paidUntil && paidUntil > now);

  let status: EffectiveStatus = 'expired';
  let isTrial = false;
  let expiresAt: Date | null = null;
  let overrideMode: string | null = null;

  if (overrideActive) {
    status = 'active';
    isTrial = sub.override?.type === 'extended_trial';
    expiresAt = overrideEnds!;
    overrideMode = (sub.override as any)?.mode ?? sub.override?.type ?? 'override';
  } else if (hasPaid) {
    status = 'active';
    isTrial = false;
    expiresAt = paidUntil!;
  } else if (hasTrial) {
    status = 'trial';
    isTrial = true;
    expiresAt = trialEnds!;
  } else if (sub.status === 'cancelled') {
    status = 'cancelled';
  } else {
    status = 'expired';
  }

  return { status, isTrial, expiresAt, isOverride: overrideActive, overrideMode };
}

/**
 * Get effective plan access from a company subscription.
 * Used to determine what features/limits apply.
 */
export function getEffectivePlanAccessFromSubscription(
  subscription: CompanySubscription | undefined
): EffectivePlanAccess {
  const plan = normalizePlan(subscription?.plan);
  const { status, isTrial, expiresAt, isOverride, overrideMode } = deriveStatus(subscription);

  const baseMaxProjects = plan === 'basic' ? BASIC_LIMITS.maxActiveProjects : null;
  const baseMaxEmployees = plan === 'basic' ? BASIC_LIMITS.maxEmployees : null;

  const canAccessFeature = (feature: FeatureKey): boolean => {
    const rule = FEATURE_RULES[feature];
    if (!rule) return false;

    // Expired or cancelled subscriptions lose Pro features
    if (status === 'expired' || status === 'cancelled') {
      // But allow basic features
      if (rule.minPlan === 'basic') return true;
      return false;
    }

    return planMeetsMinimum(plan, rule.minPlan);
  };

  return {
    plan,
    status,
    isTrial,
    isOverride,
    overrideMode,
    expiresAt,
    daysRemaining: calcDaysRemaining(expiresAt),
    canAccessFeature,
    limits: {
      maxActiveProjects: baseMaxProjects,
      maxEmployees: baseMaxEmployees,
    },
  };
}

/**
 * Check if user has exceeded basic plan limits.
 */
export function checkBasicLimitsExceeded(
  plan: EffectivePlan,
  counts: { activeProjects?: number; employees?: number }
): { projectsExceeded: boolean; employeesExceeded: boolean } {
  if (plan !== 'basic') {
    return { projectsExceeded: false, employeesExceeded: false };
  }

  const projectsExceeded =
    (counts.activeProjects ?? 0) >= BASIC_LIMITS.maxActiveProjects;
  const employeesExceeded =
    (counts.employees ?? 0) >= BASIC_LIMITS.maxEmployees;

  return { projectsExceeded, employeesExceeded };
}

/**
 * Get effective plan label for display.
 */
export function getEffectivePlanLabel(access: EffectivePlanAccess): string {
  if (access.isOverride) {
    const mode = access.overrideMode?.toLowerCase();
    if (mode === 'pilot') return 'Pilot';
    if (mode === 'collaborator') return 'Collaborator';
    if (mode === 'free_forever' || mode === 'free_until') return 'Free Access';
    if (mode === 'extended_trial') return 'Extended Trial';
  }

  if (access.isTrial) return 'Trial';

  switch (access.plan) {
    case 'pro':
      return 'Pro';
    case 'enterprise':
      return 'Enterprise';
    default:
      return 'Basic';
  }
}
