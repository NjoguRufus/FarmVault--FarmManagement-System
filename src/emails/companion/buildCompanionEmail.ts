/**
 * FarmVault Companion Email — browser-compatible HTML generators.
 *
 * These functions produce the EXACT same HTML that the Edge Function sends via Resend.
 * The dev preview imports from here so Preview HTML === Sent Email HTML.
 *
 * No Deno imports, no React, no framework. Pure string generation.
 */

import { C, LOGO_URL, MASCOT_URL, APP_URL, DISPLAY, BODY, MONO, FONT_IMPORT } from './tokens';

export type InactivityTier = '2d' | '5d' | '7d' | '14d';

// ─── Utilities ───────────────────────────────────────────────────────────────

function esc(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ea(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Splits plain message text on blank lines and returns email-safe HTML.
 * The first paragraph (typically the salutation, e.g. "Good morning, Farmer.")
 * is rendered bold; subsequent paragraphs are rendered in normal weight.
 */
export function paragraphsToHtml(text: string): string {
  const paras = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  if (paras.length === 0) return '';
  const [first, ...rest] = paras;
  const firstHtml = `<p style="margin:0 0 14px 0;font-family:'Inter',Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;line-height:1.55;color:#1c2820;white-space:pre-line;">${esc(first)}</p>`;
  const restHtml  = rest.map(p =>
    `<p style="margin:0 0 14px 0;font-family:'Inter',Arial,Helvetica,sans-serif;font-size:17px;line-height:1.75;color:#2f3d30;white-space:pre-line;">${esc(p)}</p>`
  ).join('');
  return firstHtml + restHtml;
}

// ─── Layout primitives ───────────────────────────────────────────────────────

function open(preheader: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${esc(title)}</title>
<style>
${FONT_IMPORT}
@media only screen and (max-width:600px){
  .banner-left{width:100%!important;display:block!important;}
  .banner-scene{display:none!important;width:0!important;overflow:hidden!important;}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.parchmentWarm};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${C.parchmentWarm};">
<tr><td align="center" style="padding:24px 16px 40px 16px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;border-radius:16px;overflow:hidden;background-color:${C.parchment};">`;
}

function close(): string {
  return `</table>
</td></tr></table>
</body></html>`;
}

function bannerPanel(eyebrow: string, headline: string, subline: string): string {
  const [h1, h2 = ''] = headline.split('\n');
  return `<tr>
<td style="padding:0;border-bottom:3px solid ${C.harvest};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
<!--[if mso]><td width="348" valign="top" style="width:348px;background-color:${C.parchment};"><![endif]-->
<!--[if !mso]><!--><td class="banner-left" valign="top" style="width:58%;background-color:${C.parchment};padding:32px 24px 36px 32px;vertical-align:top;"><!--<![endif]-->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px 0;">
  <tr><td>
  <img src="${ea(LOGO_URL)}" width="100" height="24" alt="FarmVault"
    style="display:block;border:0;outline:none;height:24px;width:auto;max-width:120px;" />
  </td></tr></table>
  <p style="margin:0 0 10px 0;font-family:${MONO};font-size:10px;font-weight:600;
    letter-spacing:0.14em;text-transform:uppercase;color:${C.vaultSoft};">${esc(eyebrow)}</p>
  <p style="margin:0 0 16px 0;font-family:${DISPLAY};font-size:40px;font-weight:700;
    color:${C.ink};line-height:1.04;letter-spacing:-0.025em;word-break:break-word;">${esc(h1)}${h2
  ? `<br/><span style="color:${C.vault};">${esc(h2)}</span>`
  : ''}</p>
  <p style="margin:0;font-family:${BODY};font-size:13px;line-height:1.65;color:${C.mute};">${esc(subline)}</p>
<!--[if mso]></td><td width="252" valign="middle" style="width:252px;background-color:${C.parchment};"><![endif]-->
<!--[if !mso]><!--></td>
<td class="banner-scene" valign="middle"
  style="width:42%;background-color:${C.parchment};text-align:center;vertical-align:middle;padding:24px 16px;"><!--<![endif]-->
  <img src="${ea(MASCOT_URL)}" width="200" height="200" alt="FarmVault Companion"
    style="display:block;border:0;outline:none;margin:0 auto;width:200px;height:200px;object-fit:contain;" />
<!--[if mso]></td><![endif]-->
</tr>
</table>
</td></tr>`;
}

function leafRule(): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:18px 0;">
<tr>
<td style="width:60px;border-top:2px solid ${C.vault};" width="60"></td>
<td width="34" align="center" style="padding:0 8px;">
<svg width="18" height="14" viewBox="0 0 18 14" xmlns="http://www.w3.org/2000/svg" style="display:block;">
<path d="M2 7 C 2 3, 6 1, 9 1 C 12 1, 16 3, 16 7 C 13 7, 9 9, 9 13 C 9 9, 5 7, 2 7 Z" fill="${C.leaf}"/>
</svg>
</td>
<td style="border-top:2px solid ${C.vault};opacity:0.4;"></td>
</tr></table>`;
}

function ctaButton(label: string, href: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
<tr>
<td style="border-radius:999px;background:linear-gradient(180deg,${C.vault} 0%,${C.forest} 100%);
  background-color:${C.vault};box-shadow:0 8px 20px rgba(30,44,33,0.30);">
<a href="${ea(href)}" target="_blank" rel="noopener noreferrer"
  style="display:inline-block;padding:15px 38px;font-family:${BODY};font-size:15px;font-weight:700;
  color:#ffffff;text-decoration:none;border-radius:999px;line-height:1.2;letter-spacing:-0.005em;">
${esc(label)} &nbsp;→
</a>
</td>
</tr></table>`;
}

function footerRow(tagline: string): string {
  return `<tr>
<td style="padding:22px 32px 28px 32px;background-color:${C.parchmentWarm};font-family:${BODY};
  font-size:13px;line-height:1.65;color:${C.mute};text-align:center;border-top:1px solid ${C.line};">
<p style="margin:0 0 4px 0;font-family:${DISPLAY};font-size:15px;font-weight:700;color:${C.inkSoft};">
  Farm<span style="color:${C.harvestDeep};">Vault</span></p>
<p style="margin:0 0 3px 0;font-size:12px;color:${C.mute};">
  Smart Farm Management · Track Harvest · Labor · Expenses</p>
<p style="margin:8px 0 0 0;font-size:13px;font-style:italic;color:${C.inkSoft};">${esc(tagline)}</p>
</td>
</tr>`;
}

function contentShell(accentColor: string, bodyHtml: string, ctaLabel: string, ctaHref: string, closingLine: string): string {
  return `<tr>
<td style="padding:28px 36px 36px 36px;background-color:${C.parchment};font-family:${BODY};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td>${leafRule()}</td></tr>
<tr><td style="padding:20px 22px;background-color:${C.cream};border-left:4px solid ${accentColor};
  border-radius:0 12px 12px 0;font-size:17px;line-height:1.75;color:${C.inkSoft};">${bodyHtml}</td></tr>
<tr><td align="center" style="padding:26px 0 8px 0;text-align:center;">${ctaButton(ctaLabel, ctaHref)}</td></tr>
<tr><td style="padding:14px 0 4px 0;font-family:${BODY};font-size:13px;color:${C.mute};
  font-style:italic;text-align:center;">${esc(closingLine)}</td></tr>
</table>
</td>
</tr>`;
}

// ─── Inactivity theme ─────────────────────────────────────────────────────────

type InactivityTheme = {
  eyebrow: string; headline: string; subline: string;
  accentColor: string; ctaLabel: string;
  tagline: string;
};

function getInactivityTheme(tier: InactivityTier, farm: string): InactivityTheme {
  const themes: Record<InactivityTier, InactivityTheme> = {
    '2d': {
      eyebrow:     '◇ A QUIET CHECK-IN',
      headline:    `It's been\nquiet here, ${farm}.`,
      subline:     `${farm} is ready for you, whenever you are.`,
      accentColor: C.leaf,
      ctaLabel:    'Pick Up Where You Left Off',
      tagline:     "We're still here with you, always.",
    },
    '5d': {
      eyebrow:     '◇ YOUR FARM JOURNEY',
      headline:    `Your farm\nis still here, ${farm}.`,
      subline:     'FarmVault has been keeping watch.',
      accentColor: C.vaultSoft,
      ctaLabel:    'Return to FarmVault',
      tagline:     "We're still here with you, always.",
    },
    '7d': {
      eyebrow:     "◇ WE'VE BEEN THINKING",
      headline:    `We've been\nthinking about ${farm}.`,
      subline:     "A week passes quickly. Your records don't.",
      accentColor: C.harvest,
      ctaLabel:    'Come Back to FarmVault',
      tagline:     "We're still here with you, always.",
    },
    '14d': {
      eyebrow:     '◇ A MESSAGE FROM YOUR COMPANION',
      headline:    `We miss you,\n${farm}.`,
      subline:     'Your farm data is safe. Your journey is still here.',
      accentColor: C.harvestDeep,
      ctaLabel:    'Return to Your Farm',
      tagline:     "We're still here with you, always.",
    },
  };
  return themes[tier];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildCompanionMorningEmail(opts: {
  displayName?: string;
  farmName?:    string;
  messageText?: string;
  messageHtml?: string;
}): { html: string; subject: string } {
  const firstName = (opts.displayName?.trim() || 'Farmer').split(/[\s,]/)[0] || 'Farmer';
  const farm      = opts.farmName || 'your farm';
  const text      = opts.messageText || 'A new farming day begins. Check in on your crops, review any pending operations, and log today\'s progress in FarmVault.';
  const bodyHtml  = opts.messageHtml || paragraphsToHtml(text);

  const html = open(`A new farming day begins — ${farm} is ready for you.`, 'Your FarmVault Morning')
    + bannerPanel('◇ MORNING BRIEFING', `Good morning,\n${firstName}.`, `A new farming day begins — ${farm} is ready for you.`)
    + contentShell(C.harvest, bodyHtml, 'Open My Farm Dashboard', `${APP_URL}/home`, 'Your farming companion is always with you. 🌿')
    + footerRow('Every farming day brings new growth.')
    + close();

  return { html, subject: `☀️ Good morning, ${firstName}! Your farm is ready for you` };
}

