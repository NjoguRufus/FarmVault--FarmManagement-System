import { escapeHtml } from "./escapeHtml.ts";
import { farmVaultEmailShell } from "./farmVaultEmailShell.ts";

export const paymentSuccessfulEmailType = "company_payment_successful";

function planLabel(raw: string | null | undefined): string {
  const p = String(raw ?? "basic").toLowerCase();
  if (p.includes("enterprise")) return "Enterprise";
  if (p.includes("pro")) return "Pro";
  return "Basic";
}

/** Unified "payment confirmed" copy for STK and manual approval. */
export function buildPaymentSuccessfulEmail(input: {
  companyName: string;
  planName: string;
  amountKesFormatted: string;
  receiptNumber: string;
}): { subject: string; html: string } {
  const rawName = input.companyName.trim() || "there";
  const company = escapeHtml(rawName);
  const plan = escapeHtml(planLabel(input.planName));
  const amount = escapeHtml(input.amountKesFormatted.trim() || "—");
  const receipt = escapeHtml(input.receiptNumber.trim() || "—");

  const content = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#1f2937;">
  Hi ${company},
</p>
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#1f2937;">
  Your payment was successful and your workspace is now active.
</p>
<table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse;margin:0 0 20px 0;">
  <tr><td style="padding:6px 0;color:#6b7280;">Plan</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1f2937;">${plan}</td></tr>
  <tr><td style="padding:6px 0;color:#6b7280;">Amount</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1f2937;">KES ${amount}</td></tr>
  <tr><td style="padding:6px 0;color:#6b7280;">Receipt</td><td style="padding:6px 0;text-align:right;">${receipt}</td></tr>
</table>
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#1f2937;">
  You now have full access to your FarmVault workspace.
</p>
<p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#6b7280;">
  — FarmVault Billing
</p>`;

  const html = farmVaultEmailShell({
    preheader: `Payment successful — ${rawName}`,
    title: "Payment Successful",
    subtitle: "Your workspace is active",
    content,
  });

  return {
    subject: "Payment Successful – FarmVault",
    html,
  };
}

export function buildAdminPaymentConfirmedEmail(input: {
  companyName: string;
  amountLabel: string;
  receipt: string;
}): { subject: string; html: string } {
  const company = escapeHtml(input.companyName.trim() || "—");
  const amount = escapeHtml(input.amountLabel.trim() || "—");
  const receipt = escapeHtml(input.receipt.trim() || "—");
  const html = `<p style="margin:0 0 12px 0;font-size:15px;line-height:1.6;color:#1f2937;">A payment has been successfully processed.</p>
<table role="presentation" style="font-size:14px;border-collapse:collapse;">
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Company</td><td style="padding:4px 0;font-weight:600;">${company}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Amount</td><td style="padding:4px 0;font-weight:600;">${amount}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#6b7280;">Receipt</td><td style="padding:4px 0;">${receipt}</td></tr>
</table>`;
  return { subject: "Payment Confirmed", html };
}
