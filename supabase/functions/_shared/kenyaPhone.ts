/** Normalize common Kenya phone inputs to 2547XXXXXXXX / 2541XXXXXXXX (12 digits total). */
export function normalizeKenyaPhoneTo254(input: string): string | null {
  let p = input.trim().replace(/\s+/g, "");
  if (!p) return null;

  if (p.startsWith("+")) p = p.slice(1);

  if (p.startsWith("07") || p.startsWith("01")) {
    p = "254" + p.slice(1);
  }

  const digits = p.replace(/\D/g, "");

  if (digits.startsWith("254")) {
    const rest = digits.slice(3);
    if (rest.length >= 9 && (rest.startsWith("7") || rest.startsWith("1"))) {
      return `254${rest.slice(0, 9)}`;
    }
    return null;
  }

  if (digits.length === 9 && (digits.startsWith("7") || digits.startsWith("1"))) {
    return `254${digits}`;
  }

  return null;
}
