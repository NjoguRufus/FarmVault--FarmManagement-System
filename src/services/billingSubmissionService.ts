import type { SupabaseClient } from '@supabase/supabase-js';
import {
  invokeNotifyCompanyManualPaymentSubmitted,
  invokeNotifyDeveloperTransactional,
} from '@/lib/email';
import { mpesaRowIndicatesConfirmedPayment, mpesaRowIndicatesFailedPayment } from '@/services/subscriptionService';
import { getSupabaseAccessToken, supabase } from '@/lib/supabase';
import { db } from '@/lib/db';

type TokenProvider = () => Promise<string | null>;

export type ManualPaymentStatus = 'pending' | 'pending_verification' | 'approved' | 'rejected';

export interface CreatePaymentSubmissionInput {
  planCode: 'basic' | 'pro';
  billingCycle: 'monthly' | 'seasonal' | 'annual';
  amount: number;
  mpesaName: string;
  mpesaPhone: string;
  transactionCode: string;
  currency?: string;
  notes?: string | null;
}

export interface CreatePaymentRequestInput {
  companyId: string;
  plan: 'basic' | 'pro';
  amount: number;
  phoneNumber: string;
  mpesaCode?: string | null;
}

export interface CompanySubscriptionRow {
  company_id: string;
  plan_id: string | null;
  plan_code: string | null;
  plan: string | null;
  status: string | null;
  billing_mode: string | null;
  billing_cycle: string | null;
  is_trial: boolean | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  active_until: string | null;
  updated_at: string | null;
}

export interface PaymentSubmissionRow {
  id: string;
  company_id: string;
  plan_id: string;
  amount: number;
  status: ManualPaymentStatus | string;
  billing_mode: string | null;
  billing_cycle: string | null;
  currency: string | null;
  payment_method: string | null;
  mpesa_name: string | null;
  mpesa_phone: string | null;
  transaction_code: string | null;
  notes?: string | null;
  created_at: string;
  submitted_at: string | null;
  approved_at?: string | null;
  /** From list_company_payments: rows from subscription_payments vs STK-only mirror. */
  ledger_source?: 'subscription_payments' | 'mpesa_stk' | null;
}

export interface PendingPaymentStatusResult {
  hasPending: boolean;
  latest: PaymentSubmissionRow | null;
}

function normalizeRpcErrorMessage(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes('already submitted')) return raw;
  if (t.includes('amount does not match')) {
    return 'The amount does not match the selected plan and billing cycle. Refresh and try again.';
  }
  if (t.includes('not authorized')) return 'You are not allowed to submit a payment for this workspace.';
  return raw;
}

export async function createPaymentSubmission(
  input: CreatePaymentSubmissionInput,
  client?: SupabaseClient,
  getToken?: TokenProvider,
): Promise<string> {
  const sb = client ?? supabase;
  const { data, error } = await sb.rpc('submit_manual_subscription_payment', {
    _plan_code: input.planCode,
    _billing_cycle: input.billingCycle,
    _amount: input.amount,
    _mpesa_name: input.mpesaName.trim(),
    _mpesa_phone: input.mpesaPhone.trim(),
    _transaction_code: input.transactionCode.trim(),
    _currency: input.currency ?? 'KES',
    _notes: input.notes ?? null,
  });

  if (error) {
    throw new Error(normalizeRpcErrorMessage(error.message ?? 'Failed to submit payment'));
  }

  const id = typeof data === 'string' ? data : (data as unknown as string | null);
  if (!id) {
    throw new Error('Payment submitted but no reference was returned.');
  }
  // eslint-disable-next-line no-console
  console.log('[BillingSubmit] submit_manual_subscription_payment → public.subscription_payments id:', id);
  const notifyToken = getToken ?? getSupabaseAccessToken;
  const { data: payRow } = await sb
    .from('subscription_payments')
    .select('company_id')
    .eq('id', id)
    .maybeSingle();
  const companyId =
    payRow && typeof (payRow as { company_id?: unknown }).company_id === 'string'
      ? String((payRow as { company_id: string }).company_id).trim()
      : '';
  if (companyId) {
    void invokeNotifyCompanyManualPaymentSubmitted({ companyId, paymentId: id }, notifyToken).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[BillingSubmit] notify company (manual awaiting approval) failed:', err);
    });
  }
  void invokeNotifyDeveloperTransactional(
    { event: 'manual_payment_submitted', payment_id: id },
    notifyToken,
  ).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[BillingSubmit] notify developer (manual_payment_submitted) failed:', err);
  });
  return id;
}

