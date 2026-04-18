import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { harvestRouteBaseFromPath, type HarvestRouteBasePrefix } from '@/lib/harvestNavigation';

/** `'/staff` when harvest pages run under StaffLayout; otherwise `''` (main shell). */
export function useHarvestNavPrefix(): HarvestRouteBasePrefix {
  const { pathname } = useLocation();
  return useMemo(() => harvestRouteBaseFromPath(pathname), [pathname]);
}
