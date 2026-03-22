import { escapeHtml } from "./escapeHtml.ts";
import { farmVaultEmailShell } from "./farmVaultEmailShell.ts";
import type { CustomManualEmailData } from "./types.ts";

const fontStack = "Arial, Helvetica, sans-serif";

function bodyToHtml(plain: string): string {
  const blocks = plain.trim().split(/\n{2,}/);
  return blocks
    .map((block) => {
      const inner = block
        .split("\n")
        .map((line) => escapeHtml(line))
        .join("<br />");
      return `<p style="margin:0 0 14px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">${inner}</p>`;
    })
    .join("");
}

/**
 * Developer-composed message in the standard FarmVault email shell.
 */
export function buildCustomManualEmail(data: CustomManualEmailData): { subject: string; html: string } {
  const subject = data.subject.trim();
  const greeting = data.recipientName?.trim()
    ? `<p style="margin:0 0 16px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Hello ${escapeHtml(data.recipientName.trim())},</p>`
    : `<p style="margin:0 0 16px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Hello,</p>`;

  const subtitle = data.category
    ? `${data.category.charAt(0).toUpperCase()}${data.category.slice(1).replace(/_/g, " ")} · FarmVault`
    : "Message from the FarmVault team";

  const bodyFragment =
    typeof data.html === "string" && data.html.trim().length > 0
      ? data.html.trim()
      : bodyToHtml(typeof data.body === "string" ? data.body : "");

  const html = farmVaultEmailShell({
    preheader: subject.length > 140 ? `${subject.slice(0, 137)}…` : subject,
    title: subject,
    subtitle,
    content: `${greeting}${bodyFragment}`,
  });

  return { subject, html };
}
