/**
 * Shared route classifiers for:
 * - domain routing guard (public vs app hosts)
 * - last-route persistence (only persist true in-app routes)
 *
 * Keep these prefix lists stable to avoid fragile per-route enumerations.
 */

export function isAppRoutePath(pathname: string): boolean {
  const p = pathname || '/';
  const prefixes = [
    '/sign-in',
    '/sign-up',
    '/auth',
    '/onboarding',
    '/pending-approval',
    '/start-fresh',
    '/home',
    '/dashboard',
    '/app',
    '/broker',
    '/projects',
    '/expenses',
    '/farm-work',
    '/operations',
    '/inventory',
    '/harvest',
    '/harvest-sales',
    '/harvest-collections',
    '/suppliers',
    '/challenges',
    '/employees',
    '/reports',
    '/billing',
    '/settings',
    '/notes',
    '/records',
    '/more',
    '/staff',
    '/developer',
    '/admin',
    '/dev',
    '/emergency-access',
    '/accept-invitation',
  ];
  return prefixes.some((x) => p === x || p.startsWith(`${x}/`));
}

export function isPublicRoutePath(pathname: string): boolean {
  const p = pathname || '/';
  // Referral short links: /r/CODE (must not use prefix "/r" — would match /register, etc.)
  if (p === '/r' || p.startsWith('/r/')) return true;
  // In-app Farm Work (shares /farm-* with marketing SEO URLs like /farm-management-…).
  if (p === '/farm-work' || p.startsWith('/farm-work/')) return false;
  const prefixes = [
    '/',
    '/features',
    '/pricing',
    '/about',
    '/blog',
    '/farm-',
    '/crop-',
    '/tomato-',
    '/maize-',
    '/rice-',
    '/french-',
    '/capsicum-',
    '/watermelon-',
    '/scan',
  ];
  if (p === '/') return true;
  return prefixes.some((x) => x !== '/' && p.startsWith(x));
}

export function pathnameFromFullPath(fullPath: string): string {
  const raw = String(fullPath || '').trim();
  if (!raw) return '/';
  // fullPath is expected to be "/path?x#y" (no origin)
  const pathOnly = raw.startsWith('/') ? raw : `/${raw}`;
  const stop = Math.min(
    ...['?', '#']
      .map((c) => pathOnly.indexOf(c))
      .filter((i) => i >= 0),
    pathOnly.length,
  );
  return pathOnly.slice(0, stop) || '/';
}

