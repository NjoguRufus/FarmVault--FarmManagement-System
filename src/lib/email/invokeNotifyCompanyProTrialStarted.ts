const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseApiKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
 '';

type TokenProvider = () => Promise<string | null>;

/** After onboarding completes: Pro trial started email to `core.companies.owner_email`. */
export async function invokeNotifyCompanyProTrialStarted(
  companyId: string,
  getToken: TokenProvider,
): Promise<void> {
  const cid = typeof companyId === 'string' ? companyId.trim() : '';
  if (!cid) return;
  const token = await getToken();
  if (!token?.trim() || !supabaseUrl || !supabaseApiKey) return;

  const res = await fetch(
    `${supabaseUrl.replace(/\/$/, '')}/functions/v1/notify-company-transactional`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token.trim()}`,
        apikey: supabaseApiKey,
      },
      body: JSON.stringify({ company_id: cid, kind: 'pro_trial_started' }),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t.slice(0, 300) || `notify-company-transactional HTTP ${res.status}`);
  }
}
