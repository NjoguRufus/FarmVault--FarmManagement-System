import type { SubscriptionFeatureKey } from '@/config/subscriptionFeatureMatrix';

/**
 * Routes that should remain visible on Basic but be locked (Pro-only).
 * Used by navigation components to show a lock icon + Pro badge and
 * to open the upgrade prompt when clicked.
 */
export const LOCKED_PRO_ROUTES: Array<{
  pathPrefix: string;
  feature: SubscriptionFeatureKey;
}> = [
  // French Beans advanced collections workflow
  { pathPrefix: '/harvest-collections', feature: 'frenchBeansCollections' },
  { pathPrefix: '/staff/harvest-collections', feature: 'frenchBeansCollections' },
  // Crop Intelligence tab lives under records pages; we lock the feature inside the page,
  // but keep this here for future route-level handling if split into its own route.
  // { pathPrefix: '/records', feature: 'reports.advanced' },
];

export function getLockedProFeatureForPath(pathname: string): SubscriptionFeatureKey | null {
  const path = (pathname || '').replace(/\/+/g, '/');
  for (const r of LOCKED_PRO_ROUTES) {
    const prefix = r.pathPrefix.replace(/\/+/g, '/');
    if (path === prefix || path.startsWith(prefix + '/')) return r.feature;
  }
  return null;
}

