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

const SMS_NOISE = /^(confirmed|mpesa|ksh|bal|balance|new|safaricom|fuliza|lipa)$/i;

/**
 * Best-effort payer / counterparty name from a pasted M-Pesa SMS (Safaricom-style).
 * Fills the "Name on M-Pesa" field when the user pastes a full message.
 */
export function extractMpesaNameFromPastedMessage(raw: string): string {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const tryCapture = (re: RegExp): string => {
    const m = normalized.match(re);
    if (!m?.[1]) return '';
    const name = m[1].replace(/\s+/g, ' ').trim();
    if (name.length < 2) return '';
    const firstWord = name.split(/\s/)[0] ?? '';
    if (SMS_NOISE.test(firstWord)) return '';
    return name;
  };

  return (
    tryCapture(
      /\b(?:from|received from)\s+([A-Za-z][A-Za-z0-9\s.'-]{1,48}?)(?=\s+on\s+\d|\s+on\s+[A-Z]{3}|\.\s|$|,|\s+Balance|\s+NEW\s+M-PESA|$)/i,
    ) ||
    tryCapture(/\bpaid\s+to\s+([A-Za-z][A-Za-z0-9\s.'-]{1,48}?)\s+from\b/i) ||
    ''
  );
}
