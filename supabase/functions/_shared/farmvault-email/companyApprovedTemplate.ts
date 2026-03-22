import { farmVaultEmailShell } from "./farmVaultEmailShell.ts";
import { escapeHtml } from "./escapeHtml.ts";
import type { CompanyApprovedEmailData } from "./types.ts";

export const companyApprovedEmailSubject = "Your farm is ready inside FarmVault 🌱";

const fontStack = "Arial, Helvetica, sans-serif";

export function buildCompanyApprovedEmail(data: CompanyApprovedEmailData): { subject: string; html: string } {
  const company = escapeHtml(data.companyName.trim());

  const content = `
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Hello${company ? `, <strong>${company}</strong>` : ""},</p>
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Your farm is now ready inside <strong>FarmVault</strong>. We have finished preparing your workspace, and everything is set for you.</p>
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">You now have one place to manage your farm with more clarity, structure, and confidence — a calmer way to see what matters and move forward without the noise.</p>
<p style="margin:0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">We are glad to welcome you. Step in whenever you are ready.</p>`;

  const html = farmVaultEmailShell({
    preheader: `Your FarmVault workspace is ready — ${data.companyName.trim() || "your farm"} can begin.`,
    title: "Hello from the FarmVault Team 🌱",
    subtitle: "Your farm is ready inside FarmVault — your workspace is all set",
    content,
    cta: { label: "Enter Your Farm", href: data.dashboardUrl },
  });

  return { subject: companyApprovedEmailSubject, html };
}

/** Alias for callers who prefer the `*Template` naming convention. */
export const companyApprovedTemplate = buildCompanyApprovedEmail;
