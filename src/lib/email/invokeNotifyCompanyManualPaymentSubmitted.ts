const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseApiKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  '';

type TokenProvider = () => Promise<string | null>;

/** After manual payment submit: company email on core.companies.email — awaiting approval. */
export async function invokeNotifyCompanyManualPaymentSubmitted(
  input: { companyId: string; paymentId: string },
  getToken: TokenProvider,
): Promise<void> {
  const cid = typeof input.companyId === 'string' ? input.companyId.trim() : '';
  const pid = typeof input.paymentId === 'string' ? input.paymentId.trim() : '';
  if (!cid || !pid) return;
  const token = await getToken();
  if (!token?.trim() || !supabaseUrl || !supabaseApiKey) return;

  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/notify-company-transactional`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token.trim()}`,
      apikey: supabaseApiKey,
    },
    body: JSON.stringify({
      company_id: cid,
      kind: 'manual_payment_submitted',
      payment_id: pid,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t.slice(0, 300) || `notify-company-transactional HTTP ${res.status}`);
  }
}
