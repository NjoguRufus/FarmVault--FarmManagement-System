/**
 * FarmVault Companion Email — async build pipeline.
 *
 * Each function compiles a React Email component to final email-safe HTML using
 * @react-email/render.  The Developer preview and the test-send path both call
 * these functions so preview === sent email (byte-identical HTML).
 *
 * The Deno edge function (engagement-email-cron) uses companionEmailTemplates.ts
 * on the server side — keep those in sync when changing the visual design here.
 */

import { createElement } from 'react';
import { render } from '@react-email/render';
import { MorningCompanionEmail }    from './MorningCompanionEmail';
import { EveningReflectionEmail }   from './EveningReflectionEmail';
import { InactivityCompanionEmail } from './InactivityCompanionEmail';
import { WeeklySummaryEmail }       from './WeeklySummaryEmail';

export type InactivityTier = '2d' | '5d' | '7d' | '14d';

// ─── Utility: kept for edge-function metadata (Deno-side rendering) ───────────

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Splits plain message text on blank lines and returns email-safe HTML.
 * First paragraph (salutation) is bold; subsequent paragraphs are normal weight.
 * Used by the edge function metadata and test-send handlers.
 */
export function paragraphsToHtml(text: string): string {
  const paras = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  if (paras.length === 0) return '';
  const [first, ...rest] = paras;
  const firstHtml = `<p style="margin:0 0 16px 0;font-family:'Inter',Arial,Helvetica,sans-serif;font-size:17px;font-weight:600;line-height:1.65;color:#1c2820;white-space:pre-line;">${escHtml(first)}</p>`;
  const restHtml  = rest.map(p => `<p style="margin:0 0 16px 0;font-family:'Inter',Arial,Helvetica,sans-serif;font-size:16px;line-height:1.85;color:#2f3d30;white-space:pre-line;">${escHtml(p)}</p>`).join('');
  return firstHtml + restHtml;
}

// ─── Build functions ──────────────────────────────────────────────────────────

export async function buildCompanionMorningEmail(opts: {
  displayName?: string;
  farmName?:    string;
  messageText?: string;
}): Promise<{ html: string; subject: string }> {
  const firstName = (opts.displayName?.trim() || 'Farmer').split(/[\s,]/)[0] || 'Farmer';
  const html = await render(createElement(MorningCompanionEmail, opts));
  return { html, subject: `☀️ Good morning, ${firstName}! Your farm is ready for you` };
}

export async function buildCompanionEveningEmail(opts: {
  displayName?:    string;
  farmName?:       string;
  messageText?:    string;
  isWeeklySummary?: boolean;
}): Promise<{ html: string; subject: string }> {
  const firstName = (opts.displayName?.trim() || 'Farmer').split(/[\s,]/)[0] || 'Farmer';
  const html = await render(createElement(EveningReflectionEmail, opts));
  const subject = opts.isWeeklySummary
    ? `📊 ${firstName}, your weekly farm summary is ready`
    : `🌙 Good evening, ${firstName} — how did the farm do today?`;
  return { html, subject };
}

export async function buildCompanionInactivityEmail(opts: {
  displayName?:  string;
  farmName?:     string;
  tier?:         InactivityTier;
  messageText?:  string;
}): Promise<{ html: string; subject: string }> {
  const farm = opts.farmName || 'your farm';
  const tier = opts.tier || '2d';
  const subjects: Record<InactivityTier, string> = {
    '2d':  `🌿 ${farm} — a quick check-in from FarmVault`,
    '5d':  `🌿 ${farm}, your farm journey is still here`,
    '7d':  `🌿 We've been thinking about ${farm}`,
    '14d': `🌿 A message for ${farm} from FarmVault`,
  };
  const html = await render(createElement(InactivityCompanionEmail, opts));
  return { html, subject: subjects[tier] };
}

export async function buildCompanionWeeklySummaryEmail(opts: {
  displayName?:  string;
  farmName?:     string;
  messageText?:  string;
  weekStart?:    string;
  weekEnd?:      string;
}): Promise<{ html: string; subject: string }> {
  const firstName = (opts.displayName?.trim() || 'Farmer').split(/[\s,]/)[0] || 'Farmer';
  const html = await render(createElement(WeeklySummaryEmail, opts));
  return { html, subject: `📊 ${firstName}, your weekly farm summary is ready` };
}
