/**
 * Smart Companion email templates — fully custom, emotionally distinct per notification type.
 *
 * Morning ☀️ · Evening 🌙 · Inactivity 🌿 · Weekly Summary 🏆
 *
 * Every template:
 *   – Has its own complete HTML document (does NOT wrap in farmVaultEmailShell)
 *   – Opens with the FarmVault mascot (left) and logo (right) on every email
 *   – Has a distinctive colour palette, gradient hero, and emotional tone
 *   – Is mobile-first, inline-styled, and compatible with Resend / Gmail
 *
 * Design principle: "FarmVault is my farming companion."
 * Warm · Human · Premium · Emotionally intelligent · Never robotic.
 */

import { escapeHtml } from "./escapeHtml.ts";
import type { InactivityTier } from "../smartDailyMessagingPools.ts";

// ─── Assets & brand ──────────────────────────────────────────────────────────

const LOGO_URL =
  "https://farmvault.africa/Logo/FarmVault_Logo%20dark%20mode.png";

/**
 * FarmVault companion mascot — the emotional face of the product.
 * Upload the mascot asset to this URL before enabling production sends.
 * The mascot should feel friendly, modern, and agriculture-focused.
 */
const MASCOT_URL = "https://farmvault.africa/mascot/fv-companion.png";

const FONT = "Arial, Helvetica, sans-serif";

// ─── Utility helpers ─────────────────────────────────────────────────────────

