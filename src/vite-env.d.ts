/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_EMPLOYEES_PROVIDER?: 'supabase';
  readonly VITE_ONBOARDING_PROVIDER?: 'supabase';
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  /** M-Pesa paybill / till number shown on billing checkout (digits). */
  readonly VITE_MPESA_TILL_NUMBER?: string;
  /** Display name for M-Pesa till (e.g. FarmVault). */
  readonly VITE_MPESA_BUSINESS_NAME?: string;
  /** When "false", hides M-Pesa STK push on billing checkout; default is on. */
  readonly VITE_ENABLE_MPESA_STK?: string;
  /** PostHog project API key (public). Preferred name for new setups. */
  readonly VITE_PUBLIC_POSTHOG_PROJECT_TOKEN?: string;
  /** @deprecated use VITE_PUBLIC_POSTHOG_PROJECT_TOKEN */
  readonly VITE_PUBLIC_POSTHOG_KEY?: string;
  /** PostHog API host, e.g. https://us.i.posthog.com or EU equivalent. */
  readonly VITE_PUBLIC_POSTHOG_HOST?: string;
  /** When "1" / "true", enables session replay with input masking (opt-in). */
  readonly VITE_PUBLIC_POSTHOG_SESSION_REPLAY?: string;
  /** OneSignal web app id for browser initialization/status checks. */
  readonly VITE_ONESIGNAL_APP_ID?: string;
  /** Web Push VAPID public key (URL-safe base64). Pair with Edge secrets VAPID_* and `npm run generate:vapid`. */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}
