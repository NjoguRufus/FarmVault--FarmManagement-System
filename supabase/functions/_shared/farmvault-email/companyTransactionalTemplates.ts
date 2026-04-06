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

export function buildCompanyManualPaymentSubmittedEmail(input: {
  companyName: string;
  plan: string;
  amount: string;
  currency: string;
  billingCycle: string;
  transactionCode: string;
  billingUrl: string;
}): { subject: string; html: string } {
  const s = shell(
    "Payment received — pending verification",
    "We’ve received your M-Pesa payment details. Our team will verify and activate your subscription shortly.",
    [
      ["Workspace", escapeHtml(input.companyName)],
      ["Plan", escapeHtml(input.plan)],
      ["Amount", escapeHtml(`${input.currency} ${input.amount}`)],
      ["Billing cycle", escapeHtml(input.billingCycle)],
      ["Transaction code", escapeHtml(input.transactionCode)],
      ["Billing", `<a href="${escapeHtml(input.billingUrl)}" style="color:#0f6d4d;font-weight:600;">Open billing in FarmVault</a>`],
    ],
  );
  return { ...s, subject: `Payment submitted — ${input.companyName}` };
}

export function buildCompanyStkPaymentReceivedEmail(input: {
  companyName: string;
  mpesaReceipt: string;
  amount: string;
  phone: string;
  plan: string;
  billingCycle: string;
  billingUrl: string;
}): { subject: string; html: string } {
  const s = shell(
    "Payment received",
    "Safaricom confirmed your M-Pesa STK payment. Your subscription is being updated.",
    [
      ["Workspace", escapeHtml(input.companyName)],
      ["M-Pesa receipt", escapeHtml(input.mpesaReceipt)],
      ["Amount", escapeHtml(input.amount)],
      ["Phone", escapeHtml(input.phone)],
      ["Plan", escapeHtml(input.plan)],
      ["Billing cycle", escapeHtml(input.billingCycle)],
      ["Billing", `<a href="${escapeHtml(input.billingUrl)}" style="color:#0f6d4d;font-weight:600;">Open billing in FarmVault</a>`],
    ],
  );
  return { ...s, subject: `Payment received — ${input.companyName}` };
}

export function buildCompanyPaymentApprovedEmail(input: {
  companyName: string;
  plan: string;
  amount: string;
  currency: string;
  billingCycle: string;
  transactionCode: string;
  billingUrl: string;
}): { subject: string; html: string } {
  const s = shell(
    "Payment approved",
    "Your manual payment has been approved. Thank you for your subscription.",
    [
      ["Workspace", escapeHtml(input.companyName)],
      ["Plan", escapeHtml(input.plan)],
      ["Amount", escapeHtml(`${input.currency} ${input.amount}`)],
      ["Billing cycle", escapeHtml(input.billingCycle)],
      ["Reference", escapeHtml(input.transactionCode)],
      ["Billing", `<a href="${escapeHtml(input.billingUrl)}" style="color:#0f6d4d;font-weight:600;">Open billing in FarmVault</a>`],
    ],
  );
  return { ...s, subject: `Payment approved — ${input.companyName}` };
}

export function buildCompanySubscriptionActivatedEmail(input: {
  companyName: string;
  plan: string;
  billingCycle: string;
  activeUntil: string;
  billingUrl: string;
}): { subject: string; html: string } {
  const s = shell(
    "Subscription active",
    "Your FarmVault workspace subscription is now active.",
    [
      ["Workspace", escapeHtml(input.companyName)],
      ["Plan", escapeHtml(input.plan)],
      ["Billing cycle", escapeHtml(input.billingCycle)],
      ["Active until", escapeHtml(input.activeUntil)],
      ["Billing", `<a href="${escapeHtml(input.billingUrl)}" style="color:#0f6d4d;font-weight:600;">Open billing in FarmVault</a>`],
    ],
  );
  return { ...s, subject: `Subscription active — ${input.companyName}` };
}
