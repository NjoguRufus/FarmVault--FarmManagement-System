/**
 * Supabase client factory that uses Clerk session token.
 * Use this when you need a client that injects the Clerk JWT (no Supabase Auth).
 * 
 * IMPORTANT: The getToken callback MUST request the 'supabase' JWT template.
 * Caller is responsible for passing: () => clerkGetToken({ template: 'supabase' })
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.');
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
