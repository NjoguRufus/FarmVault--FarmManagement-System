/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_EMPLOYEES_PROVIDER?: 'supabase';
  readonly VITE_ONBOARDING_PROVIDER?: 'supabase';
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}
