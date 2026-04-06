import type { PaymentRow } from '@/services/developerService';
import type { PaymentSubmissionRow } from '@/services/billingSubmissionService';
import { format, parseISO } from 'date-fns';

export type ReceiptTemplatePreviewModel = {
  receiptNumber: string;
  issuedAtLabel: string;
  statusLabel: string;
  transactionDateLabel: string;
  transactionReference: string;
  companyName: string;
  adminName: string;
  email: string;
  phone: string;
  workspaceName: string;
  paymentMode: string;
  currency: string;
  planLabel: string;
  billingPeriod: string;
  lineDescription: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  subtotal: number;
  vatAmount: number;
  discountAmount: number;
  totalPaid: number;
  customerSinceLabel: string;
  planTier: string;
  paymentCycleLabel: string;
  footerTs: string;
  /** True when showing placeholders / preview-only (no issued receipt yet). */
  isSample: boolean;
};

function safeFmtDate(iso: string | null | undefined, fallback = '—'): string {
  if (!iso) return fallback;
  try {
    return format(parseISO(iso), 'PP');
  } catch {
    return fallback;
  }
}

function planDisplay(plan: string | null | undefined): string {
  const p = String(plan ?? 'basic').toLowerCase();
  return p.includes('pro') ? 'PRO' : 'BASIC';
}

function modeFromPayment(method: string | null | undefined, billingMode: string | null | undefined): string {
  const m = String(method ?? '').toLowerCase();
  if (m === 'mpesa_stk' || String(billingMode ?? '').toLowerCase() === 'mpesa_stk') {
    return 'M-Pesa (STK Push)';
  }
  return 'M-Pesa (Manual)';
}

/** Billing period line from subscription row (matches PDF). */
export function billingPeriodRangeLabel(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start || !end) return '—';
  try {
    return `${format(parseISO(start), 'PP')} → ${format(parseISO(end), 'PP')}`;
  } catch {
    return '—';
  }
}

export function placeholderReceiptTemplateModel(partial?: {
  workspaceName?: string | null;
}): ReceiptTemplatePreviewModel {
  const ws = partial?.workspaceName?.trim() || 'Your workspace name';
  const now = new Date();
  return {
    receiptNumber: 'FV-RCT-0000',
    issuedAtLabel: safeFmtDate(now.toISOString()),
    statusLabel: 'PAID',
    transactionDateLabel: safeFmtDate(now.toISOString()),
    transactionReference: 'MPE1234567',
    companyName: 'Sample Agri Co. Ltd',
    adminName: 'Jane Wanjiku',
    email: 'billing@example.com',
    phone: '+254 712 345 678',
    workspaceName: ws,
    paymentMode: 'M-Pesa (STK Push)',
    currency: 'KES',
    planLabel: 'PRO',
    billingPeriod: `${format(now, 'yyyy-MM-dd')} → ${format(new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()), 'yyyy-MM-dd')}`,
    lineDescription: 'FarmVault PRO Subscription',
    quantity: 1,
    unitPrice: 5000,
    lineTotal: 5000,
    subtotal: 5000,
    vatAmount: 0,
    discountAmount: 0,
    totalPaid: 5000,
    customerSinceLabel: safeFmtDate(new Date(now.getFullYear() - 1, 0, 15).toISOString()),
    planTier: 'PRO',
    paymentCycleLabel: 'monthly',
    footerTs: now.toISOString(),
    isSample: true,
  };
}

export type DeveloperReceiptPreviewExtras = {
  billingPeriod?: string;
  adminName?: string;
  email?: string;
  phone?: string;
};

export function receiptTemplateFromDeveloperPayment(
  row: PaymentRow,
  extras?: DeveloperReceiptPreviewExtras,
): ReceiptTemplatePreviewModel {
  const amount = Number(row.amount ?? 0);
  const plan = planDisplay(row.plan_id);
  const currency = String(row.currency ?? 'KES');
  const ref = String(row.reference ?? '').trim() || '—';
  const txDate = row.approved_at ?? row.created_at ?? new Date().toISOString();
  const adminName = extras?.adminName?.trim() || 'Workspace administrator';
  const email = extras?.email?.trim() || '—';
  const phone = extras?.phone?.trim() || '—';
  return {
    receiptNumber: 'Preview · not issued',
    issuedAtLabel: safeFmtDate(txDate),
    statusLabel: 'PAID',
    transactionDateLabel: safeFmtDate(txDate),
    transactionReference: ref,
    companyName: row.company_name ?? 'Workspace',
    adminName,
    email,
    phone,
    workspaceName: row.company_name ?? 'Workspace',
    paymentMode: modeFromPayment(row.payment_method, row.billing_mode),
    currency,
    planLabel: plan,
    billingPeriod: extras?.billingPeriod?.trim() || '—',
    lineDescription: `FarmVault ${plan} Subscription`,
    quantity: 1,
    unitPrice: amount,
    lineTotal: amount,
    subtotal: amount,
    vatAmount: 0,
    discountAmount: 0,
    totalPaid: amount,
    customerSinceLabel: '—',
    planTier: plan,
    paymentCycleLabel: String(row.billing_cycle ?? row.billing_mode ?? 'monthly'),
    footerTs: new Date().toISOString(),
    isSample: true,
  };
}

