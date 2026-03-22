import { FunctionsHttpError } from '@supabase/functions-js';
import { supabase, getSupabaseAccessToken } from '@/lib/supabase';

export type NotifyCompanyWorkspaceReadyPayload = {
  to: string;
  companyName: string;
  dashboardUrl: string;
};

async function parseFunctionsHttpErrorBody(err: FunctionsHttpError): Promise<{
  error?: string;
  detail?: string;
}> {
  const res = err.context;
  if (!(res instanceof Response)) return {};
  const text = await res.text().catch(() => '');
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as { error?: unknown; detail?: unknown };
    return {
      error: typeof parsed.error === 'string' ? parsed.error : undefined,
      detail: typeof parsed.detail === 'string' ? parsed.detail : undefined,
    };
  } catch {
    return { detail: text.slice(0, 500) };
  }
}

/**
 * Developer dashboard: sends workspace-ready email via Edge Function (Resend).
 * Caller supplies recipient, company name, and dashboard URL — the function does not query the DB.
 */
export async function invokeNotifyCompanyWorkspaceReady(
  payload: NotifyCompanyWorkspaceReadyPayload,
): Promise<{
  ok: boolean;
  error?: string;
  detail?: string;
  id?: string;
}> {
  const token = await getSupabaseAccessToken();
  if (!token) {
    return { ok: false, error: 'Unauthorized', detail: 'Not signed in' };
  }

  const { to, companyName, dashboardUrl } = payload;

  if (!to?.trim() || !companyName?.trim() || !dashboardUrl?.trim()) {
    return { ok: false, error: 'Invalid payload', detail: 'to, companyName, and dashboardUrl are required' };
  }

  const body = {
    to: to.trim(),
    companyName: companyName.trim(),
    dashboardUrl: dashboardUrl.trim(),
  };

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    id?: string;
    error?: string;
    detail?: string;
  }>('notify-company-workspace-ready', {
    body,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const fromBody = await parseFunctionsHttpErrorBody(error);
      return {
        ok: false,
        error: fromBody.error ?? error.message,
        detail: fromBody.detail,
      };
    }
    return { ok: false, error: error.message || 'Invoke failed' };
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
    id: typeof data?.id === 'string' ? data.id : undefined,
  };
}
