/** Subscription plans - shared by BillingPage, landing PricingSection, and ChoosePlan. */
export interface PlanOption {
  name: string;
  value: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  popular: boolean;
}

export const SUBSCRIPTION_PLANS: PlanOption[] = [
  {
    name: 'Starter',
    value: 'starter',
    price: 'KES 2,500',
    period: '/month',
    description: 'Perfect for small farms getting started',
    features: [
      'Up to 5 projects',
      'Up to 10 users',
      'Basic reporting',
      'Email support',
      '5GB storage',
    ],
    popular: false,
  },
  {
    name: 'Professional',
    value: 'professional',
    price: 'KES 7,500',
    period: '/month',
    description: 'Ideal for growing agricultural businesses',
    features: [
      'Up to 20 projects',
      'Up to 50 users',
      'Advanced analytics',
      'Priority support',
      '25GB storage',
      'API access',
      'Custom reports',
    ],
    popular: true,
  },
  {
    name: 'Enterprise',
    value: 'enterprise',
    price: 'KES 15,000',
    period: '/month',
    description: 'For large-scale farm operations',
    features: [
      'Unlimited projects',
      'Unlimited users',
      'AI-powered insights',
      '24/7 phone support',
      '100GB storage',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantee',
    ],
    popular: false,
  },
];
