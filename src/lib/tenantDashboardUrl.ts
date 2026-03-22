/**
 * HTTPS (or local http) URL to the company dashboard for email links and dev tools.
 *
 * Resolution order:
 * 1. Current browser origin — same app in dev (localhost) and production (your real domain); no .env swap.
 * 2. VITE_PUBLIC_APP_URL / VITE_APP_BASE_URL — only when the UI runs on a different host than the tenant app.
 * 3. Sensible default if nothing applies (e.g. non-browser).
 */
function originToDashboardBase(origin: string): string | null {
  const o = origin.replace(/\/$/, '');
  try {
    const u = new URL(o);
    if (u.protocol === 'https:') return o;
    if (u.protocol === 'http:') {
      if (import.meta.env.DEV) return o;
      const h = u.hostname.toLowerCase();
      if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return o;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function envTenantBase(): string | null {
  const raw =
    (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim() ||
    (import.meta.env.VITE_APP_BASE_URL as string | undefined)?.trim();
  const base = raw ? raw.replace(/\/$/, '') : '';
  if (!base) return null;
  try {
    const u = new URL(base);
    if (u.protocol === 'https:') return base;
    if (u.protocol === 'http:') {
      if (import.meta.env.DEV) return base;
      const h = u.hostname.toLowerCase();
      if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return base;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function getTenantDashboardUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const fromPage = originToDashboardBase(window.location.origin);
    if (fromPage) return `${fromPage}/dashboard`;
  }

  const fromEnv = envTenantBase();
  if (fromEnv) return `${fromEnv}/dashboard`;

  return 'https://app.farmvault.africa/dashboard';
}
