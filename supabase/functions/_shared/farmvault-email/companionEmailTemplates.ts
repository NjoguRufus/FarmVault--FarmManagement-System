/**
 * FarmVault Companion Email Templates
 *
 * Visual identity follows the FarmVault Banner System design spec:
 *   Palette  — parchment · vault green · harvest gold · forest ink
 *   Type     — Bricolage Grotesque (display) · Inter (body) · fallback Arial/Georgia
 *   Structure — banner hero · leaf separator · message body · CTA
 *
 * Morning ☀️ · Evening 🌙 · Inactivity 🌿 · Weekly Summary 📊
 */

import { escapeHtml } from "./escapeHtml.ts";
import type { InactivityTier } from "../smartDailyMessagingPools.ts";

// ─── Brand assets ─────────────────────────────────────────────────────────────

const LOGO_URL  = "https://farmvault.africa/Logo/FarmVault_Logo%20dark%20mode.png";
const MASCOT_URL = "https://app.farmvault.africa/mascot/mascot%201.png";
const APP_URL   = "https://app.farmvault.africa";

// ─── Design tokens (oklch → hex, email-safe) ─────────────────────────────────

const C = {
  forestDeep:    "#1e2c21",   // oklch(0.22 0.04 145)
  forest:        "#2e4535",   // oklch(0.32 0.06 145)
  forestMid:     "#3d5c48",   // oklch(0.42 0.08 145)
  vault:         "#3e6b49",   // oklch(0.48 0.11 145)
  vaultSoft:     "#5a8a68",   // oklch(0.62 0.09 145)
  leaf:          "#6ca870",   // oklch(0.72 0.13 142)
  harvest:       "#d4a840",   // oklch(0.78 0.14 80)
  harvestDeep:   "#b88530",   // oklch(0.66 0.15 70)
  amber:         "#c8952e",   // oklch(0.74 0.13 60)
  parchment:     "#f7f3e6",   // oklch(0.97 0.015 85)
  parchmentWarm: "#f2ead8",   // oklch(0.94 0.025 80)
  cream:         "#fdfcf8",   // oklch(0.99 0.008 85)
  ink:           "#1c2820",   // oklch(0.18 0.02 145)
  inkSoft:       "#2f3d30",   // oklch(0.32 0.02 145)
  mute:          "#5e6e5e",   // oklch(0.55 0.015 145)
  line:          "#ddd8c4",   // oklch(0.88 0.01 100)
  alert:         "#c8594a",   // oklch(0.68 0.16 40)
  positive:      "#4a8f54",   // oklch(0.62 0.14 145)
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────

const DISPLAY_FONT = '"Bricolage Grotesque", Georgia, "Times New Roman", serif';
const BODY_FONT    = '"Inter", Arial, Helvetica, sans-serif';
const MONO_FONT    = '"JetBrains Mono", "Courier New", monospace';

// Google Fonts import — honoured by Apple Mail, Outlook.com, Fastmail; ignored by Gmail (falls back gracefully)
const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,700&family=Inter:wght@400;500;600&display=swap');`;

// ─── Utility ─────────────────────────────────────────────────────────────────

function ea(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function warmGreeting(displayName: string, emoji: string): string {
  const name = displayName?.trim();
  if (!name || name === "there" || name === "Farmer") return `Hello there ${emoji}`;
  return `Hello ${escapeHtml(name)} ${emoji}`;
}

// ─── Layout primitives ───────────────────────────────────────────────────────

function companionOpen(preheader: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(title)}</title>
<style>${FONT_IMPORT}
  @media only screen and (max-width:600px){
    .banner-left{width:100%!important;display:block!important;}
    .banner-scene{display:none!important;width:0!important;overflow:hidden!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.parchmentWarm};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${C.parchmentWarm};">
<tr><td align="center" style="padding:24px 16px 40px 16px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;border-radius:16px;overflow:hidden;background-color:${C.parchment};">`;
}

function companionClose(): string {
  return `</table>
</td></tr>
</table>
</body></html>`;
}

/**
 * Banner panel — the email equivalent of the FarmVault Banner System.
 *
 *  LEFT (58%): parchment — FarmVault logo · eyebrow · big headline · subline
 *  RIGHT (42%): scene gradient — mascot image centred on the colour field
 *
 * sceneGradient: CSS gradient (background shorthand)
 * sceneFallback: solid hex fallback for MSO / plain clients
 */
function bannerPanel(opts: {
  eyebrow: string;
  headline: string;      // use \n for the vault-green second line (e.g. "Good morning,\nFarmer.")
  subline: string;
  sceneGradient: string;
  sceneFallback: string;
}): string {
  const [h1, h2] = opts.headline.split("\n");

  return `<tr>
<td style="padding:0;border-bottom:3px solid ${C.harvest};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<!--[if mso]><td width="350" valign="top" style="width:350px;background-color:${C.parchment};"><![endif]-->
<!--[if !mso]><!--><td class="banner-left" valign="top" style="width:58%;min-width:260px;background-color:${C.parchment};padding:32px 24px 36px 32px;vertical-align:top;"><!--<![endif]-->

  <!-- Logo row -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px 0;">
  <tr>
  <td valign="middle">
  <img src="${ea(LOGO_URL)}" width="100" height="auto" alt="FarmVault" style="display:block;border:0;outline:none;height:24px;width:auto;max-width:120px;" />
  </td>
  </tr>
  </table>

  <!-- Eyebrow -->
  <p style="margin:0 0 10px 0;font-family:${MONO_FONT};font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.vaultSoft};">${escapeHtml(opts.eyebrow)}</p>

  <!-- Headline — line 1 (ink) + line 2 (vault green) -->
  <p style="margin:0 0 16px 0;font-family:${DISPLAY_FONT};font-size:40px;font-weight:700;color:${C.ink};line-height:1.04;letter-spacing:-0.025em;word-break:break-word;">${escapeHtml(h1)}${h2 ? `<br/><span style="color:${C.vault};">${escapeHtml(h2)}</span>` : ""}</p>

  <!-- Subline -->
  <p style="margin:0;font-family:${BODY_FONT};font-size:13px;line-height:1.65;color:${C.mute};">${escapeHtml(opts.subline)}</p>

<!--[if mso]></td><td width="250" valign="top" style="width:250px;"><![endif]-->
<!--[if !mso]><!--></td><td class="banner-scene" valign="top" style="width:42%;min-width:160px;background-color:${C.parchment};text-align:center;padding:0;"><!--<![endif]-->

  <!-- Mascot — prominent in the scene column, matching the banner's ZoneMascot -->
  <table role="presentation" width="100%" height="100%" cellspacing="0" cellpadding="0" border="0">
  <tr>
  <td align="center" valign="middle" style="padding:24px 16px;">
  <img src="${ea(MASCOT_URL)}" width="200" height="200" alt="FarmVault Companion"
    style="display:block;border:0;outline:none;width:200px;height:200px;object-fit:contain;margin:0 auto;
           filter:drop-shadow(0 8px 24px rgba(0,0,0,0.28));" />
  </td>
  </tr>
  </table>

<!--[if mso]></td><![endif]-->
</tr>
</table>
</td>
</tr>`;
}

/** Leaf rule separator — echoes the FarmVault Banner System's signature divider. */
function leafRule(): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0;">
<tr>
<td style="border-top:2px solid ${C.vault};width:60px;" width="60"></td>
<td width="34" align="center" style="padding:0 8px;">
<svg width="18" height="14" viewBox="0 0 18 14" xmlns="http://www.w3.org/2000/svg" style="display:block;">
<path d="M2 7 C 2 3, 6 1, 9 1 C 12 1, 16 3, 16 7 C 13 7, 9 9, 9 13 C 9 9, 5 7, 2 7 Z" fill="${C.leaf}"/>
</svg>
</td>
<td style="border-top:2px solid ${C.vault};opacity:0.4;"></td>
</tr>
</table>`;
}

/** CTA button row. */
function ctaButton(label: string, href: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
<tr>
<td align="center" style="border-radius:999px;background:linear-gradient(180deg,${C.vault} 0%,${C.forest} 100%);background-color:${C.vault};box-shadow:0 8px 20px rgba(30,44,33,0.30);">
<a href="${ea(href)}" target="_blank" rel="noopener noreferrer"
  style="display:inline-block;padding:15px 38px;font-family:${BODY_FONT};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;mso-line-height-rule:exactly;line-height:1.2;letter-spacing:-0.005em;">
${escapeHtml(label)} &nbsp;→
</a>
</td>
</tr>
</table>`;
}

/** Card footer inside the email card. */
function footerRow(tagline: string, bg: string): string {
  return `<tr>
<td style="padding:22px 32px 28px 32px;background-color:${bg};font-family:${BODY_FONT};font-size:13px;line-height:1.65;color:${C.mute};text-align:center;border-top:1px solid ${C.line};">
<p style="margin:0 0 4px 0;font-family:${DISPLAY_FONT};font-size:15px;font-weight:700;color:${C.inkSoft};">Farm<span style="color:${C.harvestDeep};">Vault</span></p>
<p style="margin:0 0 3px 0;font-size:12px;color:${C.mute};">Smart Farm Management · Track Harvest · Labor · Expenses</p>
<p style="margin:8px 0 0 0;font-size:13px;font-style:italic;color:${C.inkSoft};">${escapeHtml(tagline)}</p>
</td>
</tr>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. MORNING COMPANION ☀️
//    Banner variant: V_GoodMorning
//    Scene tint: morning (warm gold → amber → forest)
// ─────────────────────────────────────────────────────────────────────────────

export function buildCompanionMorningEmail(opts: {
  displayName: string;
  messageText: string;
  messageHtml: string;
  appUrl?: string;
  farmName?: string;
}): { subject: string; html: string } {
  const url     = opts.appUrl ?? APP_URL;
  const farm    = opts.farmName ? escapeHtml(opts.farmName) : "your farm";
  const subject = "☀️ " + opts.messageText.split("\n")[0].slice(0, 138);

  const firstName = opts.displayName?.trim().split(/[\s,]/)[0] || opts.displayName || "Farmer";

  const heroPanelRow = bannerPanel({
    eyebrow: "◇ MORNING BRIEFING",
    headline: `Good morning,\n${firstName}.`,
    subline: `A new farming day begins — ${farm} is ready for you.`,
    sceneGradient: `linear-gradient(160deg,${C.harvest} 0%,${C.harvestDeep} 45%,${C.forest} 100%)`,
    sceneFallback: C.harvestDeep,
  });

  const contentRow = `<tr>
<td style="padding:28px 36px 36px 36px;background-color:${C.parchment};font-family:${BODY_FONT};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td>${leafRule()}</td></tr>
<tr>
<td style="padding:20px 22px;background-color:${C.cream};border-left:4px solid ${C.harvest};border-radius:0 12px 12px 0;font-size:15px;line-height:1.8;color:${C.inkSoft};">
${opts.messageHtml}
</td>
</tr>
<tr>
<td align="center" style="padding:26px 0 8px 0;">
${ctaButton("Open My Farm Dashboard", `${url}/home`)}
</td>
</tr>
<tr>
<td style="padding:14px 0 4px 0;font-family:${BODY_FONT};font-size:13px;color:${C.mute};font-style:italic;text-align:center;">
Your farming companion is always with you. 🌿
</td>
</tr>
</table>
</td>
</tr>`;

  const html =
    companionOpen(`A new farming day begins — ${farm} is ready for you.`, "Your FarmVault Morning") +
    heroPanelRow +
    contentRow +
    footerRow("Every farming day brings new growth.", C.parchmentWarm) +
    companionClose();

  return { subject, html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. EVENING REFLECTION 🌙
//    Banner variant: V_GoodEvening
//    Scene tint: evening (forest deep → forest mid → vault)
// ─────────────────────────────────────────────────────────────────────────────

export function buildCompanionEveningEmail(opts: {
  displayName: string;
  messageText: string;
  messageHtml: string;
  appUrl?: string;
  farmName?: string;
  isWeeklySummary?: boolean;
}): { subject: string; html: string } {
  const url      = opts.appUrl ?? APP_URL;
  const farm     = opts.farmName ? escapeHtml(opts.farmName) : "your farm";
  const isWeekly = opts.isWeeklySummary ?? false;
  const subject  = "🌙 " + opts.messageText.split("\n")[0].slice(0, 138);

  const firstName = opts.displayName?.trim().split(/[\s,]/)[0] || opts.displayName || "Farmer";

  const eyebrow   = isWeekly ? "◇ YOUR WEEK ON THE FARM" : "◇ EVENING WRAP";
  const headline  = isWeekly ? "Here's your\nfarm summary." : `Good evening,\n${firstName}.`;
  const subline   = isWeekly
    ? `Another week written into ${farm}'s story.`
    : `Another farming day complete — ${farm}, you showed up.`;
  const ctaLabel  = isWeekly ? "See My Week's Summary" : "Log Today's Work";
  const ctaHref   = isWeekly ? `${url}/home` : `${url}/farm-work`;
  const tagline   = "Rest well. Your farm story continues tomorrow.";

  const heroPanelRow = bannerPanel({
    eyebrow,
    headline,
    subline,
    sceneGradient: `linear-gradient(160deg,${C.forestDeep} 0%,${C.forest} 55%,${C.vault} 100%)`,
    sceneFallback: C.forest,
  });

  const contentRow = `<tr>
<td style="padding:28px 36px 36px 36px;background-color:${C.parchment};font-family:${BODY_FONT};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td>${leafRule()}</td></tr>
<tr>
<td style="padding:20px 22px;background-color:${C.cream};border-left:4px solid ${C.leaf};border-radius:0 12px 12px 0;font-size:15px;line-height:1.8;color:${C.inkSoft};">
${opts.messageHtml}
</td>
</tr>
<tr>
<td align="center" style="padding:26px 0 8px 0;">
${ctaButton(ctaLabel, ctaHref)}
</td>
</tr>
<tr>
<td style="padding:14px 0 4px 0;font-family:${BODY_FONT};font-size:13px;color:${C.mute};font-style:italic;text-align:center;">
Rest well. Your farm story continues tomorrow. 🌾
</td>
</tr>
</table>
</td>
</tr>`;

  const preheader = isWeekly
    ? `Here is a look back at ${farm} this week.`
    : `Another farming day complete — ${farm}, you showed up.`;

  const html =
    companionOpen(preheader, isWeekly ? "Your Weekly Farm Summary" : "Your FarmVault Evening") +
    heroPanelRow +
    contentRow +
    footerRow(tagline, C.parchmentWarm) +
    companionClose();

  return { subject, html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. INACTIVITY COMPANION 🌿
//    Banner variant: V_Inactive / V_WeMissYou
//    Tone: caring, gentle — "We're still here." not "You abandoned us."
// ─────────────────────────────────────────────────────────────────────────────

type InactivityTheme = {
  heroBg: string;
  heroBgFallback: string;
  eyebrow: string;
  headline: string;
  subline: string;
  accentColor: string;
  cardBg: string;
  bodyLine1: string;
  bodyLine2: string;
  ctaLabel: string;
  footerBg: string;
};

function getInactivityTheme(tier: InactivityTier, farm: string): InactivityTheme {
  switch (tier) {
    case "2d":
      return {
        heroBg: `linear-gradient(135deg,${C.vault} 0%,${C.forestMid} 55%,${C.forest} 100%)`,
        heroBgFallback: C.vault,
        eyebrow: "◇ A QUIET CHECK-IN",
        headline: `It's been\nquiet here, ${farm}.`,
        subline: `${farm} is ready for you, whenever you are.`,
        accentColor: C.leaf,
        cardBg: C.parchment,
        bodyLine1: "It's been a couple of days since your last visit. Your records are safe and your workspace is exactly as you left it.",
        bodyLine2: "A quick check-in — even just one record — keeps your farm story moving forward.",
        ctaLabel: "Pick Up Where You Left Off",
        footerBg: C.parchmentWarm,
      };
    case "5d":
      return {
        heroBg: `linear-gradient(135deg,${C.forestMid} 0%,${C.vault} 55%,${C.vaultSoft} 100%)`,
        heroBgFallback: C.forestMid,
        eyebrow: "◇ YOUR FARM JOURNEY",
        headline: `Your farm\nis still here, ${farm}.`,
        subline: "FarmVault has been keeping watch.",
        accentColor: C.vaultSoft,
        cardBg: C.parchment,
        bodyLine1: `It has been a few days, and we have been keeping ${farm} safe for you. Your records are complete, your workspace is untouched.`,
        bodyLine2: "Farming is hard work — in and out of the app. Whenever the moment feels right, FarmVault is here.",
        ctaLabel: "Return to FarmVault",
        footerBg: C.parchmentWarm,
      };
    case "7d":
      return {
        heroBg: `linear-gradient(135deg,${C.forest} 0%,${C.forestMid} 55%,${C.vault} 100%)`,
        heroBgFallback: C.forest,
        eyebrow: "◇ WE'VE BEEN THINKING",
        headline: `We've been\nthinking about ${farm}.`,
        subline: "A week passes quickly. Your records don't.",
        accentColor: C.harvest,
        cardBg: C.parchment,
        bodyLine1: `A week away is perfectly natural — real farming happens in the field, not just the app. ${farm} and everything you have built is safely here.`,
        bodyLine2: "Consistency builds stronger farms. One update today reconnects you to your season.",
        ctaLabel: "Come Back to FarmVault",
        footerBg: C.parchmentWarm,
      };
    case "14d":
      return {
        heroBg: `linear-gradient(135deg,${C.forestDeep} 0%,${C.forest} 55%,${C.forestMid} 100%)`,
        heroBgFallback: C.forestDeep,
        eyebrow: "◇ A MESSAGE FROM YOUR COMPANION",
        headline: `We miss you,\n${farm}.`,
        subline: "Your farm data is safe. Your journey is still here.",
        accentColor: C.harvestDeep,
        cardBg: C.parchment,
        bodyLine1: `Two weeks away — and we want you to know that ${farm}, all your records, and everything you have logged is intact and waiting for you.`,
        bodyLine2: "Every farmer has seasons of rest. Whenever you are ready to start again, FarmVault will be right here — no judgment, no lost data, just your full farm story.",
        ctaLabel: "Return to Your Farm",
        footerBg: C.parchmentWarm,
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
  const url   = opts.appUrl ?? APP_URL;
  const farm  = opts.farmName ? escapeHtml(opts.farmName) : "your farm";
  const theme = getInactivityTheme(opts.tier, farm);

  const heroPanelRow = bannerPanel({
    eyebrow: theme.eyebrow,
    headline: theme.headline,
    subline: theme.subline,
    sceneGradient: theme.heroBg,
    sceneFallback: theme.heroBgFallback,
  });

  const contentRow = `<tr>
<td style="padding:28px 36px 36px 36px;background-color:${C.parchment};font-family:${BODY_FONT};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td>${leafRule()}</td></tr>
<tr>
<td style="padding:20px 22px;background-color:${C.cream};border-left:4px solid ${theme.accentColor};border-radius:0 12px 12px 0;font-size:15px;line-height:1.8;color:${C.inkSoft};">
${escapeHtml(opts.nudgeMessage)}
</td>
</tr>
<tr>
<td style="padding:20px 0 6px 0;font-family:${BODY_FONT};font-size:14px;line-height:1.75;color:${C.inkSoft};">${escapeHtml(theme.bodyLine1)}</td>
</tr>
<tr>
<td style="padding:6px 0 4px 0;font-family:${BODY_FONT};font-size:14px;line-height:1.75;color:${C.mute};">${escapeHtml(theme.bodyLine2)}</td>
</tr>
<tr>
<td align="center" style="padding:26px 0 8px 0;">
${ctaButton(theme.ctaLabel, `${url}/home`)}
</td>
</tr>
<tr>
<td style="padding:14px 0 4px 0;font-family:${BODY_FONT};font-size:13px;color:${C.mute};font-style:italic;text-align:center;">
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
    companionOpen(opts.nudgeMessage.slice(0, 100), "FarmVault Companion") +
    heroPanelRow +
    contentRow +
    footerRow("We're still here with you, always.", theme.footerBg) +
    companionClose();

  return { subject: subjects[opts.tier], html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. WEEKLY SUMMARY 📊
//    Banner variant: V_WeeklySummary
//    Visual: premium forest deep hero · harvest gold week label · stat cards
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
  const url     = opts.appUrl ?? APP_URL;
  const farm    = opts.farmName ? escapeHtml(opts.farmName) : "your farm";
  const { stats } = opts;
  const greeting  = warmGreeting(opts.displayName, "📊");

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

  function statCard(value: string, label: string, bg: string, valueColor: string, fs = "28px"): string {
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="background-color:${bg};border-radius:12px;padding:18px 10px;text-align:center;border:1px solid ${C.line};">
<p style="margin:0 0 5px 0;font-family:${DISPLAY_FONT};font-size:${fs};font-weight:700;color:${valueColor};line-height:1.1;">${escapeHtml(value)}</p>
<p style="margin:0;font-family:${MONO_FONT};font-size:10px;font-weight:600;color:${C.mute};text-transform:uppercase;letter-spacing:0.1em;">${escapeHtml(label)}</p>
</td>
</tr>
</table>`;
  }

  const harvestCard = harvestNonZero
    ? statCard(stats.harvestLabel.split(",")[0].trim(), "Harvest", C.parchment, C.harvestDeep, "18px")
    : statCard("—", "No Harvest", C.parchment, C.mute, "24px");

  const hasRevenue   = (stats.revenue ?? 0) > 0;
  const hasExpenses  = stats.expenses > 0;
  const hasInventory = stats.inventoryUsed > 0;
  const showRow3     = hasRevenue && hasInventory;

  const statsGrid = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td width="50%" valign="top" style="padding:0 5px 10px 0;">${statCard(String(stats.operations), "Activities", C.parchment, C.vault, "28px")}</td>
<td width="50%" valign="top" style="padding:0 0 10px 5px;">${harvestCard}</td>
</tr>
${hasRevenue ? `<tr>
<td width="50%" valign="top" style="padding:0 5px ${showRow3 ? "10px" : "0"} 0;">${statCard("KES " + fmt(stats.revenue!), "Revenue", C.parchment, C.positive, "18px")}</td>
<td width="50%" valign="top" style="padding:0 0 ${showRow3 ? "10px" : "0"} 5px;">${hasExpenses ? statCard("KES " + fmt(stats.expenses), "Expenses", C.parchment, C.alert, "18px") : ""}</td>
</tr>` : hasExpenses || hasInventory ? `<tr>
<td width="50%" valign="top" style="padding:0 5px 0 0;">${hasExpenses ? statCard("KES " + fmt(stats.expenses), "Expenses", C.parchment, C.alert, "18px") : ""}</td>
<td width="50%" valign="top" style="padding:0 0 0 5px;">${hasInventory ? statCard(String(stats.inventoryUsed), "Inventory", C.parchment, C.vault, "28px") : ""}</td>
</tr>` : ""}
${showRow3 ? `<tr>
<td width="50%" valign="top" style="padding:0 5px 0 0;">${statCard(String(stats.inventoryUsed), "Inventory", C.parchment, C.vault, "28px")}</td>
<td width="50%" valign="top" style="padding:0 0 0 5px;"></td>
</tr>` : ""}
</table>`;

  const streakDays = stats.streakDays ?? 0;
  const activeDays = stats.activeDaysThisWeek ?? 0;
  const topProject = stats.topProject ?? null;

  const streakSection = streakDays > 1 ? `<tr>
<td style="padding:0 0 14px 0;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td style="background-color:${C.parchment};border-radius:12px;padding:14px 18px;border:1px solid ${C.harvest};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td width="30" valign="middle" style="font-family:${BODY_FONT};font-size:20px;line-height:1;">&#x1F525;</td>
<td valign="middle" style="padding-left:10px;font-family:${BODY_FONT};">
<p style="margin:0 0 2px 0;font-family:${DISPLAY_FONT};font-size:15px;font-weight:700;color:${C.harvestDeep};">${streakDays}-day active streak</p>
<p style="margin:0;font-size:12px;color:${C.mute};">${activeDays > 0 ? `Logged activity on ${activeDays} day${activeDays !== 1 ? "s" : ""} this week` : "Keep the momentum going!"}</p>
</td>
</tr></table>
</td>
</tr></table>
</td>
</tr>` : "";

  const topProjectSection = topProject ? `<tr>
<td style="padding:0 0 14px 0;font-family:${BODY_FONT};font-size:13px;color:${C.mute};text-align:center;">
&#11088; Most active project this week: <strong style="color:${C.vault};">${escapeHtml(topProject)}</strong>
</td>
</tr>` : "";

  const hasActivity = stats.operations > 0 || stats.expenses > 0 || stats.inventoryUsed > 0;
  const closingLine = hasActivity
    ? "Every record you logged this week strengthens your farm's story. Consistency is how great farms are built."
    : "A quiet week is still a farming week. Come back next week and let's build on your farm journey together.";

  const heroPanelRow = bannerPanel({
    eyebrow: `◇ WEEKLY SUMMARY · ${escapeHtml(stats.weekStart)} — ${escapeHtml(stats.weekEnd)}`,
    headline: `Here's your\nfarm summary.`,
    subline: `Here is what ${farm} accomplished this week.`,
    sceneGradient: `linear-gradient(160deg,${C.forestDeep} 0%,${C.forest} 55%,${C.forestMid} 100%)`,
    sceneFallback: C.forest,
  });

  const contentRow = `<tr>
<td style="padding:28px 36px 36px 36px;background-color:${C.parchment};font-family:${BODY_FONT};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<td style="padding:0 0 6px 0;font-family:${DISPLAY_FONT};font-size:16px;font-weight:700;color:${C.ink};">${greeting}</td>
</tr>
<tr><td>${leafRule()}</td></tr>
<tr>
<td style="padding:0 0 22px 0;">${statsGrid}</td>
</tr>
${streakSection}${topProjectSection}<tr>
<td style="padding:18px 22px;background-color:${C.cream};border-left:4px solid ${C.vault};border-radius:0 12px 12px 0;font-family:${BODY_FONT};font-size:14px;line-height:1.75;color:${C.inkSoft};">
${escapeHtml(closingLine)}
</td>
</tr>
<tr>
<td align="center" style="padding:26px 0 8px 0;">
${ctaButton("View Full Dashboard", `${url}/home`)}
</td>
</tr>
<tr>
<td style="padding:14px 0 4px 0;font-family:${BODY_FONT};font-size:13px;color:${C.mute};font-style:italic;text-align:center;">
Keep growing. Your companion is always watching over your farm. 🌾
</td>
</tr>
</table>
</td>
</tr>`;

  const preheader = `Your FarmVault week: ${stats.operations} activities${harvestNonZero ? `, ${stats.harvestLabel} harvested` : ""}.`;

  const html =
    companionOpen(preheader, "Your Weekly FarmVault Summary") +
    heroPanelRow +
    contentRow +
    footerRow("Your farm story, written week by week.", C.parchmentWarm) +
    companionClose();

  return {
    subject: opts.farmName
      ? `📊 ${opts.farmName} — your weekly FarmVault summary`
      : "📊 Your weekly FarmVault farm summary",
    html,
  };
}
