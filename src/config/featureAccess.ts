/**
 * Feature access configuration for FarmVault subscription plans.
 * Centralized plan/feature gating system.
 */

export type PlanCode = 'basic' | 'pro' | 'enterprise';
export type SubscriptionState = 'trial' | 'active' | 'expired' | 'cancelled';

/**
 * Feature keys for gating Pro/Enterprise features.
 * Use these keys in FeatureGate and canAccessFeature().
 */
export type FeatureKey =
  | 'projects.unlimited'
  | 'employees.unlimited'
  | 'management.multi_block'
  | 'reports.advanced'
  | 'analytics.harvest'
  | 'export.excel_pdf'
  | 'audit.activity_log'
  | 'ai.future'
  | 'weather.future';

interface FeatureRule {
  minPlan: PlanCode;
  label: string;
  description: string;
}

/**
 * Feature rules: which plan is required for each feature.
 */
export const FEATURE_RULES: Record<FeatureKey, FeatureRule> = {
  'projects.unlimited': {
    minPlan: 'pro',
    label: 'Unlimited Projects',
    description: 'Create as many projects as you need.',
  },
  'employees.unlimited': {
    minPlan: 'pro',
    label: 'Unlimited Employees',
    description: 'Add unlimited team members to your company.',
  },
  'management.multi_block': {
    minPlan: 'pro',
    label: 'Multi-Block Management',
    description: 'Manage multiple farm blocks within a project.',
  },
  'reports.advanced': {
    minPlan: 'pro',
    label: 'Advanced Reports',
    description: 'Access detailed analytics and custom reports.',
  },
  'analytics.harvest': {
    minPlan: 'pro',
    label: 'Harvest Analytics',
    description: 'Deep insights into harvest performance and trends.',
  },
  'export.excel_pdf': {
    minPlan: 'pro',
    label: 'Export to Excel/PDF',
    description: 'Download reports and data in Excel or PDF format.',
  },
  'audit.activity_log': {
    minPlan: 'pro',
    label: 'Activity Audit Log',
    description: 'Track all changes and actions in your company.',
  },
  'ai.future': {
    minPlan: 'pro',
    label: 'AI Features',
    description: 'AI-powered recommendations and insights (coming soon).',
  },
  'weather.future': {
    minPlan: 'pro',
    label: 'Weather Integration',
    description: 'Weather forecasts and alerts for your farm (coming soon).',
  },
};

/**
 * Basic plan limits. Pro/Enterprise have no limits.
 */
export { BASIC_LIMITS } from '@/config/basicLimits';

/**
 * Plan hierarchy for comparison.
 */
export const PLAN_HIERARCHY: PlanCode[] = ['basic', 'pro', 'enterprise'];

/**
 * Check if a plan meets the minimum required plan.
 */
export function planMeetsMinimum(currentPlan: PlanCode, requiredPlan: PlanCode): boolean {
  const currentIdx = PLAN_HIERARCHY.indexOf(currentPlan);
  const requiredIdx = PLAN_HIERARCHY.indexOf(requiredPlan);
  return currentIdx >= requiredIdx;
}

/**
 * Get human-readable plan label.
 */
export function getPlanLabel(plan: PlanCode): string {
  switch (plan) {
    case 'basic':
      return 'Basic';
    case 'pro':
      return 'Pro';
    case 'enterprise':
      return 'Enterprise';
    default:
      return 'Basic';
  }
}

/**
 * Get feature info by key.
 */
export function getFeatureInfo(feature: FeatureKey): FeatureRule {
  return FEATURE_RULES[feature];
}
