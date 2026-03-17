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

export async function getSupabaseAccessToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    if (clerkTokenGetter) {
      const token = await clerkTokenGetter();
      if (token) {
        if (import.meta.env.DEV) {
          // Debug: decode and log JWT claims (don't log the full token in production!)
          try {
            const parts = token.split('.');
            if (parts.length === 3) {
              const payload = JSON.parse(atob(parts[1]));
              // eslint-disable-next-line no-console
              console.log('[Supabase] JWT token claims:', {
                aud: payload.aud,
                role: payload.role,
                sub: payload.sub,
                user_id: payload.user_id,
                email: payload.email,
                exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
                iat: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
              });
            }
          } catch {
            // Ignore decode errors
          }
        }
        return token;
      }
    }
    // Fallback to window.Clerk if React hook isn't available yet
    const w = window as Window & { Clerk?: { session?: { getToken: (opts?: { template?: string }) => Promise<string | null> }; user?: unknown } };
    const session = w.Clerk?.session;
    if (session?.getToken) {
      // Try supabase template first
      try {
        const token = await session.getToken({ template: 'supabase' });
        if (token) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[Supabase] Got token via window.Clerk (supabase template)');
          }
          return token;
        }
      } catch {
        // Template might not exist, try default
      }
      const token = await session.getToken();
      if (import.meta.env.DEV && token) {
        // eslint-disable-next-line no-console
        console.log('[Supabase] Got token via window.Clerk (default)');
      }
      return token ?? null;
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[Supabase] No token available - user may not be signed in');
    }
    return null;
  } catch (err) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[Supabase] Error getting access token:', err);
    }
    return null;
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
