const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseApiKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  '';

export type NotifyAmbassadorOnboardingPayload = {
  /** Ambassador email address — also shown in the developer admin notification. */
  to: string;
  /** Ambassador full name. */
  ambassadorName: string;
  /** Optional URL for the welcome email CTA button (use https in production). */
  dashboardUrl?: string;
};

type EdgeJson = {
  ok?: boolean;
  id?: string;
  logId?: string;
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
 * After ambassador onboarding completes: sends a welcome email to the ambassador and
 * an admin notification to the developer. Reuses the same Resend + email_logs system
 * as company onboarding — no new email service is created.
 */
export async function invokeNotifyAmbassadorOnboarding(
  payload: NotifyAmbassadorOnboardingPayload,
): Promise<{
  ok: boolean;
  error?: string;
  detail?: string;
  id?: string;
  adminNotifyOk?: boolean;
  adminNotifyError?: string;
}> {
  const { to, ambassadorName, dashboardUrl } = payload;

  if (!to?.trim() || !ambassadorName?.trim()) {
    return { ok: false, error: 'Invalid payload', detail: 'to and ambassadorName are required' };
  }

  if (!supabaseUrl || !supabaseApiKey) {
    return {
      ok: false,
      error: 'Misconfigured client',
      detail: 'Missing VITE_SUPABASE_URL or publishable/anon key',
    };
  }

  const body: Record<string, string> = {
    to: to.trim(),
    ambassadorName: ambassadorName.trim(),
  };
  if (dashboardUrl?.trim()) {
    body.dashboardUrl = dashboardUrl.trim();
  }

  const res = await fetch(
    `${supabaseUrl.replace(/\/$/, '')}/functions/v1/notify-ambassador-onboarding`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseApiKey,
      },
      body: JSON.stringify(body),
    },
  );

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
    adminNotifyError:
      typeof data.adminNotifyError === 'string' ? data.adminNotifyError : undefined,
  };
}
