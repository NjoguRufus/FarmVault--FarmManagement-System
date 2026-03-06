/**
 * Feature provider toggles. App uses Supabase only (Firebase removed).
 */

export const employeesProvider =
  (import.meta.env.VITE_EMPLOYEES_PROVIDER as 'supabase' | undefined) ?? 'supabase';

export const isEmployeesSupabase = true;
export const isEmployeesFirebase = false;

export const onboardingProvider =
  (import.meta.env.VITE_ONBOARDING_PROVIDER as 'supabase' | undefined) ?? 'supabase';

export const isOnboardingSupabase = true;
export const isOnboardingFirebase = false;
