import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from "@/lib/logger";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
// Prefer the new publishable key; fall back to anon for backwards compatibility.
const supabaseKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
}

/**
 * Clerk JWT template name (Dashboard → JWT Templates → New → name: `supabase`).
 * Claims should include at least:
 *   "sub": "{{user.id}}"
 *   "email": "{{user.primary_email_address.email_address}}"
 * so Supabase `auth.jwt()->>'sub'` and edge functions (e.g. mpesa-stk-push) resolve the Clerk user id.
 */
export const CLERK_JWT_TEMPLATE_SUPABASE = 'supabase' as const;

/** SessionStorage flag: one hard redirect per tab to /sign-in when Supabase runs with no Clerk session (cleared on sign-in). */
export const NO_CLERK_SESSION_REDIRECT_FLAG_KEY = 'farmvault:redirected:no-clerk-session:v1';

/** Set by ClerkSupabaseTokenBridge so token comes from useAuth().getToken() (reliable in React). */
let clerkTokenGetter: (() => Promise<string | null>) | null = null;

export function setClerkTokenGetter(getter: (() => Promise<string | null>) | null) {
  clerkTokenGetter = getter;
}

/**
 * Clerk JWT for Supabase (PostgREST RLS, Edge Functions, Realtime).
 * Must use JWT template {@link CLERK_JWT_TEMPLATE_SUPABASE} so `sub` is the Clerk user id.
 */
export async function getSupabaseAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    // Priority 1: Use the React hook bridge (most reliable)
    if (clerkTokenGetter) {
      const token = await clerkTokenGetter();
      if (import.meta.env.DEV) {
        logger.debug('[Supabase] Token from bridge:', !!token ? 'exists' : 'null');
        if (token) {
          logJwtClaims(token, 'bridge');
        }
      }
      return token ?? null;
    }

    // Priority 2: Fallback to window.Clerk (before React mounts)
    const w = window as Window & {
      Clerk?: {
        session?: {
          getToken: (opts?: { template?: string }) => Promise<string | null>;
        };
      };
    };

    const session = w.Clerk?.session;
    if (!session?.getToken) {
      // Send signed-out users to sign-in when Clerk has finished loading and there is no session.
      // Skip while Clerk is still hydrating (`loaded` false) or when a session object exists but the
      // bridge is not registered yet — avoids false redirects on mobile.
      try {
        const clerk = w.Clerk as { loaded?: boolean; session?: unknown; isSignedIn?: boolean } | undefined;
        const clerkLoaded = clerk?.loaded === true;
        /** Prefer explicit signed-out; avoids redirect if `session` is briefly null while still signed in. */
        const clerkSignedOut = clerkLoaded && clerk?.isSignedIn === false;
        const p = window.location?.pathname || '/';
        const isAuthRoute =
          p.startsWith('/sign-in') ||
          p.startsWith('/sign-up') ||
          p.startsWith('/auth/') ||
          p.startsWith('/onboarding') ||
          p.startsWith('/accept-invitation') ||
          p.startsWith('/dev/bootstrap') ||
          p.startsWith('/emergency-access');
        const alreadyRedirected = window.sessionStorage.getItem(NO_CLERK_SESSION_REDIRECT_FLAG_KEY) === '1';
        if (clerkSignedOut && !isAuthRoute && !alreadyRedirected) {
          window.sessionStorage.setItem(NO_CLERK_SESSION_REDIRECT_FLAG_KEY, '1');
          window.location.assign('/sign-in?reason=no-clerk-session');
        }
      } catch {
        // ignore
      }
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[Supabase] No Clerk session available - user may not be signed in');
      }
      return null;
    }

    const token = await session.getToken({ template: CLERK_JWT_TEMPLATE_SUPABASE });

    if (import.meta.env.DEV) {
      logger.debug('[Supabase] Token from window.Clerk:', !!token ? 'exists' : 'null');
      if (token) {
        logJwtClaims(token, 'window.Clerk');
      } else {
        // eslint-disable-next-line no-console
        console.warn('[Supabase] No session token returned. User may not be authenticated.');
      }
    }

    return token ?? null;
  } catch (err) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[Supabase] Error getting access token:', err);
    }
    return null;
  }
}