export async function createPaymentRequest(input: CreatePaymentRequestInput): Promise<string> {
  // Legacy API: `payment_requests` table was removed in favor of `subscription_payments` + RPC.
  // Keep this function for older callers, but route to the new workflow.
  const tx = input.mpesaCode?.trim();
  if (!tx) {
    throw new Error('Transaction code is required.');
  }
  return createPaymentSubmission({
    planCode: input.plan,
    billingCycle: 'monthly',
    amount: input.amount,
    mpesaName: 'M-Pesa',
    mpesaPhone: input.phoneNumber.trim(),
    transactionCode: tx,
    currency: 'KES',
    notes: 'Legacy payment request submission',
  });
}

export async function getCurrentCompanySubscription(
  companyId: string,
): Promise<CompanySubscriptionRow | null> {
  const { data, error } = await db
    .public()
    .from('company_subscriptions')
    .select(
      'company_id, plan_id, plan_code, plan, status, billing_mode, billing_cycle, is_trial, trial_ends_at, current_period_end, active_until, updated_at',
    )
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? 'Failed to load subscription');
  }
  return (data as CompanySubscriptionRow | null) ?? null;
}

/**
 * When `list_company_payments` RPC is unavailable, merge subscription_payments + mpesa_payments
 * (confirmed + failed STK — same coverage as developer CompanyPaymentHistoryTab).
 */
