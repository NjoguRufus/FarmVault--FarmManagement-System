import { escapeHtml } from "./escapeHtml.ts";
import { farmVaultEmailShell } from "./farmVaultEmailShell.ts";

export function buildAmbassadorAdminNotifyEmail(data: {
  ambassadorName: string;
  ambassadorEmail: string;
  registeredAtIso: string;
}): { subject: string; html: string } {
  const subject = "New Ambassador Registered";
  const font = "Arial, Helvetica, sans-serif";
  const name = escapeHtml(data.ambassadorName.trim());
  const email = escapeHtml(data.ambassadorEmail.trim());
  const when = escapeHtml(data.registeredAtIso);

  const content = `
<p style="margin:0 0 14px 0;font-family:${font};font-size:15px;line-height:1.65;color:#374151;">
  A new ambassador has completed onboarding and joined the FarmVault program.
</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
  <tr><td style="padding:6px 0;font-family:${font};font-size:14px;color:#6b7280;width:140px;vertical-align:top;">Ambassador</td><td style="padding:6px 0;font-family:${font};font-size:14px;color:#111827;font-weight:600;">${name}</td></tr>
  <tr><td style="padding:6px 0;font-family:${font};font-size:14px;color:#6b7280;vertical-align:top;">Email</td><td style="padding:6px 0;font-family:${font};font-size:14px;color:#111827;">${email}</td></tr>
  <tr><td style="padding:6px 0;font-family:${font};font-size:14px;color:#6b7280;vertical-align:top;">Registered</td><td style="padding:6px 0;font-family:${font};font-size:14px;color:#111827;">${when}</td></tr>
</table>`;

  const html = farmVaultEmailShell({
    preheader: `New ambassador: ${data.ambassadorName.trim()} (${data.ambassadorEmail.trim()})`,
    title: "New Ambassador Registered",
    subtitle: "A new ambassador has completed onboarding",
    content,
    includeContactSupport: false,
  });

  return { subject, html };
}
