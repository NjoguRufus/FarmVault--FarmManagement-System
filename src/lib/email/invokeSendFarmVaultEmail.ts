import { getSupabaseAccessToken } from '@/lib/supabase';

import type { SendFarmVaultEmailPayload } from './types';

export type InvokeSendFarmVaultEmailResult = {
  ok: boolean;
  id?: string;
  logId?: string;
  emailType?: string;
  error?: string;
  detail?: string;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseApiKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  '';
/** Supabase-signed JWT for the API gateway (HS256). Prefer anon; publishable keys are not always JWTs. */
const gatewayAuthorizationJwt =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || supabaseApiKey;

type EdgeJson = {
  ok?: boolean;
  id?: string;
  logId?: string;
  emailType?: string;
  error?: string;
  detail?: string;
};

/**
 * `send-farmvault-email` is often deployed with JWT verification **on** at the gateway. Clerk session
 * tokens are **RS256**, which the gateway rejects. We send:
 * - `Authorization: Bearer <anon JWT>` — satisfies the gateway
 * - `X-FarmVault-Clerk-Authorization: Bearer <Clerk>` — used inside the function for `getUser` / `is_developer`
 *
 * If the gateway has verify_jwt off, the function still accepts Clerk-only `Authorization`.
 */
export async function invokeSendFarmVaultEmail(
  payload: SendFarmVaultEmailPayload,
): Promise<InvokeSendFarmVaultEmailResult> {
  const clerkToken = await getSupabaseAccessToken();
  if (!clerkToken) {
    return { ok: false, error: 'Unauthorized', detail: 'Not signed in' };
  }

  if (!supabaseUrl?.trim() || !supabaseApiKey) {
    return {
      ok: false,
      error: 'Misconfigured client',
      detail: 'Missing VITE_SUPABASE_URL or publishable/anon key',
    };
  }

  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/send-farmvault-email`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseApiKey,
        Authorization: `Bearer ${gatewayAuthorizationJwt}`,
        'X-FarmVault-Clerk-Authorization': `Bearer ${clerkToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, error: 'Invoke failed', detail: msg };
  }

  const text = await res.text().catch(() => '');
  let data: EdgeJson = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text) as EdgeJson;
    } catch {
      data = { detail: text.slice(0, 500) };
    }
  }

  if (!res.ok) {
    return {
      ok: false,
      error: data.error ?? `HTTP ${res.status}`,
      detail: typeof data.detail === 'string' ? data.detail : undefined,
    };
  }

  if (data.error) {
    return {
      ok: false,
      error: data.error,
      detail: typeof data.detail === 'string' ? data.detail : undefined,
    };
  }

  return {
    ok: !!data.ok,
    id: data.id,
    logId: typeof data.logId === 'string' ? data.logId : undefined,
    emailType: data.emailType,
  };
}
