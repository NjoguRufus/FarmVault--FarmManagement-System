import { escapeHtml } from "./escapeHtml.ts";

/** Light logo for email clients (hosted app asset). */
export const FARMVAULT_EMAIL_LOGO_URL =
  "https://app.farmvault.africa/logo/FarmVault.png";

export type FarmVaultEmailShellOptions = {
  /** Inbox preview line (hidden in body). */
  preheader: string;
  /** Primary headline in the gradient header (white). */
  title: string;
  /** Supporting line under the title in the header (soft contrast on green). */
  subtitle: string;
  /** Main body HTML; escape user-controlled values before interpolating. */
  content: string;
  /** Primary action (optional). */
  cta?: { label: string; href: string };
};

const BRAND = {
  primary: "#1f6f43",
  accent: "#2d8a57",
  gold: "#c8a24d",
  text: "#1f2937",
  muted: "#6b7280",
  bg: "#f6f8f6",
  softBg: "#f8fbf8",
  white: "#ffffff",
  border: "#e5ebe7",
} as const;

const fontStack = "Arial, Helvetica, sans-serif";

/**
 * Full HTML document for FarmVault transactional email.
 * Tables + inline styles only (no flex/grid/classes). Gradient degrades to solid green where unsupported.
 */
export function farmVaultEmailShell(opts: FarmVaultEmailShellOptions): string {
  const { preheader, title, subtitle, content, cta } = opts;
  const safePre = escapeHtml(preheader);
  const safeTitle = escapeHtml(title);
  const safeSubtitle = escapeHtml(subtitle);

  const ctaBlock = cta
    ? `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;">
  <tr>
    <td align="center" style="padding:36px 0 8px 0;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td align="center" bgcolor="${BRAND.primary}" style="background-color:${BRAND.primary};border-radius:10px;">
            <a href="${escapeAttr(cta.href)}" target="_blank" rel="noopener noreferrer"
              style="display:inline-block;padding:14px 24px;font-family:${fontStack};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">
              ${escapeHtml(cta.label)}
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${safeTitle}</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bg};">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${safePre}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${BRAND.bg};">
    <tr>
      <td align="center" style="padding:36px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;border-collapse:separate;">
          <tr>
            <td style="background-color:${BRAND.white};border-radius:18px;overflow:hidden;border:1px solid ${BRAND.border};box-shadow:0 4px 24px rgba(31, 111, 67, 0.08);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="padding:40px 40px 28px 40px;background-color:${BRAND.primary};background-image:linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.accent} 100%);">
                    <img src="${FARMVAULT_EMAIL_LOGO_URL}" width="140" alt="FarmVault" border="0"
                      style="display:block;width:140px;max-width:140px;height:auto;margin:0 auto 16px auto;border:0;outline:none;text-decoration:none;" />
                    <h1 style="margin:0;padding:0;font-family:${fontStack};font-size:28px;line-height:1.25;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">
                      ${safeTitle}
                    </h1>
                    <p style="margin:12px 0 0 0;padding:0;font-family:${fontStack};font-size:15px;line-height:1.55;font-weight:400;color:#e3f2e9;">
                      ${safeSubtitle}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="height:4px;line-height:4px;font-size:0;background-color:${BRAND.gold};">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:36px 40px 28px 40px;background-color:${BRAND.white};font-family:${fontStack};font-size:15px;line-height:1.7;color:${BRAND.text};">
                    ${content}
                    ${ctaBlock}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 40px 0 40px;background-color:${BRAND.white};">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="border-top:1px solid ${BRAND.border};font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 40px 36px 40px;background-color:${BRAND.softBg};font-family:${fontStack};font-size:13px;line-height:1.65;color:${BRAND.muted};text-align:center;">
                    <p style="margin:0 0 6px 0;font-size:14px;font-weight:700;color:${BRAND.text};">FarmVault</p>
                    <p style="margin:0 0 14px 0;">Smart Farm Management Platform</p>
                    <p style="margin:0 0 14px 0;letter-spacing:0.02em;">Track Harvest &#8226; Labor &#8226; Expenses</p>
                    <p style="margin:0;font-size:12px;color:${BRAND.muted};">Built from real farm experience</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;">
          <tr>
            <td style="padding:24px 8px 0 8px;font-family:${fontStack};font-size:12px;line-height:1.55;color:${BRAND.muted};text-align:center;">
              You are receiving this message because of activity on your FarmVault account.<br />
              <span style="color:${BRAND.accent};">farmvault.africa</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeAttr(href: string): string {
  return href.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
