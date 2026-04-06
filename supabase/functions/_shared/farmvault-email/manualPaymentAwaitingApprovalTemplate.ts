import { escapeHtml } from "./escapeHtml.ts";
import { farmVaultEmailShell } from "./farmVaultEmailShell.ts";

export const manualPaymentAwaitingApprovalEmailType = "company_manual_payment_awaiting_approval";

export function buildManualPaymentAwaitingApprovalEmail(input: {
  companyName: string;
  billingUrl: string;
}): { subject: string; html: string } {
  const rawName = input.companyName.trim() || "Your workspace";
  const company = escapeHtml(rawName);
  const content = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#1f2937;">
  Hi — we received your payment details for <strong>${company}</strong>.
</p>
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#1f2937;">
  <strong>Your payment has been received and is awaiting approval.</strong> You will get another email once a reviewer approves it.
</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
  You can check status anytime in Billing.
</p>`;

  const html = farmVaultEmailShell({
    preheader: `Payment received — ${rawName} — awaiting approval`,
    title: "Payment received",
    subtitle: "Your payment is on file and awaiting review.",
    content,
    cta: { label: "Open billing", href: input.billingUrl },
  });
  return {
    subject: `Payment received — awaiting approval — ${rawName}`,
    html,
  };
}
