/** Shared billing mode for pricing across landing, onboarding, and billing. */
export type BillingMode = 'monthly' | 'season' | 'annual';

export interface PlanPricing {
  monthly: number | null;
  season: number | null;
  annual: number | null;
}

/** Subscription plans - shared by BillingPage, landing PricingSection, and ChoosePlan. */
export interface PlanOption {
  name: string;
  value: 'basic' | 'pro' | 'enterprise';
  description: string;
  features: string[];
  popular: boolean;
  pricing: PlanPricing;
}

export const SUBSCRIPTION_PLANS: PlanOption[] = [
  {
    name: 'Basic',
    value: 'basic',
    description: 'For single farms that want clear records and simple tracking.',
    features: [
      'Max 2 active projects',
      'Max 2 employees',
      'Crop stage tracking',
      'Season budget tracking',
      'Expense recording',
      'Harvest recording (any unit)',
      'Basic reports',
      '7-day free trial',
    ],
    popular: false,
    pricing: {
      monthly: 2500,
      season: 8500,
      annual: 24000,
    },
  },
  {
    name: 'Pro',
    value: 'pro',
    description: 'For serious farms and agribusiness teams that need deeper control.',
    features: [
      'Everything in Basic',
      'Unlimited projects',
      'Unlimited employees',
      'Multi-block management',
      'Advanced reports',
      'Harvest analytics',
      'Export to Excel/PDF',
      'Activity audit log',
      'Priority support',
      'Future AI & weather features (coming soon)',
    ],
    popular: true,
    pricing: {
      monthly: 5000,
      season: 15000,
      annual: 48000,
    },
  },
  {
    name: 'Enterprise',
    value: 'enterprise',
    description: 'For large teams, aggregators, and enterprise operations.',
    features: [
      'Custom onboarding',
      'Unlimited team members',
      'Dedicated support',
      'Custom integrations',
    ],
    popular: false,
    pricing: {
      monthly: null,
      season: null,
      annual: null,
    },
  },
];

export function getPlanPrice(value: 'basic' | 'pro' | 'enterprise', mode: BillingMode): number | null {
  const plan = SUBSCRIPTION_PLANS.find((p) => p.value === value);
  if (!plan) return null;
  return plan.pricing[mode];
}

export function getBillingModeLabel(mode: BillingMode): string {
  switch (mode) {
    case 'monthly':
      return 'Monthly';
    case 'season':
      return 'Per Season';
    case 'annual':
      return 'Annual';
    default:
      return 'Monthly';
  }
}

export function getBillingModeDurationLabel(mode: BillingMode): string {
  switch (mode) {
    case 'monthly':
      return 'Billed monthly';
    case 'season':
      return 'Billed per season';
    case 'annual':
      return 'Billed yearly (Best value)';
    default:
      return 'Billed monthly';
  }
}
