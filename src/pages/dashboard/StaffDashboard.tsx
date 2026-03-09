import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useEmployeeAccess } from '@/hooks/useEmployeeAccess';
import { useStaff } from '@/contexts/StaffContext';
import { useProject } from '@/contexts/ProjectContext';
import { CropStageProgressCard } from '@/components/dashboard';
import { useCollection } from '@/hooks/useCollection';
import type { CropStage } from '@/types';
import {
  Select as UiSelect,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

export function StaffDashboard() {
  const { user, employeeProfile } = useAuth();
  const { permissions, can } = usePermissions();
  const { effectivePermissionKeys, projectAccessIds } = useEmployeeAccess();
  const { fullName, roleLabel } = useStaff();
  const { projects, activeProject, setActiveProject } = useProject();

  const companyId = user?.companyId ?? null;
  const isDeveloper = user?.role === 'developer';

  const { data: allStages = [] } = useCollection<CropStage>(
    'staff-dashboard-stages',
    'projectStages',
    {
      companyScoped: true,
      companyId,
      isDeveloper,
    },
  );

  const activeProjectStages = useMemo(() => {
    if (!activeProject || !companyId) return [];
    return allStages.filter(
      (s) => s.companyId === companyId && s.projectId === activeProject.id,
    );
  }, [allStages, activeProject, companyId]);

  const companyProjects = useMemo(
    () => (companyId ? projects.filter((p) => p.companyId === companyId) : projects),
    [projects, companyId],
  );

  const displayName = fullName ?? user?.email ?? 'User';

  const displayRole = roleLabel ?? 'Staff';

  const canHarvest =
    effectivePermissionKeys.has('harvest.view') ||
    effectivePermissionKeys.has('harvest_collections.view');
  const canInventory = can('inventory', 'view');
  const canExpenses =
    effectivePermissionKeys.has('expenses.view') ||
    effectivePermissionKeys.has('expenses.approve');
  const canOperations = can('operations', 'view');

  if (import.meta.env.DEV && user) {
    // eslint-disable-next-line no-console
    console.log('[Dashboard] visible staff cards', {
      uid: user.id,
      employeeName: displayName,
      employeeRole: displayRole,
      harvest: canHarvest,
      inventory: canInventory,
      expenses: canExpenses,
      operations: canOperations,
      projectAccessIds,
      rawPermissions: permissions,
    });
  }

  return (
    <div className="space-y-6 animate-fade-in" data-tour="staff-dashboard-root">
      <div data-tour="staff-dashboard-header">
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {displayName}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {displayRole} · Staff workspace
        </p>
      </div>

      {/* Mobile project selector inside dashboard */}
      <div className="md:hidden max-w-xs">
        <p className="text-xs text-muted-foreground mb-1.5">Project</p>
        <UiSelect
          value={activeProject?.id ?? undefined}
          onValueChange={(projectId) => {
            const next = companyProjects.find((p) => p.id === projectId) ?? null;
            if (next) {
              setActiveProject(next);
            }
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select project" />
          </SelectTrigger>
          <SelectContent>
            {companyProjects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </UiSelect>
      </div>

      {/* Crop stage progress section */}
      <div className="space-y-3">
        <CropStageProgressCard
          projectName={activeProject?.name}
          stages={activeProjectStages}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {canHarvest && (
          <Link
            to="/staff/harvest-collections"
            className="block"
            data-tour="staff-card-harvest"
          >
            <div className="fv-card p-4 h-full hover:bg-accent/40 transition-colors cursor-pointer">
              <h2 className="text-lg font-semibold mb-2">Harvest & Collections</h2>
              <p className="text-sm text-muted-foreground">
                Open today&apos;s harvest collections workspace for field weigh-in and picker entries.
              </p>
            </div>
          </Link>
        )}

        {canInventory && (
          <div className="fv-card p-4" data-tour="staff-card-inventory">
            <h2 className="text-lg font-semibold mb-2">Inventory Overview</h2>
            <p className="text-sm text-muted-foreground">
              See key stock levels and recent stock movements you&apos;re allowed to manage.
            </p>
          </div>
        )}

        {canExpenses && (
          <div className="fv-card p-4" data-tour="staff-card-expenses">
            <h2 className="text-lg font-semibold mb-2">Expenses & Finance</h2>
            <p className="text-sm text-muted-foreground">
              View and approve expenses or payments that fall under your role.
            </p>
          </div>
        )}

        {canOperations && (
          <div className="fv-card p-4" data-tour="staff-card-operations">
            <h2 className="text-lg font-semibold mb-2">Operations</h2>
            <p className="text-sm text-muted-foreground">
              Keep track of work cards and field operations assigned to you or your projects.
            </p>
          </div>
        )}
      </div>

      {!canHarvest && !canInventory && !canExpenses && !canOperations && (
        <div className="fv-card p-4">
          <h2 className="text-lg font-semibold mb-2">Limited Access</h2>
          <p className="text-sm text-muted-foreground">
            Your account currently has very limited access. If you believe this is a mistake,
            please contact your administrator.
          </p>
        </div>
      )}
    </div>
  );
}

