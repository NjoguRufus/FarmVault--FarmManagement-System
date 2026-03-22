/**
 * HTTPS URL to the company dashboard, for links in transactional emails.
 * Prefer a fixed production URL via env when the developer console runs on another origin.
 */
export function getTenantDashboardUrl(): string {
  const raw =
    (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim() ||
    (import.meta.env.VITE_APP_BASE_URL as string | undefined)?.trim();
  const base = raw ? raw.replace(/\/$/, '') : '';
  if (base) {
    try {
      const u = new URL(base);
      if (u.protocol === 'https:') return `${base}/dashboard`;
    } catch {
      /* ignore */
    }
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    const o = window.location.origin.replace(/\/$/, '');
    try {
      const u = new URL(o);
      if (u.protocol === 'https:') return `${o}/dashboard`;
    } catch {
      /* ignore */
    }
  }
  return 'https://app.farmvault.africa/dashboard';
}
