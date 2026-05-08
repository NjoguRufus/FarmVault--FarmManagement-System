/**
 * FarmVault Employee Companion Email Templates
 *
 * Exact same premium visual design as admin companion emails.
 * Only the messaging and data scope changes — employees see their
 * own activity only (no revenue, no company analytics).
 *
 * Sender: FarmVault Team <team@farmvault.africa>
 * Tone:   warm · motivating · respectful · human · encouraging
 *
 * Morning 🌱 · Evening 🌙 · Weekly Summary ⭐
 */

import { escapeHtml } from "./escapeHtml.ts";
import {
  companionOpen,
  companionClose,
  bannerPanel,
  ctaButton,
  footerRow,
  paragraphsToHtml,
  C,
  BODY_FONT,
  DISPLAY_FONT,
  APP_URL,
} from "./companionEmailTemplates.ts";

// ─── Employee email types (for email_logs) ────────────────────────────────────

export const TYPE_EMPLOYEE_MORNING = "employee_companion_morning";
export const TYPE_EMPLOYEE_EVENING = "employee_companion_evening";
export const TYPE_EMPLOYEE_WEEKLY  = "employee_companion_weekly";

// ─── Employee weekly stats (own activity only — no revenue/company data) ──────

export type EmployeeWeeklyStats = {
  operationsLogged: number;
  daysActive:       number;
  streakDays:       number;
  weekStart:        string;  // YYYY-MM-DD
  weekEnd:          string;  // YYYY-MM-DD
  topActivity?:     string | null;
};

// ─── Role label helper ────────────────────────────────────────────────────────

