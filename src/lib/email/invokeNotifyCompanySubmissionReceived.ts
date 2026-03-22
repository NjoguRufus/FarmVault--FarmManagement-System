const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseApiKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  '';

export type NotifyCompanySubmissionReceivedPayload = {
  to: string;
  companyName: string;
  dashboardUrl: string;
  /** Account / submitter email for the admin notification (defaults to `to` on the server if omitted). */
  userEmail: string;
  /** Developer console URL to review signups (https). */
  approvalDashboardUrl: string;
};

type EdgeJson = {
  ok?: boolean;
  id?: string;
  error?: string;
  detail?: string;
  adminNotifyOk?: boolean;
  adminNotifyError?: string;
};

async function parseJsonResponse(res: Response): Promise<EdgeJson> {
  const text = await res.text().catch(() => '');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as EdgeJson;
  } catch {
    return { detail: text.slice(0, 500) };
  }
}

/**
 * After onboarding submission: user confirmation + internal admin notify via the same Edge Function.
 */
export async function invokeNotifyCompanySubmissionReceived(
  payload: NotifyCompanySubmissionReceivedPayload,
): Promise<{
  ok: boolean;
  error?: string;
  detail?: string;
  id?: string;
  adminNotifyOk?: boolean;
  adminNotifyError?: string;
}> {
  const { to, companyName, dashboardUrl, userEmail, approvalDashboardUrl } = payload;

  if (!to?.trim() || !companyName?.trim() || !dashboardUrl?.trim()) {
    return { ok: false, error: 'Invalid payload', detail: 'to, companyName, and dashboardUrl are required' };
  }
  if (!userEmail?.trim() || !approvalDashboardUrl?.trim()) {
    return {
      ok: false,
      error: 'Invalid payload',
      detail: 'userEmail and approvalDashboardUrl are required',
    };
  }

  if (!supabaseUrl || !supabaseApiKey) {
    return {
      ok: false,
      error: 'Misconfigured client',
      detail: 'Missing VITE_SUPABASE_URL or publishable/anon key',
    };
  }

  const body = {
    to: to.trim(),
    companyName: companyName.trim(),
    dashboardUrl: dashboardUrl.trim(),
    userEmail: userEmail.trim(),
    approvalDashboardUrl: approvalDashboardUrl.trim(),
  };

  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/notify-company-submission-received`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseApiKey,
    },
    body: JSON.stringify(body),
  });

  const data = await parseJsonResponse(res);

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
    id: typeof data.id === 'string' ? data.id : undefined,
    adminNotifyOk: data.adminNotifyOk,
    adminNotifyError: typeof data.adminNotifyError === 'string' ? data.adminNotifyError : undefined,
  };
}