type ClerkSupabaseTokenProvider = () => Promise<string | null>;

/** Avoid sharing the default GoTrue storage key with {@link supabase} (prevents "Multiple GoTrueClient instances" warnings). */
function clerkJwtFetchAuthStorageKey(): string {
  try {
    const host = new URL(supabaseUrl).hostname.split('.')[0];
    return `sb-${host}-clerk-jwt-fetch`;
  } catch {
    return 'sb-clerk-jwt-fetch';
  }
}

/**
 * Single client for Clerk-JWT-per-request flows. Updated token source on each {@link getAuthedSupabase} call.
 * Concurrent calls should use the same logical session (typical); last-set provider wins only for overlapping fetch timing.
 */
let authedSupabaseSingleton: SupabaseClient | null = null;
let authedSupabaseFetchToken: ClerkSupabaseTokenProvider = getSupabaseAccessToken;

/**
 * Supabase client whose HTTP layer sends a fresh `Authorization: Bearer <Clerk JWT>` per request.
 * Use for billing / STK when you want the same token source as {@link CLERK_JWT_TEMPLATE_SUPABASE}
 * (e.g. pass `() => getToken({ template: 'supabase' })` from `useAuth()` in `@clerk/react`).
 *
 * Reuses one underlying client so we do not stack GoTrue clients on the default auth storage key.
 */
export async function getAuthedSupabase(
  tokenProvider: ClerkSupabaseTokenProvider = getSupabaseAccessToken,
): Promise<SupabaseClient> {
  const probe = await tokenProvider();
  if (!probe) {
    throw new Error(
      `Not signed in: missing Clerk JWT for template "${CLERK_JWT_TEMPLATE_SUPABASE}".`,
    );
  }
  authedSupabaseFetchToken = tokenProvider;

  if (!authedSupabaseSingleton) {
    authedSupabaseSingleton = createClient(supabaseUrl, supabaseKey, {
      auth: {
        storageKey: clerkJwtFetchAuthStorageKey(),
        detectSessionInUrl: false,
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        fetch: async (url, options = {}) => {
          const token = await authedSupabaseFetchToken();
          const headers = new Headers(options.headers);
          if (token) {
            headers.set('Authorization', `Bearer ${token}`);
          }
          return fetch(url, { ...options, headers });
        },
      },
    });
  }
  return authedSupabaseSingleton;
}

/**
 * Log JWT claims for debugging (development only).
 * Does NOT log the full token string for security.
 */
function logJwtClaims(token: string, source: string): void {
  if (!import.meta.env.DEV) return;
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      logger.debug(`[Supabase] JWT claims (from ${source}):`, {
        aud: payload.aud,
        role: payload.role,
        sub: payload.sub,
        user_id: payload.user_id,
        email: payload.email,
        exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
      });
    }
  } catch {
    // eslint-disable-next-line no-console
    console.warn('[Supabase] Could not decode JWT payload');
  }
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    detectSessionInUrl: false,
  },
  // Clerk → Supabase third-party auth: send Clerk session token on each request.
  // Supabase will verify the token and expose claims via auth.jwt() / auth.uid().
  accessToken: getSupabaseAccessToken,
});

// Dev guard: no supabase.from('schema.table') for billing; use .schema('billing').from('table') instead.
const originalFrom = supabase.from.bind(supabase);
(supabase as any).from = (table: string) => {
  if (import.meta.env.DEV && typeof table === 'string' && table.includes('.')) {
    if (table.startsWith('billing.')) {
      throw new Error(
        `[supabase.from] Use supabase.schema('billing').from('${table.replace('billing.', '')}') instead of supabase.from('${table}').`,
      );
    }
    const allowed = ['public.company_subscriptions_readonly'];
    if (!allowed.includes(table)) {
      throw new Error(
        `[supabase.from] Invalid table "${table}". Use supabase.schema('schema').from('table') or db.<schema>().from('table') instead of 'schema.table'.`,
      );
    }
  }
  return originalFrom(table);
};
