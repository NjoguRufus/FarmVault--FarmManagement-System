import { escapeHtml } from "./escapeHtml.ts";
import { farmVaultEmailShell } from "./farmVaultEmailShell.ts";

export const paymentApprovedEmailType = "company_payment_approved";

function planLabel(raw: string | null | undefined): string {
  const p = String(raw ?? "basic").toLowerCase();
  if (p.includes("enterprise")) return "Enterprise";
  if (p.includes("pro")) return "Pro";
  return "Basic";
}

export function buildPaymentApprovedEmail(input: {
  companyName: string;
  amountLabel: string;
  plan: string;
  receipt: string;
  dashboardUrl: string;
  billingUrl: string;
}): { subject: string; html: string } {
  const rawName = input.companyName.trim() || "Your workspace";
  const company = escapeHtml(rawName);
  const amount = escapeHtml(input.amountLabel.trim() || "—");
  const plan = escapeHtml(planLabel(input.plan));
  const receipt = escapeHtml(input.receipt.trim() || "—");
  const dashboardHref = escapeHtml(input.dashboardUrl.trim());
  const billingHref = escapeHtml(input.billingUrl.trim());

  const content = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#1f2937;">
  Hi <strong>${company}</strong>,
</p>
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#1f2937;">
  Your payment has been successfully approved.
</p>
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#1f2937;">
  Your workspace is now fully activated and you have access to all features included in your plan.
</p>
<table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse;margin:0 0 20px 0;">
  <tr><td style="padding:6px 0;color:#6b7280;">Plan</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1f2937;">${plan}</td></tr>
  <tr><td style="padding:6px 0;color:#6b7280;">Amount</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1f2937;">${amount}</td></tr>
  <tr><td style="padding:6px 0;color:#6b7280;">Receipt</td><td style="padding:6px 0;text-align:right;">${receipt}</td></tr>
</table>
<p style="margin:0 0 8px 0;font-size:15px;line-height:1.65;color:#1f2937;">
  Thank you for choosing FarmVault.
</p>
<p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;color:#6b7280;">
  — FarmVault Billing
</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
  <a href="${dashboardHref}" style="color:#1f6f43;font-weight:600;">Open dashboard</a>
  ·
  <a href="${billingHref}" style="color:#1f6f43;font-weight:600;">Billing</a>
</p>`;

  const html = farmVaultEmailShell({
    preheader: `Payment approved — ${rawName} — workspace activated`,
    title: "Payment Approved",
    subtitle: "Your workspace is now fully activated",
    content,
    cta: { label: "Open dashboard", href: input.dashboardUrl.trim() },
  });

  return {
    subject: "Payment Approved – FarmVault Workspace Activated",
    html,
  };
}
