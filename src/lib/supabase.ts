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
      console.log('[Supabase Token]', token);
      if (token) return token;
    }
    const w = window as Window & {
      Clerk?: {
        session?: {
          getToken: (options?: { template?: string }) => Promise<string | null>;
        };
        user?: unknown;
      };
    };
    const session = w.Clerk?.session;
    if (session?.getToken) {
      const token = await session.getToken({ template: 'supabase' });
      console.log('[Supabase Token]', token);
      return token ?? null;
    }
    return null;
  } catch {
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
