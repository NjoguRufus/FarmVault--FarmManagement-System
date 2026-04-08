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
      // App host should never render marketing pages; always route to auth/app flow.
      const to = buildUrl(getAppBaseUrl(), '/sign-in');
      if (window.location.href !== to) window.location.replace(to);
    }
  }, [loc.pathname, loc.search, loc.hash]);

  return null;
}

