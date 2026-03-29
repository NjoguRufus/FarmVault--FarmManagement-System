/** Trim + lowercase for stable platform email comparisons (Clerk + Supabase). */
export function normalizeAuthEmail(email: string | null | undefined): string {
  return String(email ?? '')
    .trim()
    .toLowerCase();
}