export function employeeRoleLabel(role: string | null | undefined): string {
  const r = (role ?? "").toLowerCase().replace(/[-_]/g, " ").trim();
  const labels: Record<string, string> = {
    "employee":           "Farm Team Member",
    "field worker":       "Field Worker",
    "picker":             "Farm Picker",
    "scout":              "Farm Scout",
    "farm operator":      "Farm Operator",
    "operations manager": "Operations Manager",
    "finance officer":    "Finance Officer",
  };
  return labels[r] ?? "Farm Team Member";
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. EMPLOYEE MORNING COMPANION 🌱
// ─────────────────────────────────────────────────────────────────────────────

export function buildEmployeeMorningEmail(opts: {
  displayName: string;
  messageText: string;
  appUrl?: string;
  farmName?: string;
  role?: string | null;
}): { subject: string; html: string } {
  const url      = opts.appUrl ?? APP_URL;
  const farm     = opts.farmName ? escapeHtml(opts.farmName) : "the farm";
  const firstName = opts.displayName?.trim().split(/[\s,]/)[0] || opts.displayName || "there";
  const subject  = `🌱 Good morning, ${firstName} — another great farming day begins`;

  const heroPanelRow = bannerPanel({
    headline: `Good morning,\n${firstName}.`,
    headlineAccent: C.leaf,
    subline: `Ready to make today count on ${farm}?`,
  });

  const contentRow = `<tr>
<td class="content-td" bgcolor="${C.parchment}" style="padding:44px 40px 48px;background-color:${C.parchment};font-family:${BODY_FONT};color:${C.ink}">
${paragraphsToHtml(opts.messageText)}
${ctaButton("Continue Today's Work →", `${url}/home`)}
<p class="closing-p" style="margin:24px 0 0 0;font-family:${BODY_FONT};font-size:12px;color:${C.mute};font-style:italic;text-align:center;line-height:1.6;">Your contribution makes ${farm} thrive every single day.</p>
</td>
</tr>`;

  const html =
    companionOpen(`Ready to make today count on ${farm}?`, "Your FarmVault Morning") +
    heroPanelRow +
    contentRow +
    footerRow("Every task you complete helps the farm grow.") +
    companionClose();

  return { subject, html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. EMPLOYEE EVENING REFLECTION 🌙
// ─────────────────────────────────────────────────────────────────────────────

export function buildEmployeeEveningEmail(opts: {
  displayName: string;
  messageText: string;
  appUrl?: string;
  farmName?: string;
}): { subject: string; html: string } {
  const url      = opts.appUrl ?? APP_URL;
  const farm     = opts.farmName ? escapeHtml(opts.farmName) : "the farm";
  const firstName = opts.displayName?.trim().split(/[\s,]/)[0] || opts.displayName || "there";
  const subject  = `🌙 Well done today, ${firstName} — ${farm} thanks you`;

  const heroPanelRow = bannerPanel({
    headline: `Well done\ntoday.`,
    headlineAccent: C.harvest,
    subline: `${firstName}, your work today made a difference.`,
  });

  const contentRow = `<tr>
<td class="content-td" bgcolor="${C.parchment}" style="padding:44px 40px 48px;background-color:${C.parchment};font-family:${BODY_FONT};color:${C.ink}">
${paragraphsToHtml(opts.messageText)}
${ctaButton("Log Today's Work →", `${url}/farm-work`)}
<p class="closing-p" style="margin:24px 0 0 0;font-family:${BODY_FONT};font-size:12px;color:${C.mute};font-style:italic;text-align:center;line-height:1.6;">Rest well. Your dedication is what keeps ${farm} moving forward.</p>
</td>
</tr>`;

  const html =
    companionOpen(`${firstName}, your work today made a difference on ${farm}.`, "Your FarmVault Evening") +
    heroPanelRow +
    contentRow +
    footerRow("Every day you show up, the farm grows stronger.") +
    companionClose();

  return { subject, html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. EMPLOYEE WEEKLY SUMMARY ⭐
//    Appreciation-focused · own activity only · no revenue/financial data
// ─────────────────────────────────────────────────────────────────────────────

export function buildEmployeeWeeklySummaryEmail(opts: {
  displayName:    string;
  stats:          EmployeeWeeklyStats;
  summaryMessage: string;
  appUrl?:        string;
  farmName?:      string;
}): { subject: string; html: string } {
  const url       = opts.appUrl ?? APP_URL;
  const farm      = opts.farmName ? escapeHtml(opts.farmName) : "the farm";
  const firstName = opts.displayName?.trim().split(/[\s,]/)[0] || opts.displayName || "there";
  const { stats } = opts;

  function statCard(value: string, label: string, valueColor: string, fs = "28px"): string {
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="background-color:${C.parchment};border-radius:12px;padding:18px 10px;text-align:center;border:1px solid ${C.line};">
<p style="margin:0 0 5px 0;font-family:${DISPLAY_FONT};font-size:${fs};font-weight:700;color:${valueColor};line-height:1.1;">${escapeHtml(value)}</p>
<p style="margin:0;font-family:${BODY_FONT};font-size:10px;font-weight:600;color:${C.mute};text-transform:uppercase;letter-spacing:0.1em;">${escapeHtml(label)}</p>
</td>
</tr>
</table>`;
  }

  const statsGrid = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td width="50%" valign="top" style="padding:0 5px 10px 0;">${statCard(String(stats.operationsLogged), "Activities Logged", C.vault, "28px")}</td>
<td width="50%" valign="top" style="padding:0 0 10px 5px;">${statCard(String(stats.daysActive), "Days Active", C.positive, "28px")}</td>
</tr>
${stats.streakDays > 1 ? `<tr>
<td width="50%" valign="top" style="padding:0 5px 0 0;">${statCard(`${stats.streakDays} days`, "Active Streak", C.harvestDeep, "20px")}</td>
<td width="50%" valign="top" style="padding:0 0 0 5px;">${stats.topActivity ? statCard(escapeHtml(stats.topActivity), "Top Activity", C.inkSoft, "14px") : ""}</td>
</tr>` : stats.topActivity ? `<tr>
<td width="100%" colspan="2" valign="top" style="padding:0;">${statCard(escapeHtml(stats.topActivity), "Top Activity This Week", C.inkSoft, "15px")}</td>
</tr>` : ""}
</table>`;

  const streakBadge = stats.streakDays > 2 ? `<tr>
<td style="padding:0 0 18px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td style="background-color:${C.parchment};border-radius:12px;padding:14px 18px;border:1px solid ${C.harvest};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td width="28" valign="middle" style="font-size:20px;line-height:1;">&#x1F525;</td>
<td valign="middle" style="padding-left:10px;font-family:${BODY_FONT};">
<p style="margin:0 0 2px 0;font-family:${DISPLAY_FONT};font-size:15px;font-weight:700;color:${C.harvestDeep};">${stats.streakDays}-day active streak</p>
<p style="margin:0;font-size:12px;color:${C.mute};">Your consistency this week is something to be proud of.</p>
</td>
</tr></table>
</td>
</tr></table>
</td>
</tr>` : "";

  const hasActivity = stats.operationsLogged > 0 || stats.daysActive > 0;
  const closingLine = hasActivity
    ? "Your consistency this week kept the farm operations running. Thank you for showing up every day."
    : "Even quieter weeks are part of farming. Come back next week and keep building your streak.";

  const heroPanelRow = bannerPanel({
    headline: `Great work\nthis week.`,
    headlineAccent: C.leaf,
    subline: `${firstName}, here is a look at your week on ${farm}.`,
  });

  const contentRow = `<tr>
<td class="content-td" bgcolor="${C.parchment}" style="padding:44px 40px 48px;background-color:${C.parchment};font-family:${BODY_FONT};color:${C.ink}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px 0;">
<tr><td>${statsGrid}</td></tr>
${streakBadge}</table>
${paragraphsToHtml(opts.summaryMessage || closingLine)}
${ctaButton("Open FarmVault →", `${url}/home`)}
<p class="closing-p" style="margin:24px 0 0 0;font-family:${BODY_FONT};font-size:12px;color:${C.mute};font-style:italic;text-align:center;line-height:1.6;">Every task you log builds a stronger farm record.</p>
</td>
</tr>`;

  const preheader = stats.operationsLogged > 0
    ? `${firstName}, you logged ${stats.operationsLogged} activities this week — great work!`
    : `${firstName}, here is your FarmVault week in review.`;

  const html =
    companionOpen(preheader, "Your FarmVault Weekly Summary") +
    heroPanelRow +
    contentRow +
    footerRow("Your work. Your streak. Your farm story.") +
    companionClose();

  return {
    subject: `⭐ ${firstName}, your FarmVault week in review — great work!`,
    html,
  };
}
