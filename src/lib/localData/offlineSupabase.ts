import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthedSupabase, getSupabaseAccessToken } from '@/lib/supabase';
import { getOfflineAwareSupabaseToken } from '@/lib/localData/clerkSessionCache';

let lastClient: SupabaseClient | null = null;

const dataTokenProvider = () => getOfflineAwareSupabaseToken(getSupabaseAccessToken);

/**
 * Authed Supabase client for the data + sync layer only (not for React components).
 * Uses cached Clerk→Supabase JWT when offline.
 * @throws if no token is available (caller should catch; skip remote I/O when offline w/o cache).
 */
export async function getDataLayerSupabase(): Promise<SupabaseClient> {
  const client = await getAuthedSupabase(dataTokenProvider);
  lastClient = client;
  return client;
}

export async function tryGetDataLayerSupabase(): Promise<SupabaseClient | null> {
  const t = await dataTokenProvider();
  if (!t) return null;
  const client = await getAuthedSupabase(dataTokenProvider);
  lastClient = client;
  return client;
}

export function getLastDataLayerSupabase(): SupabaseClient | null {
  return lastClient;
}
