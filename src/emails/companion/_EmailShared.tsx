/**
 * Internal email building blocks — premium editorial companion email system.
 * Each template is fully self-contained and composes these primitives.
 *
 * Design direction: cinematic · editorial · luxurious · emotionally intelligent
 * Reference: Apple onboarding / Notion editorial / premium luxury newsletters
 */

import { Html, Head, Body, Preview } from '@react-email/components';
import { C, LOGO_URL, MASCOT_URL, DISPLAY, BODY, MONO, FONT_IMPORT } from './tokens';

// ─── Typography ───────────────────────────────────────────────────────────────

export function BodyParagraphs({ text }: { text: string }) {
  const paras = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  if (!paras.length) return null;
  const [first, ...rest] = paras;
  return (
    <>
      <p style={{ margin: '0 0 16px 0', fontFamily: BODY, fontSize: 17, fontWeight: 600, lineHeight: 1.65, color: C.ink, whiteSpace: 'pre-line' }}>
        {first}
      </p>
      {rest.map((p, i) => (
        <p key={i} style={{ margin: '0 0 16px 0', fontFamily: BODY, fontSize: 16, lineHeight: 1.85, color: C.inkSoft, whiteSpace: 'pre-line' }}>
          {p}
        </p>
      ))}
    </>
  );
}

// ─── Email shell ─────────────────────────────────────────────────────────────

const RESPONSIVE_CSS = `${FONT_IMPORT}
@media only screen and (max-width:600px){
  .banner-left{padding:24px 10px 28px 18px!important;}
  .banner-scene{padding:0 8px 0 0!important;}
  .mascot-img{width:150px!important;height:150px!important;}
  .headline{font-size:24px!important;line-height:1.12!important;}
}`;

export function EmailShell({ preheader, title, children }: {
  preheader: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Html lang="en">
      <Head>
        <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="light" />
        <title>{title}</title>
        <style dangerouslySetInnerHTML={{ __html: RESPONSIVE_CSS }} />
      </Head>
      <Preview>{preheader}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: C.forestMid }}>
        <table role="presentation" width="100%" cellSpacing={0} cellPadding={0} border={0} style={{ backgroundColor: C.forestMid }}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: '28px 16px 44px 16px' }}>
                <table role="presentation" width={600} cellSpacing={0} cellPadding={0} border={0}
                  style={{ maxWidth: 600, borderRadius: 20, overflow: 'hidden', backgroundColor: C.parchment }}>
                  <tbody>
                    {children}
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </Body>
    </Html>
  );
}

// ─── Hero banner — split dark/cream editorial composition ─────────────────────

