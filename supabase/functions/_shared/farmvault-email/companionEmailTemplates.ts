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

const DISPLAY_FONT = "'Bricolage Grotesque', Georgia, 'Times New Roman', serif";
const BODY_FONT    = "'Inter', Arial, Helvetica, sans-serif";
const MONO_FONT    = "'JetBrains Mono', 'Courier New', monospace";

// Google Fonts import — honoured by Apple Mail, Outlook.com, Fastmail; ignored by Gmail (falls back gracefully)
const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,700&family=Inter:wght@400;500;600&display=swap');`;

// ─── Utility ─────────────────────────────────────────────────────────────────

export { C, DISPLAY_FONT, BODY_FONT, MONO_FONT, APP_URL, LOGO_URL, MASCOT_URL };

export function ea(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * Mirrors React Email's <BodyParagraphs> component exactly.
 * First paragraph: 17px bold, ink. Rest: 16px normal, inkSoft.
 * Used so Deno-side emails render identically to the live preview.
 */
export function paragraphsToHtml(text: string): string {
  const paras = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  if (paras.length === 0) return "";
  const [first, ...rest] = paras;
  const firstHtml = `<p class="body-p1" style="margin:0 0 16px 0;font-family:${BODY_FONT};font-size:17px;font-weight:600;line-height:1.65;color:${C.ink};white-space:pre-line;">${escapeHtml(first)}</p>`;
  const restHtml  = rest.map(p => `<p class="body-p" style="margin:0 0 16px 0;font-family:${BODY_FONT};font-size:16px;line-height:1.85;color:${C.inkSoft};white-space:pre-line;">${escapeHtml(p)}</p>`).join("");
  return firstHtml + restHtml;
}

// ─── Layout primitives ───────────────────────────────────────────────────────

export function companionOpen(preheader: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" style="color-scheme:light;"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
<title>${escapeHtml(title)}</title>
<style>${FONT_IMPORT}
  /* ── Mobile ─────────────────────────────────────────── */
  @media only screen and (max-width:600px){
    .email-outer{padding:12px 8px 28px 8px!important;}
    .email-card{width:100%!important;border-radius:12px!important;}
    .banner-left{padding:24px 10px 28px 18px!important;}
    .banner-scene{padding:0 8px 0 0!important;}
    .mascot-img{width:150px!important;height:150px!important;}
    .headline{font-size:24px!important;line-height:1.12!important;}
    .content-td{padding:28px 20px 32px 20px!important;}
    .cta-table{width:auto!important;}
  }
  /* ── Force exact palette in dark mode — block Gmail/Samsung inversion ── */
  @media (prefers-color-scheme:dark){
    /* Outer wrapper */
    .email-outer{background-color:${C.forestMid}!important;}
    .email-card{background-color:${C.parchment}!important;}
    /* Hero — keep dark forest green, not warm brown */
    .banner-outer{border-bottom:3px solid ${C.harvest}!important;}
    .banner-left{background:linear-gradient(150deg,${C.forestDeep} 0%,${C.forest} 100%)!important;background-color:${C.forestDeep}!important;}
    .banner-scene{background-color:${C.parchment}!important;color:${C.ink}!important;}
    .headline{color:${C.cream}!important;}
    /* Content body */
    .content-td{background-color:${C.parchment}!important;color:${C.ink}!important;}
    .body-p1{color:${C.ink}!important;}
    .body-p{color:${C.inkSoft}!important;}
    .closing-p{color:${C.mute}!important;}
    /* Footer — keep dark forest green */
    .footer-td{background-color:${C.forestDeep}!important;}
    .footer-brand{color:${C.cream}!important;}
    .footer-tag{color:rgba(253,252,248,0.42)!important;}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.forestMid};color-scheme:light;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${C.forestMid}" style="background-color:${C.forestMid};">
<tr><td class="email-outer" align="center" style="padding:28px 16px 44px 16px;" bgcolor="${C.forestMid}">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" class="email-card" bgcolor="${C.parchment}" style="max-width:600px;border-radius:20px;overflow:hidden;background-color:${C.parchment};">`;
}

export function companionClose(): string {
  return `</table>
</td></tr>
</table>
</body></html>`;
}

/**
 * Banner panel — cinematic dark-forest hero + parchment mascot column.
 *
 *  LEFT (56%): dark forest gradient — FarmVault logo · headline · date chip · optional subline
 *  RIGHT (44%): parchment — mascot sits flush on the harvest gold divider line
 */
export function bannerPanel(opts: {
  headline: string;    // use \n for two-line display (e.g. "Good morning,\nFarmer.")
  headlineAccent?: string;  // color for line 2, defaults to harvest gold
  subline?: string;
}): string {
  const [h1, h2] = opts.headline.split("\n");
  const accentColor = opts.headlineAccent ?? C.harvest;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return `<tr>
<td class="banner-outer" style="padding:0;border-bottom:3px solid ${C.harvest};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<!--[if mso]><td width="336" valign="top" style="width:336px;background:${C.forestDeep};"><![endif]-->
<!--[if !mso]><!--><td class="banner-left" valign="top" bgcolor="${C.forestDeep}"
  style="width:56%;background:linear-gradient(150deg,${C.forestDeep} 0%,${C.forest} 100%);background-color:${C.forestDeep};padding:52px 24px 56px 36px;vertical-align:top;"><!--<![endif]-->

  <!-- Logo (dark-mode version) -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 32px 0;">
  <tr><td>
  <img src="${ea(LOGO_URL)}" width="110" height="26" alt="FarmVault"
    style="display:block;border:0;outline:none;height:26px;width:auto;" />
  </td></tr>
  </table>

  <!-- Greeting — cream on dark forest -->
  <p class="headline" style="margin:0 0 12px 0;font-family:${DISPLAY_FONT};font-size:46px;font-weight:700;color:${C.cream};line-height:1.06;letter-spacing:-0.03em;word-break:break-word;">${escapeHtml(h1)}${h2 ? `<br/><span style="color:${accentColor};">${escapeHtml(h2)}</span>` : ""}</p>

  <!-- Date chip -->
  <p style="margin:${opts.subline ? "0 0 14px 0" : "0"};font-family:${BODY_FONT};font-size:11px;color:rgba(253,252,248,0.48);letter-spacing:0.07em;text-transform:uppercase;">${escapeHtml(today)}</p>

  ${opts.subline ? `<!-- Subline -->
  <p style="margin:0;font-family:${BODY_FONT};font-size:13px;line-height:1.65;color:rgba(253,252,248,0.68);">${escapeHtml(opts.subline)}</p>` : ""}

<!--[if mso]></td><td width="264" valign="bottom" style="width:264px;background-color:${C.parchment};"><![endif]-->
<!--[if !mso]><!--></td><td class="banner-scene" valign="bottom" bgcolor="${C.parchment}"
  style="width:44%;background-color:${C.parchment};text-align:center;padding:0 4px;line-height:0;vertical-align:bottom;"><!--<![endif]-->

  <!-- Mascot sits flush on the gold divider line -->
  <img src="${ea(MASCOT_URL)}" width="260" height="260" alt="FarmVault Companion" class="mascot-img"
    style="display:block;border:0;outline:none;width:260px;height:260px;object-fit:contain;margin:0 auto;" />

<!--[if mso]></td><![endif]-->
</tr>
</table>
</td>
</tr>`;
}

/** CTA button — bulletproof dark pill. Background on both <td> and <a> so Gmail mobile can't strip it. */
export function ctaButton(label: string, href: string): string {
  return `<table class="cta-table" role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:34px auto 0;">
<tr>
<td align="center" bgcolor="${C.forestDeep}" style="border-radius:8px;background-color:${C.forestDeep};">
<a href="${ea(href)}" target="_blank" rel="noopener noreferrer"
  style="background-color:${C.forestDeep};display:inline-block;padding:14px 36px;font-family:${BODY_FONT};font-size:15px;font-weight:600;color:${C.cream};-webkit-text-fill-color:${C.cream};text-decoration:none;border-radius:8px;mso-line-height-rule:exactly;line-height:1.3;letter-spacing:-0.01em;">
<span style="color:${C.cream};-webkit-text-fill-color:${C.cream};">${escapeHtml(label)}</span>
</a>
</td>
</tr>
</table>`;
}

/** Dark premium footer — minimal, elegant, confident. */
export function footerRow(tagline: string): string {
  return `<tr>
<td class="footer-td" bgcolor="${C.forestDeep}" style="padding:26px 40px 30px;background-color:${C.forestDeep};font-family:${BODY_FONT};text-align:center;">
<p class="footer-brand" style="margin:0 0 7px 0;font-family:${DISPLAY_FONT};font-size:16px;font-weight:700;color:${C.cream};letter-spacing:-0.015em;">Farm<span style="color:${C.harvest};">Vault</span></p>
<p class="footer-tag" style="margin:0;font-size:11px;color:rgba(253,252,248,0.42);letter-spacing:0.07em;text-transform:uppercase;">${escapeHtml(tagline)}</p>
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
    headline: `Good morning,\n${firstName}.`,
  });

  const contentRow = `<tr>
<td class="content-td" bgcolor="${C.parchment}" style="padding:44px 40px 48px;background-color:${C.parchment};font-family:${BODY_FONT};color:${C.ink}">
${paragraphsToHtml(opts.messageText)}
${ctaButton("Start Today's Journey →", `${url}/home`)}
<p class="closing-p" style="margin:24px 0 0 0;font-family:${BODY_FONT};font-size:12px;color:${C.mute};font-style:italic;text-align:center;line-height:1.6;">Your farming companion walks this journey with you.</p>
</td>
</tr>`;

  const html =
    companionOpen(`A new farming day begins — ${farm} is ready for you.`, "Your FarmVault Morning") +
    heroPanelRow +
    contentRow +
    footerRow("Every farming day brings new growth.") +
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

  const headline    = isWeekly ? `This week,\n${farm}.` : `Good evening,\n${firstName}.`;
  const subline     = isWeekly
    ? `Another week written into ${farm}'s story.`
    : `Another farming day complete — ${farm}, you showed up.`;
  const ctaLabel    = isWeekly ? "View This Week →" : "Log Today's Progress →";
  const ctaHref     = isWeekly ? `${url}/home` : `${url}/farm-work`;
  const closingLine = isWeekly
    ? "Every week written down becomes next season's wisdom."
    : "Rest well. Your farm story continues tomorrow.";
  const tagline     = isWeekly ? "Your farm story, written week by week." : "Rest well. Your farm story continues tomorrow.";

  const heroPanelRow = bannerPanel({ headline, subline });

  const contentRow = `<tr>
<td class="content-td" bgcolor="${C.parchment}" style="padding:44px 40px 48px;background-color:${C.parchment};font-family:${BODY_FONT};color:${C.ink}">
${paragraphsToHtml(opts.messageText)}
${ctaButton(ctaLabel, ctaHref)}
<p class="closing-p" style="margin:24px 0 0 0;font-family:${BODY_FONT};font-size:12px;color:${C.mute};font-style:italic;text-align:center;line-height:1.6;">${escapeHtml(closingLine)}</p>
</td>
</tr>`;

  const preheader = isWeekly
    ? `Here is a look back at ${farm} this week.`
    : `Another farming day complete — ${farm}, you showed up.`;

  const html =
    companionOpen(preheader, isWeekly ? "Your Weekly Farm Summary" : "Your FarmVault Evening") +
    heroPanelRow +
    contentRow +
    footerRow(tagline) +
    companionClose();

  return { subject, html };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. INACTIVITY COMPANION 🌿
//    Banner variant: V_Inactive / V_WeMissYou
//    Tone: caring, gentle — "We're still here." not "You abandoned us."
// ─────────────────────────────────────────────────────────────────────────────

type InactivityTheme = {
  headline:      string;
  headlineAccent?: string;
  subline:       string;
  ctaLabel:      string;
  footerTagline: string;
};

function getInactivityTheme(tier: InactivityTier, farm: string): InactivityTheme {
  switch (tier) {
    case "2d":
      return {
        headline:      `We noticed\nthe quiet.`,
        headlineAccent: C.harvest,
        subline:       `${farm} is ready for you, whenever you are.`,
        ctaLabel:      "Return to Your Farm →",
        footerTagline: "Still here. Always.",
      };
    case "5d":
      return {
        headline:      `Your farm\nmisses you.`,
        headlineAccent: C.leaf,
        subline:       "FarmVault has been keeping watch.",
        ctaLabel:      "Come Back →",
        footerTagline: "Still here. Always.",
      };
    case "7d":
      return {
        headline:      `We've been\nthinking.`,
        headlineAccent: C.harvest,
        subline:       `A week away from ${farm}. Your records are safe.`,
        ctaLabel:      "Return to FarmVault →",
        footerTagline: "Still here. Always.",
      };
    case "14d":
      return {
        headline:      `We miss you,\n${farm}.`,
        headlineAccent: C.harvestDeep,
        subline:       "Your farm data is safe. Your journey is still here.",
        ctaLabel:      "I'm Ready to Return →",
        footerTagline: "Still here. Always.",
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
    headline:       theme.headline,
    headlineAccent: theme.headlineAccent,
    subline:        theme.subline,
  });

  const contentRow = `<tr>
<td class="content-td" bgcolor="${C.parchment}" style="padding:44px 40px 48px;background-color:${C.parchment};font-family:${BODY_FONT};color:${C.ink}">
${paragraphsToHtml(opts.nudgeMessage)}
${ctaButton(theme.ctaLabel, `${url}/home`)}
<p class="closing-p" style="margin:24px 0 0 0;font-family:${BODY_FONT};font-size:12px;color:${C.mute};font-style:italic;text-align:center;line-height:1.6;">FarmVault — walking the journey with you, always.</p>
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
    footerRow(theme.footerTagline) +
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
    headline: `This week,\n${farm}.`,
    subline:  `Here is what ${farm} accomplished this week.`,
  });

  const contentRow = `<tr>
<td class="content-td" bgcolor="${C.parchment}" style="padding:44px 40px 48px;background-color:${C.parchment};font-family:${BODY_FONT};color:${C.ink}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px 0;">
<tr><td>${statsGrid}</td></tr>
${streakSection}${topProjectSection}</table>
${paragraphsToHtml(closingLine)}
${ctaButton("View This Week →", `${url}/home`)}
<p class="closing-p" style="margin:24px 0 0 0;font-family:${BODY_FONT};font-size:12px;color:${C.mute};font-style:italic;text-align:center;line-height:1.6;">Every week you log is a season you'll understand.</p>
</td>
</tr>`;

  const preheader = `Your FarmVault week: ${stats.operations} activities${harvestNonZero ? `, ${stats.harvestLabel} harvested` : ""}.`;

  const html =
    companionOpen(preheader, "Your Weekly FarmVault Summary") +
    heroPanelRow +
    contentRow +
    footerRow("Your farm story, written week by week.") +
    companionClose();

  return {
    subject: opts.farmName
      ? `📊 ${opts.farmName} — your weekly FarmVault summary`
      : "📊 Your weekly FarmVault farm summary",
    html,
  };
}
