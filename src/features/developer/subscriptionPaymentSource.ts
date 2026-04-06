import type { MpesaStkPaymentRow, PaymentRow } from '@/services/developerService';

/** Shape of `latest_subscription_payment` from list_companies (partial). */
export type CompanyLatestSubPayment = {
  payment_method?: string | null;
  submitted_at?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
  plan_id?: string | null;
  billing_cycle?: string | null;
  transaction_code?: string | null;
} | null;

export type ResolvedLatestCompanyPayment = {
  kind: PaymentSourceLabel;
  atMs: number;
  amount: number | null;
  currency: string;
  status?: string | null;
  plan_id?: string | null;
  billing_cycle?: string | null;
  receipt?: string | null;
};

/** Manual PayBill / till submissions (subscription_payments). */
export const PAYMENT_METHOD_MANUAL = 'mpesa_manual';
/** STK / Daraja checkout linked on subscription row. */
export const PAYMENT_METHOD_STK = 'mpesa_stk';

export type PaymentSourceLabel = 'manual' | 'sdk';

export function subscriptionRowPaymentSource(row: Pick<PaymentRow, 'payment_method'>): PaymentSourceLabel {
  const m = String(row.payment_method ?? PAYMENT_METHOD_MANUAL).toLowerCase().trim();
  if (m === PAYMENT_METHOD_STK) return 'sdk';
  return 'manual';
}

export function isManualApprovedSubscriptionRow(row: PaymentRow): boolean {
  return String(row.status ?? '').toLowerCase() === 'approved' && subscriptionRowPaymentSource(row) === 'manual';
}

export function isSdkApprovedSubscriptionRow(row: PaymentRow): boolean {
  return String(row.status ?? '').toLowerCase() === 'approved' && subscriptionRowPaymentSource(row) === 'sdk';
}

/** Matches DB + gate: result_code 0 and/or Daraja SUCCESS|COMPLETED status. */
export function mpesaRowIsSdkSuccess(row: Pick<MpesaStkPaymentRow, 'status' | 'result_code'>): boolean {
  if (row.result_code != null && row.result_code === 0) return true;
  const u = String(row.status ?? '').toUpperCase();
  return u === 'SUCCESS' || u === 'COMPLETED';
}

export function sumAmounts(rows: Array<{ amount?: number | string | null }>): number {
  return rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
}

function parseTimeMs(iso: string | null | undefined): number {
  if (!iso) return NaN;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? NaN : t;
}

/** Latest SUCCESS `mpesa_payments` row per company (by paid_at / created_at). */
export function buildLatestSdkMpesaByCompany(rows: MpesaStkPaymentRow[]): Map<string, MpesaStkPaymentRow> {
  const m = new Map<string, MpesaStkPaymentRow>();
  for (const r of rows) {
    if (!mpesaRowIsSdkSuccess(r)) continue;
    const cid = String(r.company_id ?? '').trim();
    if (!cid) continue;
    const t = parseTimeMs(r.paid_at ?? r.created_at);
    if (!Number.isFinite(t)) continue;
    const prev = m.get(cid);
    const pt = prev ? parseTimeMs(prev.paid_at ?? prev.created_at) : -Infinity;
    if (!prev || t >= pt) m.set(cid, r);
  }
  return m;
}

/**
 * Most recent payment event between the latest subscription_payments row and the latest SDK SUCCESS row.
 * Manual vs SDK follows `subscriptionRowPaymentSource` for the subscription row; mpesa table rows are always SDK.
 */
export function resolveLatestCompanyPayment(
  sub: CompanyLatestSubPayment,
  sdkRow: MpesaStkPaymentRow | undefined,
): ResolvedLatestCompanyPayment | null {
  const candidates: ResolvedLatestCompanyPayment[] = [];

  if (sub) {
    const atMs = parseTimeMs(sub.submitted_at);
    if (Number.isFinite(atMs)) {
      const kind = subscriptionRowPaymentSource({ payment_method: sub.payment_method ?? undefined });
      candidates.push({
        kind,
        atMs,
        amount: sub.amount != null && sub.amount !== '' ? Number(sub.amount) : null,
        currency: String(sub.currency ?? 'KES'),
        status: sub.status ?? null,
        plan_id: sub.plan_id ?? null,
        billing_cycle: sub.billing_cycle ?? null,
        receipt: sub.transaction_code ?? null,
      });
    }
  }

  if (sdkRow) {
    const atMs = parseTimeMs(sdkRow.paid_at ?? sdkRow.created_at);
    if (Number.isFinite(atMs)) {
      candidates.push({
        kind: 'sdk',
        atMs,
        amount: sdkRow.amount != null && sdkRow.amount !== '' ? Number(sdkRow.amount) : null,
        currency: 'KES',
        status: sdkRow.status ?? null,
        plan_id: sdkRow.plan ?? null,
        billing_cycle: sdkRow.billing_cycle ?? null,
        receipt: sdkRow.mpesa_receipt ?? null,
      });
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.atMs - a.atMs);
  return candidates[0] ?? null;
}

/** Calendar-day relative label for developer tables (e.g. Today / Yesterday). */
export function formatPaymentRelativeDay(atMs: number, now: Date): string {
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startThat = new Date(atMs);
  startThat.setHours(0, 0, 0, 0);
  const diffDays = Math.round((startToday.getTime() - startThat.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays === -1) return 'Tomorrow';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 0) return startThat.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return startThat.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
