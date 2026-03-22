import { farmVaultEmailShell } from "./farmVaultEmailShell.ts";
import { resolveEmailQrShare } from "./emailQrShare.ts";
import { escapeHtml } from "./escapeHtml.ts";
import type { SubscriptionActivatedEmailData } from "./types.ts";

const fontStack = "Arial, Helvetica, sans-serif";

export const subscriptionActivatedSubject = "Your FarmVault subscription is now active";

export function buildSubscriptionActivatedEmail(
  data: SubscriptionActivatedEmailData,
): { subject: string; html: string } {
  const company = escapeHtml(data.companyName.trim());
  const plan = escapeHtml(data.planName.trim());
  const renewal = escapeHtml(data.renewalDate.trim());

  const content = `
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Hello${company ? ` from <strong>${company}</strong>` : ""},</p>
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Your <strong>FarmVault</strong> plan is <strong>active</strong>. You are all set to run day-to-day farm operations with premium tooling for projects, expenses, labor, inventory, harvests, and reporting.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px 0;background-color:#f8fbf8;border:1px solid #e5ebe7;border-radius:12px;">
  <tr>
    <td style="padding:18px 20px;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">
      <p style="margin:0 0 8px 0;"><strong style="color:#1f2937;">Plan</strong><br /><span style="color:#1f2937;">${plan}</span></p>
      <p style="margin:0;"><strong style="color:#1f2937;">Next renewal</strong><br /><span style="color:#1f2937;">${renewal}</span></p>
    </td>
  </tr>
</table>
<p style="margin:0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Thank you for trusting FarmVault with your operation. We are here to help you stay organized and in control.</p>`;

  const qrShare = resolveEmailQrShare("transactional_default_off", {
    showQrCode: data.showQrCode,
    qrCodeImageUrl: data.qrCodeImageUrl,
    qrCodeTargetUrl: data.qrCodeTargetUrl,
  });

  const html = farmVaultEmailShell({
    preheader: `${data.planName.trim()} is active. Next renewal ${data.renewalDate.trim()}.`,
    title: "You're all set",
    subtitle: "Your subscription is now active",
    content,
    cta: { label: "Go to FarmVault", href: data.dashboardUrl },
    qrShare,
  });

  return { subject: subscriptionActivatedSubject, html };
}
