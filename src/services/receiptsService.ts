import { getAuthedSupabase, getSupabaseAccessToken, supabase } from '@/lib/supabase';

export type BillingReceiptStatus = 'paid' | 'refunded' | 'void' | 'pending';

export type BillingReceiptRow = {
  id: string;
  receipt_number: string;
  company_id: string;
  subscription_payment_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  transaction_reference: string | null;
  plan: string | null;
  status: BillingReceiptStatus | string;
  issued_at: string;
  pdf_storage_path: string;
  pdf_url: string | null;
  billing_period: string | null;
  company_name_snapshot: string | null;
  workspace_name_snapshot: string | null;
  admin_name_snapshot: string | null;
  customer_email: string | null;
  customer_phone?: string | null;
  email_sent_at: string | null;
};

export async function listReceiptsForCompany(companyId: string): Promise<BillingReceiptRow[]> {
  const { data, error } = await supabase
    .from('receipts')
    .select(
      'id,receipt_number,company_id,subscription_payment_id,amount,currency,payment_method,transaction_reference,plan,status,issued_at,pdf_storage_path,pdf_url,billing_period,company_name_snapshot,workspace_name_snapshot,admin_name_snapshot,customer_email,customer_phone,email_sent_at',
    )
    .eq('company_id', companyId)
    .order('issued_at', { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message || 'Failed to load receipts');
  }
  return (data ?? []) as BillingReceiptRow[];
}

