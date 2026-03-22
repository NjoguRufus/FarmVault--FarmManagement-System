import { escapeHtml } from "./escapeHtml.ts";
import { FARMVAULT_EMAIL_HEADER_LOGO_ROW } from "./emailHeaderLogoRow.ts";

function escapeAttr(href: string): string {
  return href.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

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
  const href = escapeAttr(data.approvalDashboardUrl.trim());

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background-color:#f6f8f6;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f6f8f6;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e5ebe7;border-radius:12px;">
          ${FARMVAULT_EMAIL_HEADER_LOGO_ROW}
          <tr>
            <td style="padding:8px 28px 8px 28px;font-family:${font};font-size:18px;font-weight:700;color:#1f2937;line-height:1.3;background-color:#ffffff;">
              New FarmVault signup
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 20px 28px;font-family:${font};font-size:14px;line-height:1.65;color:#374151;">
              <p style="margin:0 0 14px 0;">A farm workspace was submitted and is <strong>awaiting your approval</strong>.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                <tr><td style="padding:6px 0;font-family:${font};font-size:14px;color:#6b7280;width:120px;vertical-align:top;">Company</td><td style="padding:6px 0;font-family:${font};font-size:14px;color:#111827;font-weight:600;">${company}</td></tr>
                <tr><td style="padding:6px 0;font-family:${font};font-size:14px;color:#6b7280;vertical-align:top;">User email</td><td style="padding:6px 0;font-family:${font};font-size:14px;color:#111827;">${email}</td></tr>
                <tr><td style="padding:6px 0;font-family:${font};font-size:14px;color:#6b7280;vertical-align:top;">Submitted</td><td style="padding:6px 0;font-family:${font};font-size:14px;color:#111827;">${when}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 28px 28px 28px;">
              <a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;font-family:${font};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;background-color:#1f6f43;border-radius:8px;">Review in developer dashboard</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
