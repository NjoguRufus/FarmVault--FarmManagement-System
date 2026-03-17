import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
// Prefer the new publishable key; fall back to anon for backwards compatibility.
const supabaseKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
}

/** Set by ClerkSupabaseTokenBridge so token comes from useAuth().getToken() (reliable in React). */
let clerkTokenGetter: (() => Promise<string | null>) | null = null;

export function setClerkTokenGetter(getter: (() => Promise<string | null>) | null) {
  clerkTokenGetter = getter;
}

/**
 * Get the Supabase access token from Clerk.
 * Uses the NATIVE Clerk-Supabase integration (standard session token, no JWT template).
 * This ensures proper authentication with Supabase RLS policies via Clerk's JWKS.
 */
export async function getSupabaseAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    // Priority 1: Use the React hook bridge (most reliable)
    if (clerkTokenGetter) {
      const token = await clerkTokenGetter();
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[Supabase] Token from bridge:', !!token ? 'exists' : 'null');
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
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[Supabase] No Clerk session available - user may not be signed in');
      }
      return null;
    }

    // Use standard session token - native Supabase integration (no template needed)
    const token = await session.getToken();

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[Supabase] Token from window.Clerk:', !!token ? 'exists' : 'null');
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
      // eslint-disable-next-line no-console
      console.log(`[Supabase] JWT claims (from ${source}):`, {
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