export type TenantReceiptPreviewOpts = {
  billingPeriod?: string;
  /** Signed-in user email when company has no billing email on file. */
  contactEmail?: string | null;
  /** Signed-in display name. */
  contactName?: string | null;
};

export function receiptTemplateFromTenantPayment(
  row: PaymentSubmissionRow,
  workspaceName: string | null | undefined,
  opts?: TenantReceiptPreviewOpts,
): ReceiptTemplatePreviewModel {
  const amount = Number(row.amount ?? 0);
  const plan = planDisplay(row.plan_id);
  const currency = String(row.currency ?? 'KES');
  const ref = String(row.transaction_code ?? '').trim() || '—';
  const txDate = row.submitted_at ?? row.created_at ?? new Date().toISOString();
  const ws = workspaceName?.trim() || 'Your workspace';
  const payer = row.mpesa_name?.trim();
  const contactNm = opts?.contactName?.trim();
  const adminName = payer || contactNm || 'Account administrator';
  const resolvedEmail = opts?.contactEmail?.trim() || '—';
  return {
    receiptNumber: 'Preview · not issued',
    issuedAtLabel: safeFmtDate(txDate),
    statusLabel: 'PAID',
    transactionDateLabel: safeFmtDate(txDate),
    transactionReference: ref,
    companyName: ws,
    adminName,
    email: resolvedEmail,
    phone: row.mpesa_phone?.trim() || '—',
    workspaceName: ws,
    paymentMode: modeFromPayment(row.payment_method, row.billing_mode),
    currency,
    planLabel: plan,
    billingPeriod: opts?.billingPeriod?.trim() || '—',
    lineDescription: `FarmVault ${plan} Subscription`,
    quantity: 1,
    unitPrice: amount,
    lineTotal: amount,
    subtotal: amount,
    vatAmount: 0,
    discountAmount: 0,
    totalPaid: amount,
    customerSinceLabel: '—',
    planTier: plan,
    paymentCycleLabel: String(row.billing_cycle ?? row.billing_mode ?? 'monthly'),
    footerTs: new Date().toISOString(),
    isSample: true,
  };
}

/** Minimal shape for issued receipt → template (avoids circular imports). */
export type BillingReceiptRowLike = {
  receipt_number: string;
  company_name_snapshot: string | null;
  workspace_name_snapshot: string | null;
  admin_name_snapshot: string | null;
  customer_email: string | null;
  customer_phone?: string | null;
  amount: number;
  currency: string;
  payment_method: string;
  transaction_reference: string | null;
  plan: string | null;
  status: string;
  issued_at: string;
  billing_period: string | null;
  subtotal?: number | null;
  vat_amount?: number | null;
  discount_amount?: number | null;
  customer_since?: string | null;
  payment_cycle?: string | null;
};

export function receiptTemplateFromIssuedReceipt(row: BillingReceiptRowLike): ReceiptTemplatePreviewModel {
  const amount = Number(row.amount ?? 0);
  const currency = String(row.currency ?? 'KES');
  const plan = planDisplay(row.plan);
  const issued = row.issued_at ?? new Date().toISOString();
  return {
    receiptNumber: row.receipt_number,
    issuedAtLabel: safeFmtDate(issued),
    statusLabel: String(row.status ?? 'paid').toUpperCase(),
    transactionDateLabel: safeFmtDate(issued),
    transactionReference: String(row.transaction_reference ?? '—').trim() || '—',
    companyName: row.company_name_snapshot ?? '—',
    adminName: row.admin_name_snapshot ?? '—',
    email: row.customer_email ?? '—',
    phone: row.customer_phone ?? '—',
    workspaceName: row.workspace_name_snapshot ?? row.company_name_snapshot ?? '—',
    paymentMode:
      String(row.payment_method).toLowerCase() === 'mpesa_stk' ? 'M-Pesa (STK Push)' : 'M-Pesa (Manual)',
    currency,
    planLabel: plan,
    billingPeriod: row.billing_period ?? '—',
    lineDescription: `FarmVault ${plan} Subscription`,
    quantity: 1,
    unitPrice: amount,
    lineTotal: amount,
    subtotal: row.subtotal != null ? Number(row.subtotal) : amount,
    vatAmount: row.vat_amount != null ? Number(row.vat_amount) : 0,
    discountAmount: row.discount_amount != null ? Number(row.discount_amount) : 0,
    totalPaid: amount,
    customerSinceLabel: row.customer_since ? safeFmtDate(row.customer_since) : '—',
    planTier: plan,
    paymentCycleLabel: row.payment_cycle ?? '—',
    footerTs: new Date().toISOString(),
    isSample: false,
  };
}

export function latestPaymentByCompany(rows: PaymentRow[]): Map<string, PaymentRow> {
  const m = new Map<string, PaymentRow>();
  for (const r of rows) {
    const id = String(r.company_id ?? '').trim();
    if (!id) continue;
    const prev = m.get(id);
    const ta = String(r.approved_at ?? r.created_at ?? '');
    const tb = prev ? String(prev.approved_at ?? prev.created_at ?? '') : '';
    if (!prev || ta > tb) m.set(id, r);
  }
  return m;
}