export function BannerPanel({ headlineL1, headlineL2, headlineL2Color = C.harvest, subline }: {
  headlineL1: string;
  headlineL2: string;
  headlineL2Color?: string;
  subline?: string;
}) {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <tr>
      <td style={{ padding: 0, borderBottom: `3px solid ${C.harvest}` }}>
        <table role="presentation" width="100%" cellSpacing={0} cellPadding={0} border={0}>
          <tbody>
            <tr>
              {/* Left: dark forest gradient — logo + greeting + date */}
              <td className="banner-left" valign="top"
                style={{
                  width: '56%',
                  background: `linear-gradient(150deg, ${C.forestDeep} 0%, ${C.forest} 100%)`,
                  padding: '52px 24px 56px 36px',
                  verticalAlign: 'top',
                }}>
                {/* Logo — dark mode version on forest green */}
                <table role="presentation" cellSpacing={0} cellPadding={0} border={0} style={{ margin: '0 0 32px 0' }}>
                  <tbody><tr><td>
                    <img src={LOGO_URL} width={110} height={26} alt="FarmVault"
                      style={{ display: 'block', border: 0, outline: 'none', height: 26, width: 'auto' }} />
                  </td></tr></tbody>
                </table>
                {/* Greeting */}
                <p style={{
                  margin: '0 0 12px 0',
                  fontFamily: DISPLAY,
                  fontSize: 46,
                  fontWeight: 700,
                  color: C.cream,
                  lineHeight: 1.06,
                  letterSpacing: '-0.03em',
                  wordBreak: 'break-word',
                }}>
                  {headlineL1}<br />
                  <span style={{ color: headlineL2Color }}>{headlineL2}</span>
                </p>
                {/* Date chip */}
                <p style={{
                  margin: subline ? '0 0 14px 0' : 0,
                  fontFamily: BODY,
                  fontSize: 11,
                  color: 'rgba(253,252,248,0.48)',
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                }}>
                  {today}
                </p>
                {/* Optional subline */}
                {subline && (
                  <p style={{
                    margin: 0,
                    fontFamily: BODY,
                    fontSize: 13,
                    lineHeight: 1.65,
                    color: 'rgba(253,252,248,0.68)',
                  }}>
                    {subline}
                  </p>
                )}
              </td>

              {/* Right: cream panel — mascot sits flush at bottom */}
              <td className="banner-scene" valign="bottom"
                style={{
                  width: '44%',
                  backgroundColor: C.parchment,
                  textAlign: 'center',
                  verticalAlign: 'bottom',
                  padding: '0 4px',
                  lineHeight: 0,
                }}>
                <img src={MASCOT_URL} width={260} height={260} alt="FarmVault Companion" className="mascot-img"
                  style={{ display: 'block', border: 0, outline: 'none', margin: '0 auto', width: 260, height: 260, objectFit: 'contain' }} />
              </td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  );
}

// ─── Content shell: clean editorial body + CTA + closing ─────────────────────

export function ContentShell({ messageText, ctaLabel, ctaHref, closingLine }: {
  messageText: string;
  ctaLabel:    string;
  ctaHref:     string;
  closingLine: string;
}) {
  return (
    <tr>
      <td style={{ padding: '44px 40px 48px', backgroundColor: C.parchment }}>
        {/* Message — breathes cleanly on parchment */}
        <BodyParagraphs text={messageText} />
        {/* CTA — compact premium pill */}
        <table role="presentation" cellSpacing={0} cellPadding={0} border={0} align="center" style={{ margin: '34px auto 0' }}>
          <tbody>
            <tr>
              <td style={{
                borderRadius: 999,
                backgroundColor: C.forestDeep,
                boxShadow: '0 6px 20px rgba(30,44,33,0.28)',
              }}>
                <a href={ctaHref} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'inline-block',
                    padding: '13px 32px',
                    fontFamily: BODY,
                    fontSize: 14,
                    fontWeight: 600,
                    color: C.cream,
                    textDecoration: 'none',
                    borderRadius: 999,
                    letterSpacing: '-0.005em',
                    lineHeight: 1.3,
                  }}>
                  {ctaLabel}
                </a>
              </td>
            </tr>
          </tbody>
        </table>
        {/* Closing line */}
        <p style={{
          margin: '24px 0 0 0',
          fontFamily: BODY,
          fontSize: 12,
          color: C.mute,
          fontStyle: 'italic',
          textAlign: 'center',
          lineHeight: 1.6,
        }}>
          {closingLine}
        </p>
      </td>
    </tr>
  );
}

// ─── Footer — dark forest, minimal, elegant ───────────────────────────────────

export function EmailFooter({ tagline }: { tagline: string }) {
  return (
    <tr>
      <td style={{
        padding: '26px 40px 30px',
        backgroundColor: C.forestDeep,
        textAlign: 'center',
        fontFamily: BODY,
      }}>
        <p style={{
          margin: '0 0 7px 0',
          fontFamily: DISPLAY,
          fontSize: 16,
          fontWeight: 700,
          color: C.cream,
          letterSpacing: '-0.015em',
        }}>
          Farm<span style={{ color: C.harvest }}>Vault</span>
        </p>
        <p style={{
          margin: 0,
          fontSize: 11,
          color: 'rgba(253,252,248,0.42)',
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
        }}>
          {tagline}
        </p>
      </td>
    </tr>
  );
}
