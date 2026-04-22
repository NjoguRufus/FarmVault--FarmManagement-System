/** Parse workers/people count from a numeric input shown as string (allows empty while typing). */
export function workersCountFromInput(s: string): number {
  const n = parseInt(String(s).trim(), 10);
  return Number.isFinite(n) ? n : 0;
}
