/**
 * Convert a number into an ordinal string: 1 -> 1st, 2 -> 2nd, 3 -> 3rd, 11 -> 11th, etc.
 */
export function toOrdinal(value: number): string {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return '';

  const abs = Math.abs(n);
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;

  switch (abs % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

