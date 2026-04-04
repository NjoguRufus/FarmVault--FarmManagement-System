/**
 * Feature provider toggles. Employees and onboarding use Supabase-backed flows.
 */

export const employeesProvider =
  (import.meta.env.VITE_EMPLOYEES_PROVIDER as 'supabase' | undefined) ?? 'supabase';

export const isEmployeesSupabase = true;

export const onboardingProvider =
  (import.meta.env.VITE_ONBOARDING_PROVIDER as 'supabase' | undefined) ?? 'supabase';

export const isOnboardingSupabase = true;
