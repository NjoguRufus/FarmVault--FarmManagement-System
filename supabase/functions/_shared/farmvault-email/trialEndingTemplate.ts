import { farmVaultEmailShell } from "./farmVaultEmailShell.ts";
import { escapeHtml } from "./escapeHtml.ts";
import type { TrialEndingEmailData } from "./types.ts";

const fontStack = "Arial, Helvetica, sans-serif";

export function trialEndingEmailSubject(daysLeft: number): string {
  const n = Math.max(1, Math.floor(daysLeft));
  return n === 1
    ? "Your FarmVault trial ends tomorrow"
    : `Your FarmVault trial ends in ${n} days`;
}

export function buildTrialEndingEmail(data: TrialEndingEmailData): { subject: string; html: string } {
  const days = Math.max(1, Math.floor(Number(data.daysLeft)));
  const company = escapeHtml(data.companyName.trim());
  const dayWord = days === 1 ? "day" : "days";

  const headerTitle = days === 1 ? "Your trial ends soon" : `${days} days left on your trial`;
  const headerSubtitle =
    days === 1
      ? "Upgrade now to keep your team on track"
      : "Choose a plan before access changes";

  const content = `
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Hello${company ? ` from <strong>${company}</strong>` : ""},</p>
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Your FarmVault trial has <strong>${days} ${dayWord}</strong> remaining. After it ends, continued access may be interrupted until you choose a plan.</p>
<p style="margin:0 0 18px 0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">We hope the workspace has already made it easier to track projects, expenses, labor, inventory, harvests, and reports — without losing detail in spreadsheets or group chats.</p>
<p style="margin:0;font-family:${fontStack};font-size:15px;line-height:1.7;color:#1f2937;">Upgrade before your trial ends to keep your team moving without a break.</p>`;

  const html = farmVaultEmailShell({
    preheader: `${days} ${dayWord} left on your FarmVault trial — upgrade to stay on track.`,
    title: headerTitle,
    subtitle: headerSubtitle,
    content,
    cta: { label: "Upgrade Now", href: data.upgradeUrl },
  });

  return { subject: trialEndingEmailSubject(days), html };
}
