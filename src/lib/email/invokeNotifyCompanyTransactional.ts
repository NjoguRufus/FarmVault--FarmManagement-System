const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseApiKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  '';

type TokenProvider = () => Promise<string | null>;

/** After approved payment: same Resend path as onboarding (notify-company-transactional + billing@). */
export type NotifyCompanyPaymentReceivedInput = {
  companyId: string;
  kind: 'payment_received';
  subscriptionPaymentId: string;
};

export async function invokeNotifyCompanyTransactional(
  input: NotifyCompanyPaymentReceivedInput,
  getToken: TokenProvider,
): Promise<void> {
  const cid = typeof input.companyId === 'string' ? input.companyId.trim() : '';
  const pid = typeof input.subscriptionPaymentId === 'string' ? input.subscriptionPaymentId.trim() : '';
  if (!cid || !pid || input.kind !== 'payment_received') return;
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
      kind: 'payment_received',
      subscription_payment_id: pid,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t.slice(0, 300) || `notify-company-transactional HTTP ${res.status}`);
  }
}
