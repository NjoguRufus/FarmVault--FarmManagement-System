const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseApiKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  '';

type TokenProvider = () => Promise<string | null>;

/** Company billing emails via notify-company-transactional (developer/admin JWT). */
export type NotifyCompanyTransactionalInput =
  | { companyId: string; kind: 'payment_received'; subscriptionPaymentId: string }
  | { companyId: string; kind: 'payment_approved'; subscriptionPaymentId: string };

export async function invokeNotifyCompanyTransactional(
  input: NotifyCompanyTransactionalInput,
  getToken: TokenProvider,
): Promise<void> {
  const cid = typeof input.companyId === 'string' ? input.companyId.trim() : '';
  const pid = typeof input.subscriptionPaymentId === 'string' ? input.subscriptionPaymentId.trim() : '';
  if (!cid || !pid) return;
  if (input.kind !== 'payment_received' && input.kind !== 'payment_approved') return;
  const token = await getToken();
  if (!token?.trim()) {
    console.warn(
      `[invokeNotifyCompanyTransactional] skipped (${input.kind}) — no Clerk JWT (template \`supabase\`).`,
    );
    return;
  }
  if (!supabaseUrl || !supabaseApiKey) {
    console.warn(`[invokeNotifyCompanyTransactional] skipped (${input.kind}) — missing VITE_SUPABASE_URL or key`);
    return;
  }

  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/notify-company-transactional`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token.trim()}`,
      apikey: supabaseApiKey,
    },
    body: JSON.stringify({
      company_id: cid,
      kind: input.kind,
      subscription_payment_id: pid,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t.slice(0, 300) || `notify-company-transactional HTTP ${res.status}`);
  }
}
