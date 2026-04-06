import { escapeHtml } from "./escapeHtml.ts";
import { farmVaultEmailShell } from "./farmVaultEmailShell.ts";

export const stkPaymentReceivedEmailType = "company_stk_payment_received";

export function buildStkPaymentReceivedEmail(input: {
  companyName: string;
  amountLabel: string;
  mpesaReceipt: string;
  phone: string;
  billingUrl: string;
}): { subject: string; html: string } {
  const rawName = input.companyName.trim() || "Your workspace";
  const company = escapeHtml(rawName);
  const amount = escapeHtml(input.amountLabel.trim() || "—");
  const receipt = escapeHtml(input.mpesaReceipt.trim() || "—");
  const phone = escapeHtml(input.phone.trim() || "—");
  const billingHref = escapeHtml(input.billingUrl.trim());

  const content = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#1f2937;">
  Hi <strong>${company}</strong>,
</p>
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#1f2937;">
  We have successfully received your M-Pesa payment. Your payment is currently being processed and will be approved shortly.
</p>
<table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse;margin:0 0 20px 0;">
  <tr><td style="padding:6px 0;color:#6b7280;">Amount</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1f2937;">${amount}</td></tr>
  <tr><td style="padding:6px 0;color:#6b7280;">M-Pesa Receipt</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1f2937;">${receipt}</td></tr>
  <tr><td style="padding:6px 0;color:#6b7280;">Phone</td><td style="padding:6px 0;text-align:right;">${phone}</td></tr>
</table>
<p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#6b7280;">
  You will receive another email once approval is completed.
</p>
<p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#6b7280;">
  — FarmVault Billing
</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
  <a href="${billingHref}" style="color:#1f6f43;font-weight:600;">View billing status</a>
</p>`;

  const html = farmVaultEmailShell({
    preheader: `M-Pesa payment received — ${rawName} — processing`,
    title: "Payment Received",
    subtitle: "Your M-Pesa payment has been received",
    content,
    cta: { label: "View billing", href: input.billingUrl.trim() },
  });

  return {
    subject: "Payment Received – FarmVault",
    html,
  };
}
