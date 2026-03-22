import { escapeHtml } from "./escapeHtml.ts";
import { FARMVAULT_EMAIL_HEADER_LOGO_ROW } from "./emailHeaderLogoRow.ts";

/** Same asset as header row (for callers that need the URL only). */
export const FARMVAULT_EMAIL_LOGO_URL =
  "https://farmvault.africa/Logo/FarmVault_Logo%20dark%20mode.png";

export type FarmVaultEmailQrShare = {
  /** Public HTTPS URL for the QR image (must be safe to embed in email). */
  imageUrl: string;
  /** URL the QR encodes; image and buttons link here. */
  targetUrl: string;
};

export type FarmVaultEmailShellOptions = {
  /** Inbox preview line (hidden in body). */
  preheader: string;
  /** Primary headline below the logo (light header). */
  title: string;
  /** Supporting line under the title. */
  subtitle: string;
  /** Main body HTML; escape user-controlled values before interpolating. */
  content: string;
  /** Primary action (optional). */
  cta?: { label: string; href: string };
  /**
   * Optional share block: copy + wrapped QR image (links to targetUrl) + button + plain link.
   * Rendered after main content and CTA, before the divider and support/footer sections.
   */
  qrShare?: FarmVaultEmailQrShare | null;
  /**
   * When true (default), shows WhatsApp and phone support above the standard footer block.
   * Footer copy and structure below this section are unchanged.
   */
  includeContactSupport?: boolean;
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

const SUPPORT_WHATSAPP_HREF = "https://wa.me/254714456167";
const SUPPORT_CALL_HREF = "tel:+254714456167";

function contactSupportBlock(font: string): string {
  const wa = escapeAttr(SUPPORT_WHATSAPP_HREF);
  const tel = escapeAttr(SUPPORT_CALL_HREF);
  const waGreen = "#25D366";
  return `
                <tr>
                  <td style="padding:28px 40px 32px 40px;background-color:${BRAND.white};font-family:${font};font-size:15px;line-height:1.65;color:${BRAND.text};text-align:center;">
                    <p style="margin:0 0 20px 0;padding:0;font-size:15px;line-height:1.65;color:${BRAND.text};">
                      Feel free to reach out to our team for any assistance.
                    </p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;max-width:420px;">
                      <tr>
                        <td align="center" valign="middle" width="50%" style="padding:6px 8px 8px 8px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">
                            <tr>
                              <td align="center" bgcolor="${waGreen}" style="background-color:${waGreen};border-radius:10px;">
                                <a href="${wa}" target="_blank" rel="noopener noreferrer"
                                  style="display:inline-block;padding:12px 22px;font-family:${font};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;mso-line-height-rule:exactly;line-height:1.2;">
                                  WhatsApp us
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                        <td align="center" valign="middle" width="50%" style="padding:6px 8px 8px 8px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">
                            <tr>
                              <td align="center" style="border:1px solid ${BRAND.border};border-radius:10px;background-color:${BRAND.white};">
                                <a href="${tel}" style="display:inline-block;padding:12px 22px;font-family:${font};font-size:14px;font-weight:700;color:${BRAND.primary};text-decoration:none;border-radius:10px;mso-line-height-rule:exactly;line-height:1.2;">
                                  Call us
                                </a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`;
}

const QR_SHARE_COPY =
  "Know another farmer who may need this? Let them scan the QR code below or visit farmvault.africa.";

function qrShareSectionHtml(
  imageUrl: string,
  targetUrl: string,
  font: string,
): string {
  const img = escapeAttr(imageUrl);
  const tgt = escapeAttr(targetUrl);
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0;">
  <tr>
    <td align="center" style="padding:28px 0 0 0;font-family:${font};">
      <p style="margin:0 0 16px 0;padding:0 12px;font-size:14px;line-height:1.6;color:${BRAND.muted};text-align:center;max-width:440px;">
        ${escapeHtml(QR_SHARE_COPY)}
      </p>
      <a href="${tgt}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-block;">
        <img src="${img}" width="180" height="180" alt="QR code linking to farmvault.africa for sharing" border="0"
          style="display:block;margin:0 auto;border:0;outline:none;width:180px;height:180px;line-height:0;" />
      </a>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:14px auto 0 auto;">
        <tr>
          <td align="center" bgcolor="${BRAND.primary}" style="background-color:${BRAND.primary};border-radius:8px;">
            <a href="${tgt}" target="_blank" rel="noopener noreferrer"
              style="display:inline-block;padding:10px 22px;font-family:${font};font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;mso-line-height-rule:exactly;line-height:1.2;">
              Open FarmVault
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:12px 0 0 0;padding:0 12px;font-size:12px;line-height:1.5;color:${BRAND.muted};text-align:center;word-break:break-all;">
        <a href="${tgt}" target="_blank" rel="noopener noreferrer" style="color:${BRAND.primary};text-decoration:underline;">
          ${escapeHtml(targetUrl)}
        </a>
      </p>
    </td>
  </tr>
</table>`;
}

/**
 * Full HTML document for FarmVault transactional email.
 * Tables + inline styles only. Light header (logo + title) so the official logo reads clearly.
 */
export function farmVaultEmailShell(opts: FarmVaultEmailShellOptions): string {
  const { preheader, title, subtitle, content, cta, qrShare, includeContactSupport = true } = opts;
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

  const qrBlock =
    qrShare &&
    qrShare.imageUrl.trim().length > 0 &&
    qrShare.targetUrl.trim().length > 0
      ? qrShareSectionHtml(qrShare.imageUrl.trim(), qrShare.targetUrl.trim(), fontStack)
      : "";

  const supportBlock = includeContactSupport ? contactSupportBlock(fontStack) : "";

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
                ${FARMVAULT_EMAIL_HEADER_LOGO_ROW}
                <tr>
                  <td align="center" style="padding:0 40px 28px 40px;background-color:${BRAND.white};">
                    <h1 style="margin:0;padding:0;font-family:${fontStack};font-size:28px;line-height:1.25;font-weight:700;color:${BRAND.primary};letter-spacing:-0.02em;">
                      ${safeTitle}
                    </h1>
                    <p style="margin:12px 0 0 0;padding:0;font-family:${fontStack};font-size:15px;line-height:1.55;font-weight:400;color:${BRAND.muted};">
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
                    ${qrBlock}
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
                ${supportBlock}
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
