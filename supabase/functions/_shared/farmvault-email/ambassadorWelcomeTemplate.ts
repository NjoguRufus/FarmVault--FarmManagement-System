import { escapeHtml } from "./escapeHtml.ts";
import { farmVaultEmailShell } from "./farmVaultEmailShell.ts";

export type AmbassadorWelcomeEmailData = {
  ambassadorName: string;
  /** Optional https URL for the CTA button in the welcome email. */
  dashboardUrl?: string;
};

const fontStack = "Arial, Helvetica, sans-serif";

export function buildAmbassadorWelcomeEmail(
  data: AmbassadorWelcomeEmailData,
): { subject: string; html: string } {
  const name = escapeHtml((data.ambassadorName ?? "").trim());

  const content = `
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Hello${name ? `, <strong>${name}</strong>` : ""},</p>
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Welcome to the <strong>FarmVault Ambassador Program</strong>. We're excited to have you on board.</p>
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Your ambassador profile is now active. Log into your console anytime to track referrals, commissions, and share your personal referral link.</p>
<p style="margin:0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Thank you for joining — every farm you help onboard makes a difference.</p>`;

  const html = farmVaultEmailShell({
    preheader: `Welcome to the FarmVault Ambassador Program, ${(data.ambassadorName ?? "").trim() || "there"}!`,
    title: "Welcome, Ambassador 🌱",
    subtitle: "You're now part of the FarmVault Ambassador Program.",
    content,
    cta: data.dashboardUrl?.trim()
      ? { label: "Open your ambassador console", href: data.dashboardUrl.trim() }
      : undefined,
  });

  return { subject: "Welcome to the FarmVault Ambassador Program", html };
}
