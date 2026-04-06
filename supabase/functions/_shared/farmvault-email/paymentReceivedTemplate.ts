import { escapeHtml } from "./escapeHtml.ts";
import { farmVaultEmailShell } from "./farmVaultEmailShell.ts";

export const companyPaymentReceivedEmailType = "company_payment_received";

function billingCycleLabel(raw: string | null | undefined): string {
  const c = String(raw ?? "monthly").toLowerCase();
  if (c === "seasonal") return "Seasonal (3 months)";
  if (c === "annual") return "Annual";
  return "Monthly";
}

function planLabel(raw: string | null | undefined): string {
  const p = String(raw ?? "basic").toLowerCase();
  if (p.includes("enterprise")) return "Enterprise";
  if (p.includes("pro")) return "Pro";
  return "Basic";
}

export function buildPaymentReceivedEmail(input: {
  companyName: string;
  amountLabel: string;
  plan: string;
  receipt: string;
  billingCycle: string;
  billingUrl: string;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const rawName = input.companyName.trim() || "Your workspace";
  const company = escapeHtml(rawName);
  const amount = escapeHtml(input.amountLabel.trim() || "—");
  const plan = escapeHtml(planLabel(input.plan));
  const receipt = escapeHtml(input.receipt.trim() || "—");
  const cycle = escapeHtml(billingCycleLabel(input.billingCycle));
  const billingUrl = input.billingUrl.trim();
  const dashboardUrl = input.dashboardUrl.trim();
  const billingHref = escapeHtml(billingUrl);
  const dashboardHref = escapeHtml(dashboardUrl);

  const content = `
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#1f2937;">
  Hi — thank you for your payment for <strong>${company}</strong>.
</p>
<p style="margin:0 0 16px 0;font-size:15px;line-height:1.65;color:#1f2937;">
  <strong>Your FarmVault subscription payment is confirmed.</strong> Your workspace access is up to date.
</p>
<table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse;margin:0 0 16px 0;">
  <tr><td style="padding:6px 0;color:#6b7280;">Amount</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1f2937;">${amount}</td></tr>
  <tr><td style="padding:6px 0;color:#6b7280;">Plan</td><td style="padding:6px 0;text-align:right;">${plan}</td></tr>
  <tr><td style="padding:6px 0;color:#6b7280;">Billing cycle</td><td style="padding:6px 0;text-align:right;">${cycle}</td></tr>
  <tr><td style="padding:6px 0;color:#6b7280;">Payment reference</td><td style="padding:6px 0;text-align:right;">${receipt}</td></tr>
</table>
<p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#6b7280;">
  A PDF receipt may be available in Billing when issued.
</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
  <a href="${dashboardHref}" style="color:#1f6f43;font-weight:600;">Open dashboard</a>
  ·
  <a href="${billingHref}" style="color:#1f6f43;font-weight:600;">Billing</a>
</p>`;

  const html = farmVaultEmailShell({
    preheader: `Payment received — ${rawName} — FarmVault`,
    title: "Payment received",
    subtitle: "Your subscription payment is confirmed",
    content,
    cta: { label: "Open billing", href: billingUrl },
  });

  return {
    subject: "Payment Received — FarmVault",
    html,
  };
}
