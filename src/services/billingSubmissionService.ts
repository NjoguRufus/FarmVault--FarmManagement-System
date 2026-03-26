import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';

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
  created_at: string;
  submitted_at: string | null;
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

export async function createPaymentSubmission(input: CreatePaymentSubmissionInput): Promise<string> {
  const { data, error } = await supabase.rpc('submit_manual_subscription_payment', {
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
  return id;
}

export async function createPaymentRequest(input: CreatePaymentRequestInput): Promise<string> {
  const id = crypto.randomUUID();
  const payload = {
    id,
    company_id: input.companyId,
    plan: input.plan,
    amount: input.amount,
    phone_number: input.phoneNumber.trim(),
    mpesa_code: input.mpesaCode?.trim() || null,
    status: 'pending',
    created_at: new Date().toISOString(),
  };

  const { error } = await db.public().from('payment_requests').insert(payload);
  if (error) {
    throw new Error(error.message ?? 'Failed to submit payment request');
  }
  return id;
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

export async function listCompanySubscriptionPayments(companyId: string): Promise<PaymentSubmissionRow[]> {
  const { data, error } = await db
    .public()
    .from('subscription_payments')
    .select(
      'id, company_id, plan_id, amount, status, billing_mode, billing_cycle, currency, payment_method, mpesa_name, mpesa_phone, transaction_code, created_at, submitted_at',
    )
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message ?? 'Failed to load payment history');
  }
  return (data as PaymentSubmissionRow[]) ?? [];
}

export async function getPendingPaymentStatus(companyId: string): Promise<PendingPaymentStatusResult> {
  const { data, error } = await db
    .public()
    .from('subscription_payments')
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
