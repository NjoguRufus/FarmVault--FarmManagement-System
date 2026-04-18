import React, { useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useProject } from '@/contexts/ProjectContext';
import { resolveHarvestEntryPath } from '@/lib/harvestNavigation';

/**
 * Central crop-aware "Harvest" entrypoint.
 * - Tomatoes → Tomato harvest sessions (per project when available)
 * - French Beans (Harvest Collections module) → Harvest Collections (optionally scoped by projectId)
 * - Other crops / no project → Harvest & Sales
 *
 * Keeps the sidebar label simple (`Harvest`) while routing intelligently.
 */
export function HarvestEntryRoute() {
  const { activeProject } = useProject();
  const location = useLocation();

  const to = useMemo(() => {
    const base = resolveHarvestEntryPath(activeProject, '');
    const search = location.search ?? '';
    return `${base}${search}`;
  }, [activeProject, location.search]);

  return <Navigate to={to} replace />;
}

/** Same as {@link HarvestEntryRoute} but resolves paths under `/staff/...` (staff shell). */
export function StaffHarvestEntryRoute() {
  const { activeProject } = useProject();
  const location = useLocation();

  const to = useMemo(() => {
    const base = resolveHarvestEntryPath(activeProject, '/staff');
    const search = location.search ?? '';
    return `${base}${search}`;
  }, [activeProject, location.search]);

  return <Navigate to={to} replace />;
}