async function fetchMergedPaymentHistoryFallback(companyId: string): Promise<PaymentSubmissionRow[]> {
  const idText = companyId.trim();

  const { data: subRows, error: subErr } = await db
    .public()
    .from('subscription_payments')
    .select(
      'id, company_id, plan_id, amount, status, billing_mode, billing_cycle, currency, payment_method, mpesa_name, mpesa_phone, transaction_code, notes, created_at, submitted_at, approved_at',
    )
    .eq('company_id', idText)
    .order('created_at', { ascending: false });

  if (subErr) {
    throw new Error(subErr.message ?? 'Failed to load payment history');
  }

  const sub = (subRows ?? []) as PaymentSubmissionRow[];

  const { data: mpesaRows, error: mpesaErr } = await supabase
    .from('mpesa_payments')
    .select(
      'id, company_id, amount, status, result_code, billing_cycle, plan, mpesa_receipt, phone, created_at, paid_at, result_desc',
    )
    .eq('company_id', idText)
    .order('created_at', { ascending: false });

  if (mpesaErr) {
    throw new Error(mpesaErr.message ?? 'Failed to load M-Pesa payments');
  }

  const subscriptionHasReceipt = (receipt: string) =>
    sub.some(
      (s) =>
        String(s.billing_mode ?? '').toLowerCase() === 'mpesa_stk' &&
        String(s.transaction_code ?? '').trim() === receipt,
    );

  const hasAnyMpesaStkSubscription = sub.some(
    (s) => String(s.billing_mode ?? '').toLowerCase() === 'mpesa_stk',
  );

  const extras: PaymentSubmissionRow[] = [];
  const planCycleFromMpesa = (m: { plan?: string | null; billing_cycle?: string | null }) => {
    const planRaw = String(m.plan ?? '');
    const planId = planRaw.toLowerCase().includes('basic') ? 'basic' : 'pro';
    const bc = String(m.billing_cycle ?? '');
    const cycle =
      bc && bc.toLowerCase() !== 'trial' && ['monthly', 'seasonal', 'annual'].includes(bc.toLowerCase())
        ? bc.toLowerCase()
        : 'monthly';
    return { planId, cycle };
  };

  for (const m of mpesaRows ?? []) {
    const raw = m as { result_code?: number | null; status?: string | null };
    const createdAt = String((m as { created_at: string }).created_at);
    const receipt = String((m as { mpesa_receipt?: string | null }).mpesa_receipt ?? '').trim();

    if (mpesaRowIndicatesConfirmedPayment(raw)) {
      if (receipt && subscriptionHasReceipt(receipt)) continue;
      if (!receipt && hasAnyMpesaStkSubscription) continue;

      const { planId, cycle } = planCycleFromMpesa(m as { plan?: string | null; billing_cycle?: string | null });
      const paidAt = String((m as { paid_at?: string | null }).paid_at ?? createdAt);

      extras.push({
        id: (m as { id: string }).id,
        company_id: idText,
        plan_id: planId,
        amount: Number((m as { amount?: number | null }).amount ?? 0),
        status: 'approved',
        billing_mode: 'mpesa_stk',
        billing_cycle: cycle,
        currency: 'KES',
        payment_method: 'mpesa_stk',
        mpesa_name: null,
        mpesa_phone: (m as { phone?: string | null }).phone ? String((m as { phone?: string | null }).phone) : null,
        transaction_code: receipt || null,
        notes: 'M-Pesa STK (confirmed)',
        created_at: createdAt,
        submitted_at: paidAt,
        approved_at: paidAt,
        ledger_source: 'mpesa_stk',
      });
      continue;
    }

    if (!mpesaRowIndicatesFailedPayment(raw)) continue;

    const { planId, cycle } = planCycleFromMpesa(m as { plan?: string | null; billing_cycle?: string | null });
    const resultDesc = String((m as { result_desc?: string | null }).result_desc ?? '').trim();

    extras.push({
      id: (m as { id: string }).id,
      company_id: idText,
      plan_id: planId,
      amount: Number((m as { amount?: number | null }).amount ?? 0),
      status: 'failed',
      billing_mode: 'mpesa_stk',
      billing_cycle: cycle,
      currency: 'KES',
      payment_method: 'mpesa_stk',
      mpesa_name: null,
      mpesa_phone: (m as { phone?: string | null }).phone ? String((m as { phone?: string | null }).phone) : null,
      transaction_code: receipt || null,
      notes: resultDesc || 'M-Pesa STK (failed)',
      created_at: createdAt,
      submitted_at: createdAt,
      approved_at: null,
      ledger_source: 'mpesa_stk',
    });
  }

  return [...sub, ...extras].sort((a, b) => {
    const ta = new Date(a.approved_at ?? a.submitted_at ?? a.created_at).getTime();
    const tb = new Date(b.approved_at ?? b.submitted_at ?? b.created_at).getTime();
    return tb - ta;
  });
}

export async function listCompanySubscriptionPayments(companyId: string): Promise<PaymentSubmissionRow[]> {
  const cid = companyId.trim();
  const { data: rpcData, error: rpcErr } = await supabase.rpc('list_company_payments', {
    _company_id: cid,
  });

  if (!rpcErr) {
    const rows = (rpcData as PaymentSubmissionRow[]) ?? [];
    if (rows.length > 0) return rows;
    // RPC can return no rows when membership used a mismatched JWT claim; RLS may still allow reads.
    return fetchMergedPaymentHistoryFallback(companyId);
  }

  // eslint-disable-next-line no-console
  console.warn('[listCompanySubscriptionPayments] RPC fallback:', rpcErr.message);
  return fetchMergedPaymentHistoryFallback(companyId);
}

export async function getPendingPaymentStatus(
  companyId: string,
  client?: SupabaseClient,
): Promise<PendingPaymentStatusResult> {
  const from = client
    ? client.schema('public').from('subscription_payments')
    : db.public().from('subscription_payments');
  const { data, error } = await from
    .select(
      'id, company_id, plan_id, amount, status, billing_mode, billing_cycle, currency, payment_method, mpesa_name, mpesa_phone, transaction_code, created_at, submitted_at',
    )
    .eq('company_id', companyId)
    .in('status', ['pending', 'pending_verification'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message ?? 'Failed to load payment status');
  }

  const row = (data?.[0] as PaymentSubmissionRow | undefined) ?? null;
  return {
    hasPending: row != null,
    latest: row,
  };
}