export function buildCompanionEveningEmail(opts: {
  displayName?:    string;
  farmName?:       string;
  messageText?:    string;
  messageHtml?:    string;
  isWeeklySummary?: boolean;
}): { html: string; subject: string } {
  const firstName = (opts.displayName?.trim() || 'Farmer').split(/[\s,]/)[0] || 'Farmer';
  const farm      = opts.farmName || 'your farm';
  const isWeekly  = opts.isWeeklySummary ?? false;
  const text      = opts.messageText || 'Another farming day complete. Take a moment to log your progress.';
  const bodyHtml  = opts.messageHtml || paragraphsToHtml(text);

  const eyebrow  = isWeekly ? '◇ YOUR WEEK ON THE FARM'      : '◇ EVENING WRAP';
  const headline = isWeekly ? `Here's your\nfarm summary.`     : `Good evening,\n${firstName}.`;
  const subline  = isWeekly ? `Another week written into ${farm}'s story.` : `Another farming day complete — ${farm}, you showed up.`;
  const ctaLabel = isWeekly ? "See My Week's Summary"           : "Log Today's Work";
  const ctaHref  = isWeekly ? `${APP_URL}/home`                 : `${APP_URL}/farm-work`;

  const html = open(
    isWeekly ? `Here is a look back at ${farm} this week.` : `Another farming day complete — ${farm}, you showed up.`,
    isWeekly ? 'Your Weekly Farm Summary' : 'Your FarmVault Evening',
  )
    + bannerPanel(eyebrow, headline, subline)
    + contentShell(C.leaf, bodyHtml, ctaLabel, ctaHref, 'Rest well. Your farm story continues tomorrow. 🌾')
    + footerRow('Rest well. Your farm story continues tomorrow.')
    + close();

  return { html, subject: `🌙 Good evening, ${firstName} — how did the farm do today?` };
}

