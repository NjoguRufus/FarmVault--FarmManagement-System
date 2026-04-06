import { farmVaultEmailShell } from "./farmVaultEmailShell.ts";
import { escapeHtml } from "./escapeHtml.ts";

export type SubmissionReceivedEmailData = {
  companyName: string;
  /** Primary link (dashboard). */
  dashboardUrl: string;
};

export const submissionReceivedEmailSubject = "Your Pro trial is active — welcome to FarmVault";

const fontStack = "Arial, Helvetica, sans-serif";

export function buildSubmissionReceivedEmail(
  data: SubmissionReceivedEmailData,
): { subject: string; html: string } {
  const company = escapeHtml(data.companyName.trim());

  const content = `
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Hello${company ? `, <strong>${company}</strong>` : ""},</p>
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Thank you for choosing FarmVault. <strong>Your 7-day Pro trial is now active</strong> — you have full access to Pro analytics and features right away.</p>
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Open your dashboard to create projects, track harvests, and explore your workspace. Your trial countdown appears in the app header.</p>
<p style="margin:0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">We are glad you are here.</p>`;

  const html = farmVaultEmailShell({
    preheader: `Pro trial active — ${data.companyName.trim() || "your"} FarmVault workspace is ready.`,
    title: "Welcome to FarmVault",
    subtitle: "Your Pro trial is active — start using full Pro features now.",
    content,
    cta: { label: "Go to dashboard", href: data.dashboardUrl },
  });

  return { subject: submissionReceivedEmailSubject, html };
}
