import { farmVaultEmailShell } from "./farmVaultEmailShell.ts";
import { escapeHtml } from "./escapeHtml.ts";

const fontStack = "Arial, Helvetica, sans-serif";

export function buildProTrialStartedEmail(input: {
  companyName: string;
  trialEndsAt: string;
  billingUrl: string;
}): { subject: string; html: string } {
  const company = escapeHtml(input.companyName.trim());
  const ends = escapeHtml(input.trialEndsAt);
  const content = `
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Hello,</p>
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Your Pro trial for <strong>${company}</strong> is now active. You have full Pro access through <strong>${ends}</strong> (UTC).</p>
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Add projects, track harvests and expenses, and explore reports. When the trial ends, choose a plan in Billing to keep uninterrupted access.</p>`;

  const html = farmVaultEmailShell({
    preheader: `Your FarmVault Pro trial for ${input.companyName.trim()} has started.`,
    title: "Your Pro trial has started",
    subtitle: "Full Pro features are unlocked for your workspace",
    content,
    cta: { label: "Open billing", href: input.billingUrl },
  });

  return { subject: `Pro trial started — ${input.companyName.trim()}`, html };
}
