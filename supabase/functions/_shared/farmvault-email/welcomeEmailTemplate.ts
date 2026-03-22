import { farmVaultEmailShell } from "./farmVaultEmailShell.ts";
import { resolveEmailQrShare } from "./emailQrShare.ts";
import { escapeHtml } from "./escapeHtml.ts";
import type { WelcomeEmailData } from "./types.ts";

const fontStack = "Arial, Helvetica, sans-serif";

export const welcomeEmailSubject = "Welcome to FarmVault 🌱";

export function buildWelcomeEmail(data: WelcomeEmailData): { subject: string; html: string } {
  const company = escapeHtml(data.companyName.trim());
  const content = `
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Hello${company ? ` from <strong>${company}</strong>` : ""},</p>
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Welcome to <strong>FarmVault</strong> — a modern platform built for professional farms and agribusiness teams.</p>
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">You now have a clearer home for farm records: <strong>projects</strong>, <strong>expenses</strong>, <strong>harvests</strong>, <strong>labor</strong>, <strong>inventory</strong>, and <strong>reports</strong> — connected in one place so decisions stay grounded in what is happening on the ground.</p>
<p style="margin:0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Open your dashboard to explore your workspace and start organizing operations with confidence.</p>`;

  const qrShare = resolveEmailQrShare("transactional_default_off", {
    showQrCode: data.showQrCode,
    qrCodeImageUrl: data.qrCodeImageUrl,
    qrCodeTargetUrl: data.qrCodeTargetUrl,
  });

  const html = farmVaultEmailShell({
    preheader: `Welcome to FarmVault — clearer records for ${data.companyName.trim() || "your farm"}.`,
    title: "Welcome to FarmVault",
    subtitle: "Your workspace for clearer farm operations",
    content,
    cta: { label: "Open Dashboard", href: data.dashboardUrl },
    qrShare,
  });

  return { subject: welcomeEmailSubject, html };
}
