import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Supabase admin client: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY only.
 * No user JWT, no anon key — use for Edge Function queries that must run as service_role in PostgREST.
 */
export function createServiceRoleSupabaseClient(
  supabaseUrl: string,
  serviceRoleKey: string,
): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    },
  });
}
