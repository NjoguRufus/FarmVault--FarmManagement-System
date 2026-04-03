/** Normalize common Kenya phone inputs to 2547XXXXXXXX (12 digits after 254). */
export function normalizeKenyaPhoneTo254(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("254")) {
    const rest = digits.slice(3);
    if (rest.length === 9 && rest.startsWith("7")) return `254${rest}`;
    if (rest.length >= 9 && rest.startsWith("7")) return `254${rest.slice(0, 9)}`;
    return null;
  }

  if (digits.startsWith("0") && digits.length >= 10) {
    const rest = digits.slice(1);
    if (rest.startsWith("7") && rest.length >= 9) return `254${rest.slice(0, 9)}`;
    return null;
  }

  if (digits.length === 9 && digits.startsWith("7")) {
    return `254${digits}`;
  }

  return null;
}
