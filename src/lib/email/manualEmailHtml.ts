/**
 * Converts plain-text manual email body into safe HTML paragraphs (matches Edge `customManualTemplate` `bodyToHtml`).
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT_STACK = 'Arial, Helvetica, sans-serif';

export function manualPlainTextToEmailContentHtml(plain: string): string {
  const blocks = plain.trim().split(/\n{2,}/);
  return blocks
    .map((block) => {
      const inner = block
        .split('\n')
        .map((line) => escapeHtml(line))
        .join('<br />');
      return `<p style="margin:0 0 14px 0;font-family:${FONT_STACK};font-size:15px;line-height:1.7;color:#1f2937;">${inner}</p>`;
    })
    .join('');
}
