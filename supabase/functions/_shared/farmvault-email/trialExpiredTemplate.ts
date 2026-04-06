import { farmVaultEmailShell } from "./farmVaultEmailShell.ts";
import { escapeHtml } from "./escapeHtml.ts";

const fontStack = "Arial, Helvetica, sans-serif";

export function buildTrialExpiredEmail(input: {
  companyName: string;
  billingUrl: string;
}): { subject: string; html: string } {
  const company = escapeHtml(input.companyName.trim());
  const content = `
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Hello,</p>
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">The Pro trial for <strong>${company}</strong> has ended. Upgrade to keep Pro features and avoid interruptions.</p>
<p style="margin:0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">You can review plans and payment options anytime in Billing.</p>`;

  const html = farmVaultEmailShell({
    preheader: `Your FarmVault Pro trial for ${input.companyName.trim()} has ended.`,
    title: "Your Pro trial has ended",
    subtitle: "Choose a plan to continue with full access",
    content,
    cta: { label: "Go to billing", href: input.billingUrl },
  });

  return { subject: `Pro trial ended — ${input.companyName.trim()}`, html };
}
