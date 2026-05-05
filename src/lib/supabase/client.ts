/**
 * Supabase client factory that injects a Clerk JWT on each request (custom `fetch`).
 * Caller should pass getToken that uses template `supabase` (see CLERK_JWT_TEMPLATE_SUPABASE).
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const supabaseKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY.',
  );
}

export function createSupabaseClientWithClerkToken(getToken: () => Promise<string | null>) {
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      detectSessionInUrl: false,
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: async (url, options = {}) => {
        const token = await getToken();
        const headers = new Headers(options.headers);
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
        return fetch(url, { ...options, headers });
      },
    },
  });
}