export function buildCompanionInactivityEmail(opts: {
  displayName?:  string;
  farmName?:     string;
  tier?:         InactivityTier;
  messageText?:  string;
  messageHtml?:  string;
}): { html: string; subject: string } {
  const farm      = opts.farmName || 'your farm';
  const tier      = opts.tier || '2d';
  const theme     = getInactivityTheme(tier, farm);
  const text      = opts.messageText || "It's been a couple of days since your last visit. Your records are safe and your workspace is exactly as you left it.";
  const bodyHtml  = opts.messageHtml || paragraphsToHtml(text);

  const subjects: Record<InactivityTier, string> = {
    '2d':  `🌿 ${farm} — a quick check-in from FarmVault`,
    '5d':  `🌿 ${farm}, your farm journey is still here`,
    '7d':  `🌿 We've been thinking about ${farm}`,
    '14d': `🌿 A message for ${farm} from FarmVault`,
  };

  const html = open(text.slice(0, 100), 'FarmVault Companion')
    + bannerPanel(theme.eyebrow, theme.headline, theme.subline)
    + contentShell(theme.accentColor, bodyHtml, theme.ctaLabel, `${APP_URL}/home`, 'FarmVault — your farming companion, always here. 🌾')
    + footerRow(theme.tagline)
    + close();

  return { html, subject: subjects[tier] };
}

export function buildCompanionWeeklySummaryEmail(opts: {
  displayName?:  string;
  farmName?:     string;
  messageText?:  string;
  messageHtml?:  string;
  weekStart?:    string;
  weekEnd?:      string;
}): { html: string; subject: string } {
  const firstName = (opts.displayName?.trim() || 'Farmer').split(/[\s,]/)[0] || 'Farmer';
  const farm      = opts.farmName || 'your farm';
  const weekStart = opts.weekStart || '';
  const weekEnd   = opts.weekEnd   || '';
  const text      = opts.messageText || 'Here is what your farm accomplished this week.';
  const bodyHtml  = opts.messageHtml || paragraphsToHtml(text);

  const eyebrow = weekStart && weekEnd
    ? `◇ WEEKLY SUMMARY · ${weekStart} — ${weekEnd}`
    : '◇ WEEKLY SUMMARY';

  const html = open(`Your FarmVault week: see what ${farm} accomplished.`, 'Your Weekly FarmVault Summary')
    + bannerPanel(eyebrow, `Here's your\nfarm summary.`, `Here is what ${farm} accomplished this week.`)
    + contentShell(C.vault, bodyHtml, 'View Full Dashboard', `${APP_URL}/home`, 'Keep growing. Your companion is always watching over your farm. 🌾')
    + footerRow('Your farm story, written week by week.')
    + close();

  return {
    html,
    subject: `📊 ${firstName}, your weekly farm summary is ready`,
  };
}