export async function listReceiptsForDeveloper(search?: string): Promise<BillingReceiptRow[]> {
  const { data, error } = await supabase
    .from('receipts')
    .select(
      'id,receipt_number,company_id,subscription_payment_id,amount,currency,payment_method,transaction_reference,plan,status,issued_at,pdf_storage_path,pdf_url,billing_period,company_name_snapshot,workspace_name_snapshot,admin_name_snapshot,customer_email,customer_phone,email_sent_at',
    )
    .order('issued_at', { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(error.message || 'Failed to load receipts');
  }
  let rows = (data ?? []) as BillingReceiptRow[];
  const term = search?.trim().toLowerCase();
  if (term) {
    rows = rows.filter((r) => {
      const hay = [
        r.receipt_number,
        r.company_name_snapshot,
        r.customer_email,
        r.admin_name_snapshot,
        r.company_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(term);
    });
  }
  return rows;
}

export async function createReceiptPdfSignedUrl(
  pdfStoragePath: string,
  expiresInSeconds = 120,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from('billing-receipts')
    .createSignedUrl(pdfStoragePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'Could not create download link');
  }
  return data.signedUrl;
}

type TokenProvider = () => Promise<string | null>;

function resolveTokenProvider(explicit?: TokenProvider): TokenProvider {
  return explicit ?? getSupabaseAccessToken;
}

/** After payment approval: issue PDF receipt and optionally email company (billing-receipt-issue). */
export async function sendCompanyPaymentReceipt(
  subscriptionPaymentId: string,
  getToken?: TokenProvider,
  options?: { sendEmail?: boolean },
): Promise<void> {
  const client = await getAuthedSupabase(resolveTokenProvider(getToken));
  const sendEmail = options?.sendEmail !== false;
  const { data, error } = await client.functions.invoke<{
    ok?: boolean;
    success?: boolean;
    error?: string;
    detail?: string;
    deduped?: boolean;
  }>('billing-receipt-issue', {
    body: {
      action: 'issue',
      subscription_payment_id: subscriptionPaymentId,
      send_email: sendEmail,
    },
  });

  if (error) {
    let msg = error instanceof Error ? error.message : 'Receipt issuance failed';
    const res = (error as { context?: Response }).context;
    if (res && typeof res.clone === 'function') {
      try {
        const j = (await res.clone().json()) as { detail?: string; error?: string };
        const bit = j.detail || j.error;
        if (bit) msg = `${msg} — ${bit}`;
      } catch {
        /* ignore */
      }
    }
    throw new Error(msg);
  }
  const ok = data?.ok === true || data?.success === true;
  if (data && !ok && typeof data.error === 'string') {
    throw new Error(data.detail ? `${data.error}: ${data.detail}` : data.error);
  }
}

export async function resendBillingReceiptEmail(receiptId: string, getToken?: TokenProvider): Promise<void> {
  const client = await getAuthedSupabase(resolveTokenProvider(getToken));
  const { data, error } = await client.functions.invoke<{ ok?: boolean; error?: string }>(
    'billing-receipt-issue',
    {
      body: { action: 'resend_email', receipt_id: receiptId },
    },
  );

  if (error) {
    throw new Error(error.message ?? 'Resend failed');
  }
  if (data && data.ok !== true && typeof data.error === 'string') {
    throw new Error(data.error);
  }
}

export async function regenerateBillingReceipt(
  receiptId: string,
  options?: { sendEmail?: boolean },
  getToken?: TokenProvider,
): Promise<void> {
  const client = await getAuthedSupabase(resolveTokenProvider(getToken));
  const { data, error } = await client.functions.invoke<{ ok?: boolean; error?: string }>(
    'billing-receipt-issue',
    {
      body: {
        action: 'regenerate',
        receipt_id: receiptId,
        send_email: options?.sendEmail === true,
      },
    },
  );

  if (error) {
    throw new Error(error.message ?? 'Regenerate failed');
  }
  if (data && data.ok !== true && typeof data.error === 'string') {
    throw new Error(data.error);
  }
}

export async function updateBillingReceiptStatus(
  receiptId: string,
  status: 'refunded' | 'void' | 'paid',
): Promise<void> {
  const { error } = await supabase
    .from('receipts')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', receiptId);

  if (error) {
    throw new Error(error.message ?? 'Update failed');
  }
}

export type PaymentContactForReceiptPreview = {
  mpesa_name: string | null;
  mpesa_phone: string | null;
  reviewed_by: string | null;
  reviewer_full_name: string | null;
  reviewer_email: string | null;
  fallback_member_email: string | null;
};

/**
 * Resolve human-readable admin + email for receipt template (developer preview).
 * Prefers reviewer profile, then M-Pesa name, then any company member email.
 */
export async function fetchPaymentContactForReceiptPreview(
  subscriptionPaymentId: string,
  companyId: string,
): Promise<PaymentContactForReceiptPreview> {
  const empty: PaymentContactForReceiptPreview = {
    mpesa_name: null,
    mpesa_phone: null,
    reviewed_by: null,
    reviewer_full_name: null,
    reviewer_email: null,
    fallback_member_email: null,
  };

  const { data: pay, error } = await supabase
    .from('subscription_payments')
    .select('mpesa_name, mpesa_phone, reviewed_by')
    .eq('id', subscriptionPaymentId)
    .maybeSingle();

  if (error || !pay) {
    return empty;
  }

  const rb = pay.reviewed_by != null ? String(pay.reviewed_by).trim() : '';
  let reviewer_full_name: string | null = null;
  let reviewer_email: string | null = null;

  if (rb && rb !== 'mpesa_stk') {
    const { data: prof } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('clerk_user_id', rb)
      .maybeSingle();
    reviewer_full_name = prof?.full_name != null ? String(prof.full_name).trim() || null : null;
    reviewer_email = prof?.email != null ? String(prof.email).trim() || null : null;
  }

  let fallback_member_email: string | null = null;
  const { data: members } = await supabase
    .from('company_members')
    .select('clerk_user_id')
    .eq('company_id', companyId)
    .limit(30);

  const ids = [
    ...new Set(
      (members ?? [])
        .map((m: { clerk_user_id?: string }) => (m.clerk_user_id ? String(m.clerk_user_id).trim() : ''))
        .filter(Boolean),
    ),
  ];

  if (ids.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('email').in('clerk_user_id', ids);
    const hit = (profs ?? []).find((p: { email?: string | null }) => p.email && String(p.email).trim());
    fallback_member_email = hit?.email ? String(hit.email).trim() : null;
  }

  return {
    mpesa_name: pay.mpesa_name != null ? String(pay.mpesa_name).trim() || null : null,
    mpesa_phone: pay.mpesa_phone != null ? String(pay.mpesa_phone).trim() || null : null,
    reviewed_by: rb || null,
    reviewer_full_name,
    reviewer_email,
    fallback_member_email,
  };
}

export async function fetchCompanySubscriptionPeriod(companyId: string): Promise<{
  current_period_start: string | null;
  current_period_end: string | null;
  billing_cycle: string | null;
} | null> {
  const { data, error } = await supabase
    .from('company_subscriptions')
    .select('current_period_start, current_period_end, billing_cycle')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    return null;
  }
  return (data as {
    current_period_start: string | null;
    current_period_end: string | null;
    billing_cycle: string | null;
  } | null) ?? null;
}
