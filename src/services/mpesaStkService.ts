import { logger } from "@/lib/logger";
/**
 * STK initiation: direct POST to `mpesa-stk-push` with the billing UI body.
 * Uses the signed-in user's Clerk JWT. No profile, company, or workspace lookups in this module.
 */
import { CLERK_JWT_TEMPLATE_SUPABASE, getSupabaseAccessToken } from '@/lib/supabase';

function supabaseFunctionsOrigin(): string {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
  if (!url) {
    throw new Error('Missing VITE_SUPABASE_URL for M-Pesa STK.');
  }
  return url;
}

function supabaseAnonApiKey(): string {
  const key =
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (!key) {
    throw new Error('Missing VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) for M-Pesa STK.');
  }
  return key;
}

export type MpesaStkAuthOptions = {
  getAccessToken: () => Promise<string | null>;
};

export interface StkPushParams {
  companyId: string;
  phoneNumber: string;
  planCode: 'basic' | 'pro';
  billingCycle: 'monthly' | 'seasonal' | 'annual';
  billingReference?: string;
  amount: number;
  /** Stable per checkout attempt so double-submit / retries reuse the same Daraja STK idempotency slot (required). */
  idempotencyKey: string;
}

export interface StkPushResult {
  checkoutRequestId: string;
  customerMessage?: string;
}

/** @deprecated Use {@link StkPushResult} */
export type MpesaStkPushResult = StkPushResult & { merchantRequestId?: string };

type StkEdgeBody = {
  success?: boolean;
  ok?: boolean;
  checkoutRequestId?: string;
  merchantRequestId?: string;
  customerMessage?: string;
  error?: string;
  detail?: string;
  message?: string;
};

function formatStkEdgeError(data: StkEdgeBody): string {
  const err = typeof data.error === 'string' ? data.error : '';
  const det = typeof data.detail === 'string' ? data.detail : '';
  const msg = typeof data.message === 'string' ? data.message : '';
  if (err && det && det !== err) return `${err}: ${det}`;
  return err || det || msg || 'STK Push failed';
}

async function postMpesaStkPush(
  body: Record<string, unknown>,
  token: string,
  idempotencyKey: string,
): Promise<StkPushResult> {
  const res = await fetch(`${supabaseFunctionsOrigin()}/functions/v1/mpesa-stk-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonApiKey(),
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(body),
  });

  let data: StkEdgeBody;
  try {
    data = (await res.json()) as StkEdgeBody;
  } catch {
    throw new Error(!res.ok ? `STK Push failed (${res.status})` : 'STK Push failed');
  }

  if (data && typeof data === 'object' && data.success === false) {
    throw new Error(formatStkEdgeError(data));
  }

  if (!res.ok) {
    throw new Error(formatStkEdgeError(data));
  }

  const checkoutRequestId = data?.checkoutRequestId;
  if (typeof checkoutRequestId !== 'string' || !checkoutRequestId.trim()) {
    throw new Error('STK initiated but no checkout reference was returned.');
  }

  return {
    checkoutRequestId: checkoutRequestId.trim(),
    customerMessage:
      typeof data.customerMessage === 'string' && data.customerMessage.trim()
        ? data.customerMessage.trim()
        : undefined,
  };
}

export async function initiateMpesaStkPush(
  params: StkPushParams,
  auth: MpesaStkAuthOptions,
): Promise<StkPushResult> {
  const token = await auth.getAccessToken();
  // eslint-disable-next-line no-console
  logger.log('Token attached:', !!token);
  if (!token) {
    throw new Error(
      `You must be signed in to pay with M-Pesa STK. If you are signed in, ensure a Clerk JWT template named "${CLERK_JWT_TEMPLATE_SUPABASE}" exists with claim "sub" set to the user id.`,
    );
  }

  const safeAmount = Math.round(Number(params.amount));
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
    throw new Error('Invalid amount');
  }

  const billingRefTrim = params.billingReference?.trim() ?? '';

  // eslint-disable-next-line no-console
  logger.log('Initiating STK with params:', {
    phone: params.phoneNumber.trim(),
    amount: safeAmount,
    company_id: params.companyId,
    billing_reference: billingRefTrim || '(empty — edge falls back from company_id)',
    plan: params.planCode,
    billing_cycle: params.billingCycle,
  });

  const idempotencyKey = params.idempotencyKey?.trim();
  if (!idempotencyKey) {
    throw new Error('Missing idempotencyKey — generate a UUID once per STK attempt and reuse on retry.');
  }

  return postMpesaStkPush(
    {
      company_id: params.companyId,
      phone: params.phoneNumber.trim(),
      plan: params.planCode,
      billing_cycle: params.billingCycle,
      billing_reference: billingRefTrim,
      amount: safeAmount,
      idempotency_key: idempotencyKey,
    },
    token,
    idempotencyKey,
  );
}

/** Platform developers only: Daraja STK with configurable KES amount (sandbox/production per MPESA_ENV). */
export async function sendDeveloperStkTest(
  params: { phone: string; amount: number },
  auth?: { getAccessToken?: () => Promise<string | null> },
): Promise<StkPushResult> {
  const getTok = auth?.getAccessToken ?? getSupabaseAccessToken;
  const token = await getTok();
  // eslint-disable-next-line no-console
  logger.log('Token attached:', !!token);
  if (!token) {
    throw new Error(
      `You must be signed in to run the STK test. Ensure Clerk JWT template "${CLERK_JWT_TEMPLATE_SUPABASE}" exists.`,
    );
  }

  const safeAmount = Math.round(Number(params.amount));
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
    throw new Error('Invalid STK amount');
  }

  const idempotencyKey = crypto.randomUUID();
  return postMpesaStkPush(
    {
      developerStkTest: true,
      phoneNumber: params.phone.trim(),
      amount: safeAmount,
      idempotency_key: idempotencyKey,
    },
    token,
    idempotencyKey,
  );
}
