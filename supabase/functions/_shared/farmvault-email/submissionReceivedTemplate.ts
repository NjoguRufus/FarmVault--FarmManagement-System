import { farmVaultEmailShell } from "./farmVaultEmailShell.ts";
import { escapeHtml } from "./escapeHtml.ts";

export type SubmissionReceivedEmailData = {
  companyName: string;
  /** Primary link (e.g. pending-approval or dashboard). */
  dashboardUrl: string;
};

export const submissionReceivedEmailSubject = "We've received your farm details 🌱";

const fontStack = "Arial, Helvetica, sans-serif";

export function buildSubmissionReceivedEmail(
  data: SubmissionReceivedEmailData,
): { subject: string; html: string } {
  const company = escapeHtml(data.companyName.trim());

  const content = `
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Hello${company ? `, <strong>${company}</strong>` : ""},</p>
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Thank you for trusting us with your farm. <strong>We've received your details</strong>, and we're already preparing your FarmVault workspace with care.</p>
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">There's nothing else you need to do right now. We'll email you as soon as everything is ready — calm, clear, and in one place.</p>
<p style="margin:0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Until then, you can relax. We're on it.</p>`;

  const html = farmVaultEmailShell({
    preheader: `FarmVault received your details — we're preparing ${data.companyName.trim() || "your"} workspace.`,
    title: "Hello from the FarmVault Team 🌱",
    subtitle: "We've received your farm details — your workspace is being prepared.",
    content,
    cta: { label: "View your status", href: data.dashboardUrl },
  });

  return { subject: submissionReceivedEmailSubject, html };
}
