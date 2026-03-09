import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useEmployeeAccess } from '@/hooks/useEmployeeAccess';
import { useStaff } from '@/contexts/StaffContext';

export function StaffDashboard() {
  const { user, employeeProfile } = useAuth();
  const { permissions, can } = usePermissions();
  const { effectivePermissionKeys, projectAccessIds } = useEmployeeAccess();
  const { fullName, roleLabel } = useStaff();

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
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {displayName}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {displayRole} · Staff workspace
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {canHarvest && (
          <Link to="/staff/harvest-collections" className="block">
            <div className="fv-card p-4 h-full hover:bg-accent/40 transition-colors cursor-pointer">
              <h2 className="text-lg font-semibold mb-2">Harvest & Collections</h2>
              <p className="text-sm text-muted-foreground">
                Open today&apos;s harvest collections workspace for field weigh-in and picker entries.
              </p>
            </div>
          </Link>
        )}

        {canInventory && (
          <div className="fv-card p-4">
            <h2 className="text-lg font-semibold mb-2">Inventory Overview</h2>
            <p className="text-sm text-muted-foreground">
              See key stock levels and recent stock movements you&apos;re allowed to manage.
            </p>
          </div>
        )}

        {canExpenses && (
          <div className="fv-card p-4">
            <h2 className="text-lg font-semibold mb-2">Expenses & Finance</h2>
            <p className="text-sm text-muted-foreground">
              View and approve expenses or payments that fall under your role.
            </p>
          </div>
        )}

        {canOperations && (
          <div className="fv-card p-4">
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

