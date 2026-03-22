/**
 * Central helpers for post-authentication redirects (intended route + validation).
 */

export const AUTH_INTENDED_ROUTE_KEY = 'farmvault:auth-intended:v1';

const BLOCKED_PREFIXES = [
  '/sign-in',
  '/sign-up',
  '/login',
  '/signup',
  '/emergency-access',
  '/accept-invitation',
  '/auth/callback',
  '/auth/continue',
  '/dev/sign-in',
  '/dev/sign-up',
] as const;

/**
 * Persist the path the user tried to open before we sent them to sign-in.
 * Full path should include pathname + search + hash when relevant.
 */
export function persistIntendedRoute(fullPath: string): void {
  const trimmed = String(fullPath || '').trim();
  if (!trimmed || !isSafeAppRedirect(trimmed)) return;
  try {
    window.sessionStorage.setItem(AUTH_INTENDED_ROUTE_KEY, trimmed);
  } catch {
    // ignore
  }
}

export function readIntendedRouteFromStorage(): string | null {
  try {
    const v = window.sessionStorage.getItem(AUTH_INTENDED_ROUTE_KEY);
    return v && isSafeAppRedirect(v) ? v : null;
  } catch {
    return null;
  }
}

export function clearIntendedRouteStorage(): void {
  try {
    window.sessionStorage.removeItem(AUTH_INTENDED_ROUTE_KEY);
  } catch {
    // ignore
  }
}

function pathFromLocationState(from: unknown): string | null {
  if (!from || typeof from !== 'object') return null;
  const o = from as { pathname?: string; search?: string; hash?: string };
  if (!o.pathname || typeof o.pathname !== 'string') return null;
  return `${o.pathname}${o.search ?? ''}${o.hash ?? ''}`;
}

/**
 * Prefer React Router `location.state.from` (SPA), then sessionStorage (OAuth / full reload).
 */
export function pickIntendedRoute(fromState: unknown, stored: string | null): string | null {
  const fromRouter = pathFromLocationState(fromState);
  if (fromRouter && isSafeAppRedirect(fromRouter)) return fromRouter;
  if (stored && isSafeAppRedirect(stored)) return stored;
  return null;
}

/**
 * True if `path` is a same-origin app path we allow as a post-auth deep link.
 */
export function isSafeAppRedirect(path: string): boolean {
  const p = String(path || '').trim();
  if (!p.startsWith('/') || p.startsWith('//')) return false;
  if (p === '/') return false;
  const lower = p.toLowerCase();
  for (const prefix of BLOCKED_PREFIXES) {
    if (lower === prefix || lower.startsWith(`${prefix}/`) || lower.startsWith(`${prefix}?`)) {
      return false;
    }
  }
  return true;
}
