import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  buildUrl,
  getAppBaseUrl,
  isAppProductionHost,
  isLocalhostHost,
  isProdLike,
  isPublicProductionHost,
} from '@/lib/urls/domains';
import { isAppRoutePath, isPublicRoutePath } from '@/lib/routing/domainRoutes';

function fullPathFromLocation(loc: { pathname: string; search: string; hash: string }): string {
  return `${loc.pathname}${loc.search}${loc.hash}`;
}

/**
 * Domain routing guard (production only):
 * - `farmvault.africa` should be marketing only → bounce app routes to `app.farmvault.africa`
 * - `app.farmvault.africa` should be app only → bounce marketing routes to `farmvault.africa`
 *
 * Never runs on localhost/dev.
 */
export function DomainGuard() {
  const loc = useLocation();

  useEffect(() => {
    if (!isProdLike()) return;
    if (typeof window === 'undefined') return;
    if (isLocalhostHost()) return;

    const fullPath = fullPathFromLocation(loc);
    const pathname = loc.pathname || '/';

    if (isPublicProductionHost() && isAppRoutePath(pathname)) {
      const to = buildUrl(getAppBaseUrl(), fullPath);
      if (window.location.href !== to) window.location.replace(to);
      return;
    }

    if (isAppProductionHost() && isPublicRoutePath(pathname)) {
      // Block the redirect while a PWA install is pending or in progress.
      // Two independent checks are required because they cover different phases:
      //
      // 1. loc.search param — fires from the first render through to whenever React
      //    Router last saw the URL. Covers the initial load AND the case where
      //    pwa-install.ts was never initialised (wrong build mode, unsupported browser
      //    clears the global flag immediately, etc.).
      //
      // 2. window.__FARMVAULT_INSTALL_MODE__ — set by pwa-install.ts *before* React
      //    mounts, cleared only after the native dialog resolves. Covers the window
      //    between pwa-install.ts calling replaceState (removing the param) and the
      //    dialog being dismissed, during which React Router may re-fire this effect
      //    with an empty loc.search while the dialog is still overlaying the page.
      const installParamPresent = new URLSearchParams(loc.search).get('install') === 'true';
      if (installParamPresent || window.__FARMVAULT_INSTALL_MODE__) return;
      // App host should never render marketing pages; always route to auth/app flow.
      const to = buildUrl(getAppBaseUrl(), '/sign-in');
      if (window.location.href !== to) window.location.replace(to);
    }
  }, [loc.pathname, loc.search, loc.hash]);

  return null;
}