function ea(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Warm, natural greeting — never robotic or generic.
 * Falls back to a human-sounding phrase if name is missing/generic.
 */
function warmGreeting(displayName: string, emoji: string): string {
  const name = displayName?.trim();
  if (!name || name === "there" || name === "Farmer") {
    return `Hello there ${emoji}`;
  }
  return `Hello ${escapeHtml(name)} ${emoji}`;
}

// ─── Shared layout primitives ─────────────────────────────────────────────────

/**
 * Opens the HTML document plus all outer wrapper tables.
 * Inner template row blocks (<tr>…</tr>) are concatenated after this.
 */
function docOpen(preheader: string, title: string, bodyBg: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${bodyBg};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${bodyBg};">
<tr><td align="center" style="padding:28px 16px 36px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
<tr><td style="border-radius:20px;overflow:hidden;background-color:#ffffff;border:1px solid #e5ebe7;box-shadow:0 4px 32px rgba(31,111,67,0.09);">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">`;
}

/**
 * Closes all wrapper tables, appends the outer footnote, and closes the HTML document.
 * Must match docOpen exactly — see nested table comments.
 */
function docClose(footnote: string): string {
  return `</table>
</td></tr>
</table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
<tr><td style="padding:18px 12px 0 12px;font-family:${FONT};font-size:12px;line-height:1.6;color:#9ca3af;text-align:center;">
${escapeHtml(footnote)}<br/><a href="${ea("https://farmvault.africa")}" target="_blank" rel="noopener noreferrer" style="color:#2d8a57;text-decoration:none;">farmvault.africa</a>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

/**
 * The branded pair at the top of every companion email:
 * mascot on the left, FarmVault logo on the right.
 * The mascot is the emotional face of FarmVault — friendly, agriculture-focused.
 */
function headerRow(borderColor = "#f3f4f6"): string {
  return `<tr>
<td style="padding:18px 24px 16px 24px;background-color:#ffffff;border-bottom:1px solid ${borderColor};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td width="56" valign="middle">
<img src="${ea(MASCOT_URL)}" width="44" height="44" alt="🌱"
  style="display:block;border:0;outline:none;border-radius:50%;background-color:#f0f7f2;width:44px;height:44px;" />
</td>
<td valign="middle" align="right">
<img src="${ea(LOGO_URL)}" width="90" height="auto" alt="FarmVault"
  style="display:block;border:0;outline:none;height:30px;width:auto;max-width:110px;margin-left:auto;" />
</td>
</tr>
</table>
</td>
</tr>`;
}

/** Branded footer row inside the card. */
function footerRow(tagline: string, bg: string): string {
  return `<tr>
<td style="padding:24px 32px 30px 32px;background-color:${bg};font-family:${FONT};font-size:13px;line-height:1.65;color:#6b7280;text-align:center;border-top:1px solid #e5ebe7;">
<p style="margin:0 0 4px 0;font-size:14px;font-weight:700;color:#1f2937;">FarmVault</p>
<p style="margin:0 0 3px 0;font-size:13px;color:#6b7280;">Smart Farm Management Platform</p>
<p style="margin:0 0 12px 0;font-size:12px;color:#9ca3af;">Track Harvest · Labor · Expenses</p>
<p style="margin:0;font-size:13px;font-style:italic;color:#4b5563;">${escapeHtml(tagline)}</p>
</td>
</tr>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. MORNING COMPANION ☀️
//
// Visual:  sunrise gradient — warm gold → amber → deep farm green
// Mood:    energetic, hopeful, fresh start to the farming day
// Purpose: motivate the farmer, encourage opening FarmVault, start positively
// ─────────────────────────────────────────────────────────────────────────────

export function buildCompanionMorningEmail(opts: {
  displayName: string;
  messageText: string;
  messageHtml: string;
  appUrl?: string;
  farmName?: string;
}): { subject: string; html: string } {
  const url     = opts.appUrl ?? "https://app.farmvault.africa";
  const farm    = opts.farmName ? escapeHtml(opts.farmName) : "your farm";
  const greeting = warmGreeting(opts.displayName, "☀️");
  const subject  = "☀️ " + opts.messageText.split("\n")[0].slice(0, 138);

  const heroRow = `<tr>
<td style="background:linear-gradient(135deg,#f59e0b 0%,#d97706 42%,#1f6f43 100%);background-color:#d97706;padding:34px 32px 30px 32px;text-align:center;">
<p style="margin:0 0 10px 0;font-family:${FONT};font-size:23px;font-weight:700;color:#ffffff;line-height:1.3;letter-spacing:-0.01em;">${greeting}</p>
<p style="margin:0;font-family:${FONT};font-size:14px;color:rgba(255,255,255,0.90);line-height:1.6;">A new farming day begins — ${farm} is ready for you.</p>
</td>
</tr>`;

  const contentRow = `<tr>
<td style="padding:30px 32px 32px 32px;background-color:#ffffff;font-family:${FONT};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="padding:20px 22px;background-color:#fffdf0;border-left:4px solid #f59e0b;border-radius:0 12px 12px 0;font-size:15px;line-height:1.8;color:#374151;">
${opts.messageHtml}
</td>
</tr>
<tr>
<td align="center" style="padding:22px 0 6px 0;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0">
<tr>
<td align="center" bgcolor="#1f6f43" style="background-color:#1f6f43;border-radius:12px;">
<a href="${ea(`${url}/home`)}" target="_blank" rel="noopener noreferrer"
  style="display:inline-block;padding:15px 38px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;mso-line-height-rule:exactly;line-height:1.2;letter-spacing:0.01em;">
Open My Farm Dashboard
</a>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:14px 0 4px 0;font-family:${FONT};font-size:13px;color:#9ca3af;font-style:italic;text-align:center;">
Your farming companion is always with you. 🌿
</td>
</tr>
</table>
</td>
</tr>`;

  const html =
    docOpen(`A new farming day begins — ${farm} is ready for you.`, "Your FarmVault Morning", "#fffbf2") +
    headerRow("#f3f0e8") +
    heroRow +
    contentRow +
    footerRow("Every farming day brings new growth.", "#fefce8") +
    docClose("You're receiving this as part of your FarmVault Smart Companion experience.");

  return { subject, html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. EVENING REFLECTION 🌙
//
// Visual:  deep dusk palette — dark navy → forest twilight → soft indigo
// Mood:    calm, reflective, peaceful — the farming day is closing
// Purpose: encourage activity logging, help the farmer reflect, close the day
// ─────────────────────────────────────────────────────────────────────────────

export function buildCompanionEveningEmail(opts: {
  displayName: string;
  messageText: string;
  messageHtml: string;
  appUrl?: string;
  farmName?: string;
  isWeeklySummary?: boolean;
}): { subject: string; html: string } {
  const url      = opts.appUrl ?? "https://app.farmvault.africa";
  const farm     = opts.farmName ? escapeHtml(opts.farmName) : "your farm";
  const isWeekly = opts.isWeeklySummary ?? false;
  const greeting = warmGreeting(opts.displayName, "🌙");
  const subject  = "🌙 " + opts.messageText.split("\n")[0].slice(0, 138);

  const reflectionLine = isWeekly
    ? `Here is a look back at everything ${farm} accomplished this week. Every record you logged tells the story of your season.`
    : `Take a moment to close the day with your farm. A quick update in FarmVault keeps your records fresh and tomorrow's planning clear.`;

  const heroRow = `<tr>
<td style="background:linear-gradient(135deg,#1a2e3d 0%,#2e3f72 52%,#4a2d6e 100%);background-color:#2e3f72;padding:34px 32px 30px 32px;text-align:center;">
<p style="margin:0 0 10px 0;font-family:${FONT};font-size:23px;font-weight:700;color:#ffffff;line-height:1.3;letter-spacing:-0.01em;">${greeting}</p>
<p style="margin:0;font-family:${FONT};font-size:14px;color:rgba(255,255,255,0.88);line-height:1.6;">
${isWeekly ? "Another week written into your farm story." : `Another farming day complete — ${farm}, you showed up.`}
</p>
</td>
</tr>`;

  const ctaLabel = isWeekly ? "See My Week's Summary" : "Log Today's Work";
  const ctaHref  = isWeekly ? `${url}/home` : `${url}/farm-work`;

  const contentRow = `<tr>
<td style="padding:30px 32px 32px 32px;background-color:#ffffff;font-family:${FONT};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="padding:20px 22px;background-color:#f0f1fa;border-left:4px solid #6366f1;border-radius:0 12px 12px 0;font-size:15px;line-height:1.8;color:#374151;">
${opts.messageHtml}
</td>
</tr>
<tr>
<td align="center" style="padding:22px 0 6px 0;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0">
<tr>
<td align="center" bgcolor="#1f6f43" style="background-color:#1f6f43;border-radius:12px;">
<a href="${ea(ctaHref)}" target="_blank" rel="noopener noreferrer"
  style="display:inline-block;padding:15px 38px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;mso-line-height-rule:exactly;line-height:1.2;letter-spacing:0.01em;">
${escapeHtml(ctaLabel)}
</a>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:14px 0 4px 0;font-family:${FONT};font-size:13px;color:#9ca3af;font-style:italic;text-align:center;">
Rest well. Your farm story continues tomorrow. 🌾
</td>
</tr>
</table>
</td>
</tr>`;

  const emailTitle = isWeekly ? "Your Weekly Farm Summary" : "Your FarmVault Evening";

  const html =
    docOpen(isWeekly ? `Here is a look back at ${farm} this week.` : `Another farming day complete — ${farm}, you showed up.`, emailTitle, "#f2f3fb") +
    headerRow("#e8e6f5") +
    heroRow +
    contentRow +
    footerRow("Rest well. Your farm story continues tomorrow.", "#f5f4fb") +
    docClose("You're receiving this as part of your FarmVault Smart Companion experience.");

  return { subject, html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. INACTIVITY COMPANION 🌿
//
// Visual:  welcoming warmth — tier-specific gradient (green → teal → indigo → purple)
// Mood:    caring, gentle, supportive — NEVER guilt-inducing
// Purpose: reconnect the farmer; "We are still here with you." not "You abandoned us."
// ─────────────────────────────────────────────────────────────────────────────

type InactivityTheme = {
  gradient: string;
  gradientFallback: string;
  accent: string;
  cardBg: string;
  heroTitle: string;
  heroSubtitle: string;
  bodyLine1: string;
  bodyLine2: string;
  ctaLabel: string;
  footerBg: string;
};

function getInactivityTheme(tier: InactivityTier, farm: string): InactivityTheme {
  switch (tier) {
    case "2d":
      return {
        gradient: "linear-gradient(135deg,#1f6f43 0%,#2d8a57 55%,#0e7490 100%)",
        gradientFallback: "#1f6f43",
        accent: "#1f6f43",
        cardBg: "#f0f9f4",
        heroTitle: "Your farm is still growing 🌿",
        heroSubtitle: `${farm} is ready for you, whenever you are.`,
        bodyLine1: "It's been a couple of days since your last visit. Your records are safe and your workspace is exactly as you left it.",
        bodyLine2: "A quick check-in — even just one record — keeps your farm story moving forward.",
        ctaLabel: "Pick Up Where You Left Off",
        footerBg: "#f0f9f4",
      };
    case "5d":
      return {
        gradient: "linear-gradient(135deg,#0369a1 0%,#0891b2 55%,#1f6f43 100%)",
        gradientFallback: "#0369a1",
        accent: "#0891b2",
        cardBg: "#f0f9ff",
        heroTitle: "Your farm journey continues 💧",
        heroSubtitle: "FarmVault has been keeping watch.",
        bodyLine1: `It has been a few days, and we have been keeping ${farm} safe for you. Your records are complete, your workspace is untouched.`,
        bodyLine2: "Farming is hard work — in and out of the app. Whenever the moment feels right, FarmVault is here.",
        ctaLabel: "Return to FarmVault",
        footerBg: "#f0f9ff",
      };
    case "7d":
      return {
        gradient: "linear-gradient(135deg,#4338ca 0%,#6366f1 55%,#0891b2 100%)",
        gradientFallback: "#4338ca",
        accent: "#6366f1",
        cardBg: "#f0f1fa",
        heroTitle: "We've been thinking about your farm 🌾",
        heroSubtitle: "A week passes quickly. Your records don't.",
        bodyLine1: `A week away is perfectly natural — real farming happens in the field, not just the app. ${farm} and everything you have built is safely here.`,
        bodyLine2: "Consistency builds stronger farms. One update today reconnects you to your season.",
        ctaLabel: "Come Back to FarmVault",
        footerBg: "#f0f1fa",
      };
    case "14d":
      return {
        gradient: "linear-gradient(135deg,#5b21b6 0%,#7c3aed 55%,#4338ca 100%)",
        gradientFallback: "#5b21b6",
        accent: "#7c3aed",
        cardBg: "#f5f3ff",
        heroTitle: "A message from your farming companion 💜",
        heroSubtitle: "Your farm data is safe. Your journey is still here.",
        bodyLine1: `Two weeks away — and we want you to know that ${farm}, all your records, and everything you have logged is intact and waiting for you.`,
        bodyLine2: "Every farmer has seasons of rest. Whenever you are ready to start again, FarmVault will be right here — no judgment, no lost data, just your full farm story.",
        ctaLabel: "Return to Your Farm",
        footerBg: "#f5f3ff",
      };
  }
}

export function buildCompanionInactivityEmail(opts: {
  displayName: string;
  tier: InactivityTier;
  nudgeMessage: string;
  appUrl?: string;
  farmName?: string;
}): { subject: string; html: string } {
  const url     = opts.appUrl ?? "https://app.farmvault.africa";
  const farm    = opts.farmName ? escapeHtml(opts.farmName) : "your farm";
  const theme   = getInactivityTheme(opts.tier, farm);
  const greeting = warmGreeting(opts.displayName, "🌿");

  const heroRow = `<tr>
<td style="background:${theme.gradient};background-color:${theme.gradientFallback};padding:34px 32px 30px 32px;text-align:center;">
<p style="margin:0 0 10px 0;font-family:${FONT};font-size:23px;font-weight:700;color:#ffffff;line-height:1.3;letter-spacing:-0.01em;">${escapeHtml(theme.heroTitle)}</p>
<p style="margin:0;font-family:${FONT};font-size:14px;color:rgba(255,255,255,0.88);line-height:1.6;">${escapeHtml(theme.heroSubtitle)}</p>
</td>
</tr>`;

  const contentRow = `<tr>
<td style="padding:30px 32px 32px 32px;background-color:#ffffff;font-family:${FONT};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="padding:0 0 18px 0;font-family:${FONT};font-size:16px;font-weight:600;color:${theme.accent};">${greeting}</td>
</tr>
<tr>
<td style="padding:18px 22px;background-color:${theme.cardBg};border-left:4px solid ${theme.accent};border-radius:0 12px 12px 0;font-size:15px;line-height:1.8;color:#374151;">
${escapeHtml(opts.nudgeMessage)}
</td>
</tr>
<tr>
<td style="padding:20px 0 4px 0;font-family:${FONT};font-size:14px;line-height:1.75;color:#4b5563;">${escapeHtml(theme.bodyLine1)}</td>
</tr>
<tr>
<td style="padding:6px 0 4px 0;font-family:${FONT};font-size:14px;line-height:1.75;color:#4b5563;">${escapeHtml(theme.bodyLine2)}</td>
</tr>
<tr>
<td align="center" style="padding:22px 0 6px 0;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0">
<tr>
<td align="center" bgcolor="#1f6f43" style="background-color:#1f6f43;border-radius:12px;">
<a href="${ea(`${url}/home`)}" target="_blank" rel="noopener noreferrer"
  style="display:inline-block;padding:15px 38px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;mso-line-height-rule:exactly;line-height:1.2;letter-spacing:0.01em;">
${escapeHtml(theme.ctaLabel)}
</a>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:14px 0 4px 0;font-family:${FONT};font-size:13px;color:#9ca3af;font-style:italic;text-align:center;">
FarmVault — your farming companion, always here. 🌾
</td>
</tr>
</table>
</td>
</tr>`;

  const subjects: Record<InactivityTier, string> = {
    "2d":  opts.farmName ? `🌿 ${opts.farmName} — a quick check-in from FarmVault` : "🌿 A quick check-in from your farming companion",
    "5d":  opts.farmName ? `🌿 ${opts.farmName}, your farm journey is still here` : "🌿 Your farm journey is still here",
    "7d":  opts.farmName ? `🌿 We've been thinking about ${opts.farmName}` : "🌿 We've been thinking about your farm",
    "14d": opts.farmName ? `🌿 A message for ${opts.farmName} from FarmVault` : "🌿 A message from your farming companion",
  };

  const html =
    docOpen(opts.nudgeMessage.slice(0, 100), "FarmVault Companion", "#f4faf6") +
    headerRow("#e4f0ea") +
    heroRow +
    contentRow +
    footerRow("We're still here with you, always.", theme.footerBg) +
    docClose("You're receiving this because FarmVault noticed you might need a gentle nudge. No pressure — we're here when you're ready.");

  return { subject: subjects[opts.tier], html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. WEEKLY SUMMARY 🏆
//
// Visual:  premium dark forest green header, gold week label, dashboard stat cards
// Mood:    rewarding, insightful, proud — celebrate every record logged
// Purpose: celebrate progress, summarise farm activity, reinforce FarmVault value
// ─────────────────────────────────────────────────────────────────────────────

export type WeeklySummaryStats = {
  operations: number;
  expenses: number;
  harvestLabel: string;
  inventoryUsed: number;
  weekStart: string;
  weekEnd: string;
  revenue?: number;
  streakDays?: number;
  activeDaysThisWeek?: number;
  topProject?: string | null;
};

export function buildCompanionWeeklySummaryEmail(opts: {
  displayName: string;
  stats: WeeklySummaryStats;
  summaryMessage: string;
  summaryHtml: string;
  appUrl?: string;
  farmName?: string;
}): { subject: string; html: string } {
  const url     = opts.appUrl ?? "https://app.farmvault.africa";
  const farm    = opts.farmName ? escapeHtml(opts.farmName) : "your farm";
  const { stats } = opts;
  const greeting = warmGreeting(opts.displayName, "🏆");

  const hasActivity = stats.operations > 0 || stats.expenses > 0 || stats.inventoryUsed > 0;

  const harvestNonZero = (() => {
    const t = stats.harvestLabel.trim();
    if (!t || /^0(\.0+)?(\s+\w+)?$/i.test(t)) return false;
    for (const chunk of t.split(",")) {
      const m = chunk.trim().match(/^([\d.]+)/);
      if (m && Number(m[1]) !== 0) return true;
    }
    return false;
  })();

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(Math.round(n));

  // ── Stat card builder ──────────────────────────────────────────────────────
  function statCard(value: string, label: string, valueBg: string, valueColor: string, valueFontSize: string): string {
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="background-color:${valueBg};border-radius:12px;padding:18px 10px;text-align:center;">
<p style="margin:0 0 5px 0;font-family:${FONT};font-size:${valueFontSize};font-weight:800;color:${valueColor};line-height:1.1;">${escapeHtml(value)}</p>
<p style="margin:0;font-family:${FONT};font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.07em;">${escapeHtml(label)}</p>
</td>
</tr>
</table>`;
  }

  const harvestCard = harvestNonZero
    ? statCard(stats.harvestLabel.split(",")[0].trim(), "Harvest", "#fffbf0", "#c8a24d", "18px")
    : statCard("—", "No Harvest", "#fffbf0", "#c8a24d", "24px");

  const hasRevenue   = (stats.revenue ?? 0) > 0;
  const hasExpenses  = stats.expenses > 0;
  const hasInventory = stats.inventoryUsed > 0;
  const showRow3     = hasRevenue && hasInventory;

  const statsGrid = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td width="50%" valign="top" style="padding:0 5px 10px 0;">${statCard(String(stats.operations), "Activities", "#f0f7f2", "#1f6f43", "28px")}</td>
<td width="50%" valign="top" style="padding:0 0 10px 5px;">${harvestCard}</td>
</tr>
${hasRevenue ? `<tr>
<td width="50%" valign="top" style="padding:0 5px ${showRow3 ? "10px" : "0"} 0;">${statCard("KES " + fmt(stats.revenue!), "Revenue", "#f0fdf4", "#15803d", "18px")}</td>
<td width="50%" valign="top" style="padding:0 0 ${showRow3 ? "10px" : "0"} 5px;">${hasExpenses ? statCard("KES " + fmt(stats.expenses), "Expenses", "#fef2f2", "#dc2626", "18px") : ""}</td>
</tr>` : hasExpenses || hasInventory ? `<tr>
<td width="50%" valign="top" style="padding:0 5px 0 0;">${hasExpenses ? statCard("KES " + fmt(stats.expenses), "Expenses", "#fef2f2", "#dc2626", "18px") : ""}</td>
<td width="50%" valign="top" style="padding:0 0 0 5px;">${hasInventory ? statCard(String(stats.inventoryUsed), "Inventory", "#eff6ff", "#2563eb", "28px") : ""}</td>
</tr>` : ""}
${showRow3 ? `<tr>
<td width="50%" valign="top" style="padding:0 5px 0 0;">${statCard(String(stats.inventoryUsed), "Inventory", "#eff6ff", "#2563eb", "28px")}</td>
<td width="50%" valign="top" style="padding:0 0 0 5px;"></td>
</tr>` : ""}
</table>`;

  const streakDays = stats.streakDays ?? 0;
  const activeDays = stats.activeDaysThisWeek ?? 0;
  const topProject = stats.topProject ?? null;

  const streakSection = streakDays > 1 ? `<tr>
<td style="padding:0 0 16px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td style="background-color:#fffbf0;border-radius:12px;padding:14px 18px;border:1px solid #f59e0b;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td width="30" valign="middle" style="font-family:${FONT};font-size:20px;line-height:1;">&#x1F525;</td>
<td valign="middle" style="padding-left:10px;font-family:${FONT};">
<p style="margin:0 0 2px 0;font-family:${FONT};font-size:15px;font-weight:700;color:#92400e;">${streakDays}-day active streak</p>
<p style="margin:0;font-family:${FONT};font-size:12px;color:#a16207;">${activeDays > 0 ? `Logged activity on ${activeDays} day${activeDays !== 1 ? "s" : ""} this week` : "Keep the momentum going!"}</p>
</td>
</tr></table>
</td>
</tr></table>
</td>
</tr>` : "";

  const topProjectSection = topProject ? `<tr>
<td style="padding:0 0 16px 0;font-family:${FONT};font-size:13px;color:#6b7280;text-align:center;">
&#11088; Most active project this week: <strong style="color:#1f6f43;">${escapeHtml(topProject)}</strong>
</td>
</tr>` : "";

  const closingLine = hasActivity
    ? "Every record you logged this week strengthens your farm's story. Consistency is how great farms are built."
    : "A quiet week is still a farming week. Come back next week and let's build on your farm journey together.";

  const heroRow = `<tr>
<td style="background:linear-gradient(135deg,#14532d 0%,#1f6f43 55%,#2d8a57 100%);background-color:#1f6f43;padding:34px 32px 30px 32px;text-align:center;">
<p style="margin:0 0 8px 0;font-family:${FONT};font-size:12px;font-weight:700;color:#c8a24d;text-transform:uppercase;letter-spacing:0.13em;">${escapeHtml(stats.weekStart)} – ${escapeHtml(stats.weekEnd)}</p>
<p style="margin:0 0 10px 0;font-family:${FONT};font-size:23px;font-weight:700;color:#ffffff;line-height:1.3;letter-spacing:-0.01em;">Your week at FarmVault 🏆</p>
<p style="margin:0;font-family:${FONT};font-size:14px;color:rgba(255,255,255,0.88);line-height:1.6;">Here is what ${farm} accomplished.</p>
</td>
</tr>`;

  const contentRow = `<tr>
<td style="padding:30px 32px 32px 32px;background-color:#ffffff;font-family:${FONT};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="padding:0 0 6px 0;font-family:${FONT};font-size:16px;font-weight:700;color:#1f2937;">${greeting}</td>
</tr>
<tr>
<td style="padding:6px 0 22px 0;font-family:${FONT};font-size:14px;color:#4b5563;line-height:1.7;">
Here is everything ${farm} did this week (${escapeHtml(stats.weekStart)} – ${escapeHtml(stats.weekEnd)}).
</td>
</tr>
<tr>
<td style="padding:0 0 ${streakSection || topProjectSection ? "16px" : "24px"} 0;">${statsGrid}</td>
</tr>
${streakSection}${topProjectSection}<tr>
<td style="padding:18px 22px;background-color:#f0f7f2;border-radius:12px;font-family:${FONT};font-size:14px;line-height:1.75;color:#374151;">
${escapeHtml(closingLine)}
</td>
</tr>
<tr>
<td align="center" style="padding:24px 0 6px 0;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0">
<tr>
<td align="center" bgcolor="#1f6f43" style="background-color:#1f6f43;border-radius:12px;">
<a href="${ea(`${url}/home`)}" target="_blank" rel="noopener noreferrer"
  style="display:inline-block;padding:15px 38px;font-family:${FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;mso-line-height-rule:exactly;line-height:1.2;letter-spacing:0.01em;">
View Full Dashboard
</a>
</td>
</tr>
</table>
</td>
</tr>
<tr>
<td style="padding:14px 0 4px 0;font-family:${FONT};font-size:13px;color:#9ca3af;font-style:italic;text-align:center;">
Keep growing. Your companion is always watching over your farm. 🌾
</td>
</tr>
</table>
</td>
</tr>`;

  const preheader = `Your FarmVault week: ${stats.operations} activities${harvestNonZero ? `, ${stats.harvestLabel} harvested` : ""}.`;

  const html =
    docOpen(preheader, "Your Weekly FarmVault Summary", "#f3faf5") +
    headerRow("#daeee4") +
    heroRow +
    contentRow +
    footerRow("Your farm story, written week by week.", "#f0f7f2") +
    docClose("You're receiving this as part of your FarmVault Smart Companion weekly summary.");

  return {
    subject: opts.farmName
      ? `📊 ${opts.farmName} — your weekly FarmVault summary`
      : "📊 Your weekly FarmVault farm summary",
    html,
  };
}
