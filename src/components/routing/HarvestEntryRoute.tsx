import React, { useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { useEmployeeAccess } from '@/hooks/useEmployeeAccess';
import { pickHarvestContextProject, resolveHarvestEntryPath } from '@/lib/harvestNavigation';

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
  const { user } = useAuth();
  const { activeProject, projects } = useProject();
  const location = useLocation();
  const { hasProjectAccess, isLoading } = useEmployeeAccess();

  const to = useMemo(() => {
    const cid = user?.companyId ?? null;
    const companyProjects = cid ? projects.filter((p) => p.companyId === cid) : projects;
    const picked = pickHarvestContextProject(activeProject, companyProjects, hasProjectAccess);
    const base = resolveHarvestEntryPath(picked, '/staff');
    const search = location.search ?? '';
    return `${base}${search}`;
  }, [activeProject, projects, hasProjectAccess, user?.companyId, location.search]);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-muted-foreground">
        Loading harvest…
      </div>
    );
  }

  return <Navigate to={to} replace />;
}

