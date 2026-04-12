import { getSupabaseAccessToken } from '@/lib/supabase';
import { parseSystemHealthPayload, type SystemHealthSnapshot } from '@/services/systemHealthService';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseApiKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  '';
const gatewayAuthorizationJwt =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || supabaseApiKey;

export type InvokeSystemHealthCheckResult =
  | { ok: true; snapshot: SystemHealthSnapshot; emailSent: boolean; emailError?: string | null }
  | { ok: false; error: string; detail?: string };

/**
 * Runs full health check (writes `system_health_logs` + optional alert email) via Edge Function.
 * Same behavior as pg_cron path; requires developer session.
 */
export async function invokeSystemHealthCheck(): Promise<InvokeSystemHealthCheckResult> {
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

  const url = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/system-health-check`;
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
      body: JSON.stringify({}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, error: 'Invoke failed', detail: msg };
  }

  const text = await res.text().catch(() => '');
  let data: Record<string, unknown> = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { ok: false, error: 'Invalid response', detail: text.slice(0, 300) };
    }
  }

  if (!res.ok) {
    return {
      ok: false,
      error: typeof data.error === 'string' ? data.error : `HTTP ${res.status}`,
      detail: typeof data.detail === 'string' ? data.detail : undefined,
    };
  }

  const snapshot = parseSystemHealthPayload(data);
  return {
    ok: true,
    snapshot,
    emailSent: data.emailSent === true,
    emailError: typeof data.emailError === 'string' ? data.emailError : null,
  };
}
