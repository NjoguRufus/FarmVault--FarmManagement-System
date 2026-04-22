/** Parse a positive finite number; returns NaN if empty or invalid. */
export function parsePositiveNumber(raw: string): number {
  const t = String(raw).replace(/,/g, '').trim();
  if (t === '') return NaN;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
}

export function isValidPositive(raw: string): boolean {
  const n = parsePositiveNumber(raw);
  return Number.isFinite(n) && n > 0;
}

/** Zero allowed; negative and non-finite rejected. */
export function parseNonNegativeNumber(raw: string): number {
  const t = String(raw).replace(/,/g, '').trim();
  if (t === '') return NaN;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
}

export function isValidNonNegativeInput(raw: string): boolean {
  const t = String(raw).trim();
  if (!t) return true;
  return Number.isFinite(parseNonNegativeNumber(t));
}
