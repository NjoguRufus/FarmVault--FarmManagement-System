/**
 * M-Pesa confirmation codes are 10 alphanumeric characters.
 * From pasted SMS/plain text: find the first run of exactly 10 letters/digits,
 * take those 10 only and ignore the rest. Prefers a token that includes a digit
 * (typical receipt IDs) when several exist.
 */
export function extractMpesaCodeFromPastedMessage(raw: string): string {
  const s = raw.trim();
  if (!s) return '';

  const tokens = s.match(/[A-Za-z0-9]{10}/g);
  if (tokens?.length) {
    // Avoid bare 10-digit phone fragments: prefer typical receipt IDs (letters + digits).
    const letterAndDigit = tokens.find((m) => /[A-Za-z]/.test(m) && /\d/.test(m));
    if (letterAndDigit) return letterAndDigit.toUpperCase();
    return tokens[0].toUpperCase();
  }

  let out = '';
  for (const ch of s) {
    if (/[A-Za-z0-9]/.test(ch)) {
      out += ch;
      if (out.length >= 10) break;
    }
  }
  return out.toUpperCase();
}
