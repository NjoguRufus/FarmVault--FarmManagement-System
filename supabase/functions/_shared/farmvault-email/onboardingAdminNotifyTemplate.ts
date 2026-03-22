import { escapeHtml } from "./escapeHtml.ts";
import { farmVaultEmailShell } from "./farmVaultEmailShell.ts";

export function buildOnboardingAdminNotifyEmail(data: {
  companyName: string;
  userEmail: string;
  submittedAtIso: string;
  approvalDashboardUrl: string;
}): { subject: string; html: string } {
  const subject = "New FarmVault signup awaiting approval";
  const font = "Arial, Helvetica, sans-serif";
  const company = escapeHtml(data.companyName.trim());
  const email = escapeHtml(data.userEmail.trim());
  const when = escapeHtml(data.submittedAtIso);

  const content = `
<p style="margin:0 0 14px 0;font-family:${font};font-size:15px;line-height:1.65;color:#374151;">
  A farm workspace was submitted and is <strong>awaiting your approval</strong>.
</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
  <tr><td style="padding:6px 0;font-family:${font};font-size:14px;color:#6b7280;width:120px;vertical-align:top;">Company</td><td style="padding:6px 0;font-family:${font};font-size:14px;color:#111827;font-weight:600;">${company}</td></tr>
  <tr><td style="padding:6px 0;font-family:${font};font-size:14px;color:#6b7280;vertical-align:top;">User email</td><td style="padding:6px 0;font-family:${font};font-size:14px;color:#111827;">${email}</td></tr>
  <tr><td style="padding:6px 0;font-family:${font};font-size:14px;color:#6b7280;vertical-align:top;">Submitted</td><td style="padding:6px 0;font-family:${font};font-size:14px;color:#111827;">${when}</td></tr>
</table>`;

  const html = farmVaultEmailShell({
    preheader: `New signup: ${data.companyName.trim()} — awaiting your approval`,
    title: "New FarmVault signup",
    subtitle: "A farm workspace is waiting for your review",
    content,
    cta: { label: "Review in developer dashboard", href: data.approvalDashboardUrl.trim() },
  });

  return { subject, html };
}
