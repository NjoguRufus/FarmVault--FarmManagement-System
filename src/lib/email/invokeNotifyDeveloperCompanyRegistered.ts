const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseApiKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  '';

type EdgeJson = {
  ok?: boolean;
  skipped?: boolean;
  reason?: string;
  id?: string;
  error?: string;
  detail?: string;
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
 * After `complete_company_onboarding`: notifies the developer inbox (Resend) with company,
 * trial, and optional ambassador attribution. Fire-and-forget safe; duplicates are skipped server-side.
 */
export async function invokeNotifyDeveloperCompanyRegistered(companyId: string): Promise<{
  ok: boolean;
  skipped?: boolean;
  error?: string;
  detail?: string;
}> {
  const cid = typeof companyId === 'string' ? companyId.trim() : '';
  if (!cid) {
    return { ok: false, error: 'Invalid payload', detail: 'companyId is required' };
  }

  if (!supabaseUrl || !supabaseApiKey) {
    return {
      ok: false,
      error: 'Misconfigured client',
      detail: 'Missing VITE_SUPABASE_URL or publishable/anon key',
    };
  }

  const res = await fetch(
    `${supabaseUrl.replace(/\/$/, '')}/functions/v1/notify-developer-company-registered`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseApiKey}`,
        apikey: supabaseApiKey,
      },
      body: JSON.stringify({ company_id: cid }),
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
    skipped: data.skipped === true,
  };
}
