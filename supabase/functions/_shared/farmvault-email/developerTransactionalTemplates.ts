import { escapeHtml } from "./escapeHtml.ts";

const fontStack = "Arial, Helvetica, sans-serif";

function shell(title: string, subtitle: string, rows: [string, string][]): { subject: string; html: string } {
  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;font-family:${fontStack};font-size:14px;color:#6b7280;width:160px;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:6px 0;font-family:${fontStack};font-size:14px;color:#111827;">${v}</td></tr>`,
    )
    .join("");
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;padding:24px;">
        <tr><td style="font-family:${fontStack};font-size:18px;font-weight:700;color:#0f172a;">${escapeHtml(title)}</td></tr>
        <tr><td style="font-family:${fontStack};font-size:14px;color:#64748b;padding-top:6px;padding-bottom:16px;">${escapeHtml(subtitle)}</td></tr>
        <tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">${rowsHtml}</table></td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
  return { subject: title, html };
}

export function buildDeveloperManualPaymentSubmittedEmail(input: {
  companyName: string;
  companyId: string;
  paymentId: string;
  plan: string;
  amount: string;
  currency: string;
  billingCycle: string;
  mpesaName: string;
  mpesaPhone: string;
  transactionCode: string;
  submittedAt: string;
}): { subject: string; html: string } {
  const s = shell(
    "Manual M-Pesa payment submitted",
    "A workspace submitted a payment for verification.",
    [
      ["Company", escapeHtml(input.companyName)],
      ["Company ID", escapeHtml(input.companyId)],
      ["Payment ID", escapeHtml(input.paymentId)],
      ["Plan", escapeHtml(input.plan)],
      ["Amount", escapeHtml(`${input.currency} ${input.amount}`)],
      ["Billing cycle", escapeHtml(input.billingCycle)],
      ["M-Pesa name", escapeHtml(input.mpesaName)],
      ["M-Pesa phone", escapeHtml(input.mpesaPhone)],
      ["Transaction code", escapeHtml(input.transactionCode)],
      ["Submitted", escapeHtml(input.submittedAt)],
    ],
  );
  return { ...s, subject: `Payment submitted — ${input.companyName}` };
}

export function buildDeveloperStkPaymentReceivedEmail(input: {
  companyName: string;
  companyId: string;
  checkoutRequestId: string;
  mpesaReceipt: string;
  amount: string;
  phone: string;
  plan: string;
  billingCycle: string;
}): { subject: string; html: string } {
  return {
    ...shell(
      "M-Pesa STK payment received",
      "Safaricom reported a successful STK push.",
      [
        ["Company", escapeHtml(input.companyName)],
        ["Company ID", escapeHtml(input.companyId)],
        ["Checkout request", escapeHtml(input.checkoutRequestId)],
        ["M-Pesa receipt", escapeHtml(input.mpesaReceipt)],
        ["Amount", escapeHtml(input.amount)],
        ["Phone", escapeHtml(input.phone)],
        ["Plan", escapeHtml(input.plan)],
        ["Billing cycle", escapeHtml(input.billingCycle)],
      ],
    ),
    subject: "New Payment Approved",
  };
}

export function buildDeveloperPaymentApprovedEmail(input: {
  companyName: string;
  companyId: string;
  paymentId: string;
  plan: string;
  amount: string;
  currency: string;
  billingCycle: string;
  transactionCode: string;
  approvedAt: string;
}): { subject: string; html: string } {
  return {
    ...shell(
      "Manual payment approved",
      "A pending payment was approved in the developer console.",
      [
        ["Company", escapeHtml(input.companyName)],
        ["Company ID", escapeHtml(input.companyId)],
        ["Payment ID", escapeHtml(input.paymentId)],
        ["Plan", escapeHtml(input.plan)],
        ["Amount", escapeHtml(`${input.currency} ${input.amount}`)],
        ["Billing cycle", escapeHtml(input.billingCycle)],
        ["M-Pesa / reference", escapeHtml(input.transactionCode)],
        ["Approved", escapeHtml(input.approvedAt)],
      ],
    ),
    subject: "New Payment Approved",
  };
}

export function buildDeveloperSubscriptionActivatedEmail(input: {
  companyName: string;
  companyId: string;
  source: string;
  paymentId?: string;
  plan: string;
  billingCycle: string;
  activeUntil: string;
}): { subject: string; html: string } {
  const rows: [string, string][] = [
    ["Company", escapeHtml(input.companyName)],
    ["Company ID", escapeHtml(input.companyId)],
    ["Source", escapeHtml(input.source)],
    ["Plan", escapeHtml(input.plan)],
    ["Billing cycle", escapeHtml(input.billingCycle)],
    ["Active until", escapeHtml(input.activeUntil)],
  ];
  if (input.paymentId) {
    rows.splice(3, 0, ["Payment ID", escapeHtml(input.paymentId)]);
  }
  return {
    ...shell("Subscription activated", "A workspace subscription is now active.", rows),
    subject: "New Payment Approved",
  };
}
