import { getSupabaseAccessToken, supabase } from '@/lib/supabase';
import type { BillingSubmissionCycle, BillingSubmissionPlan } from '@/lib/billingPricing';

export interface MpesaStkPushResult {
  checkoutRequestId: string;
  merchantRequestId: string;
  customerMessage?: string;
}

export async function initiateMpesaStkPush(params: {
  companyId: string;
  phoneNumber: string;
  planCode: BillingSubmissionPlan;
  billingCycle: BillingSubmissionCycle;
}): Promise<MpesaStkPushResult> {
  const token = await getSupabaseAccessToken();
  if (!token) {
    throw new Error('You must be signed in to pay with M-Pesa STK.');
  }

  const { data, error } = await supabase.functions.invoke<{
    success?: boolean;
    ok?: boolean;
    checkoutRequestId?: string;
    merchantRequestId?: string;
    customerMessage?: string;
    error?: string;
    detail?: string;
    stack?: string | null;
  }>('mpesa-stk-push', {
    body: {
      companyId: params.companyId,
      phoneNumber: params.phoneNumber.trim(),
      planCode: params.planCode,
      billingCycle: params.billingCycle,
    },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (data && typeof data === 'object' && data.success === false) {
    const msg =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.detail === 'string' && data.detail) ||
      'STK request failed';
    throw new Error(msg);
  }

  if (error) {
    const message =
      (data && typeof data === 'object' && typeof data.detail === 'string' && data.detail) ||
      (data && typeof data === 'object' && typeof data.error === 'string' && data.error) ||
      error.message ||
      'STK request failed';
    throw new Error(message);
  }

  if (data && typeof data === 'object' && data.error) {
    throw new Error(
      typeof data.detail === 'string' && data.detail ? data.detail : String(data.error),
    );
  }

  const checkoutRequestId = data?.checkoutRequestId;
  if (!checkoutRequestId) {
    throw new Error('STK initiated but no checkout reference was returned.');
  }

  return {
    checkoutRequestId,
    merchantRequestId: data?.merchantRequestId ?? '',
    customerMessage: data?.customerMessage,
  };
}

/** Platform developers only: Daraja STK for KES 1 (sandbox/production per MPESA_ENV). */
export async function initiateMpesaStkDeveloperTest(phoneNumber: string): Promise<MpesaStkPushResult> {
  const token = await getSupabaseAccessToken();
  if (!token) {
    throw new Error('You must be signed in to run the STK test.');
  }

  const { data, error } = await supabase.functions.invoke<{
    success?: boolean;
    ok?: boolean;
    checkoutRequestId?: string;
    merchantRequestId?: string;
    customerMessage?: string;
    amountKes?: number;
    error?: string;
    detail?: string;
    stack?: string | null;
  }>('mpesa-stk-push', {
    body: {
      developerStkTest: true,
      phoneNumber: phoneNumber.trim(),
    },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (data && typeof data === 'object' && data.success === false) {
    const msg =
      (typeof data.error === 'string' && data.error) ||
      (typeof data.detail === 'string' && data.detail) ||
      'STK test failed';
    throw new Error(msg);
  }

  if (error) {
    const message =
      (data && typeof data === 'object' && typeof data.detail === 'string' && data.detail) ||
      (data && typeof data === 'object' && typeof data.error === 'string' && data.error) ||
      error.message ||
      'STK test failed';
    throw new Error(message);
  }

  if (data && typeof data === 'object' && data.error) {
    throw new Error(
      typeof data.detail === 'string' && data.detail ? data.detail : String(data.error),
    );
  }

  const checkoutRequestId = data?.checkoutRequestId;
  if (!checkoutRequestId) {
    throw new Error('STK test started but no checkout reference was returned.');
  }

  return {
    checkoutRequestId,
    merchantRequestId: data?.merchantRequestId ?? '',
    customerMessage: data?.customerMessage,
  };
}
