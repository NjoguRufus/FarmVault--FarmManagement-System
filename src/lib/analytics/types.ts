import type { UserRole } from '@/types';

/** Safe person properties for PostHog (no farm operational payloads). */
export interface AnalyticsIdentifyProps {
  /** Same as distinct_id: Clerk user id (aligned with Supabase profiles.clerk_user_id). */
  user_id: string;
  email?: string | null;
  full_name?: string | null;
  role?: UserRole | string | null;
  company_id?: string | null;
  company_name?: string | null;
  subscription_plan?: string | null;
  tenant_status?: string | null;
  onboarding_status?: 'incomplete' | 'complete' | 'na' | string | null;
  is_developer?: boolean;
}

export interface AnalyticsCompanyGroupProps {
  company_id: string;
  company_name?: string | null;
  plan?: string | null;
  status?: string | null;
  created_at?: string | null;
  trial_end?: string | null;
  active_until?: string | null;
}

/**
 * Common optional properties for custom events and $pageview.
 * Keep values small and categorical — never attach raw financial rows or secrets.
 */
export type AnalyticsEventProps = Record<
  string,
  string | number | boolean | null | undefined
>;
