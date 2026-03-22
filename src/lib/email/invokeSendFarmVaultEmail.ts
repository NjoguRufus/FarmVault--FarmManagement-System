import { supabase, getSupabaseAccessToken } from '@/lib/supabase';

import type { SendFarmVaultEmailPayload } from './types';

export type InvokeSendFarmVaultEmailResult = {
  ok: boolean;
  id?: string;
  logId?: string;
  emailType?: string;
  error?: string;
  detail?: string;
};

/**
 * Calls the send-farmvault-email Edge Function with the caller's Clerk session token.
 * The API only delivers to the signed-in user's email unless the function is called with an internal secret (server-side).
 */
export async function invokeSendFarmVaultEmail(
  payload: SendFarmVaultEmailPayload,
): Promise<InvokeSendFarmVaultEmailResult> {
  const token = await getSupabaseAccessToken();
  if (!token) {
    return { ok: false, error: 'Unauthorized', detail: 'Not signed in' };
  }

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    id?: string;
    logId?: string;
    emailType?: string;
    error?: string;
    detail?: string;
  }>('send-farmvault-email', {
    body: payload,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (error) {
    return { ok: false, error: error.message || 'Invoke failed', detail: error.name };
  }

  if (data?.error) {
    return {
      ok: false,
      error: data.error,
      detail: typeof data.detail === 'string' ? data.detail : undefined,
    };
  }

  return {
    ok: !!data?.ok,
    id: data?.id,
    logId: typeof data?.logId === 'string' ? data.logId : undefined,
    emailType: data?.emailType,
  };
}
