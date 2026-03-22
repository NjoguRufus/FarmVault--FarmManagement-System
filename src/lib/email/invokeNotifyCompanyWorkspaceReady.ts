import { supabase, getSupabaseAccessToken } from '@/lib/supabase';

export type NotifyCompanyWorkspaceReadyPayload = {
  to: string;
  companyName: string;
  dashboardUrl: string;
};

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

  const { data, error } = await supabase.functions.invoke<{
    ok?: boolean;
    id?: string;
    error?: string;
    detail?: string;
  }>('notify-company-workspace-ready', {
    body: {
      to: to.trim(),
      companyName: companyName.trim(),
      dashboardUrl: dashboardUrl.trim(),
    },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
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
