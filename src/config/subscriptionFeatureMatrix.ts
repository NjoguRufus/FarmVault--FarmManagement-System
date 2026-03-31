export type SubscriptionTier = 'basic' | 'pro';

/**
 * Central subscription feature matrix (Basic vs Pro).
 * This is the single source of truth for plan gating.
 */
export const features = {
  basicHarvest: 'basic',
  expenses: 'basic',
  inventory: 'basic',
  operations: 'basic',
  recordsNotebook: 'basic',
  reportsView: 'basic',
  seasonChallenges: 'basic',

  advancedHarvest: 'pro',
  frenchBeansCollections: 'pro',
  exportReports: 'pro',
  advancedAnalytics: 'pro',
  profitCharts: 'pro',
  unlimitedProjects: 'pro',
  unlimitedEmployees: 'pro',
  multiBlockManagement: 'pro',
  cropIntelligence: 'pro',
} as const satisfies Record<string, SubscriptionTier>;

export type SubscriptionFeatureKey = keyof typeof features;

// Back-compat (older naming used during audit exploration)
export const subscriptionFeatures = features;

