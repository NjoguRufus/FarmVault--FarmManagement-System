import { useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  canByPermissionMap,
  canSeeByPermissionMap,
  getDefaultPermissions,
  resolvePermissions,
} from '@/lib/permissions';
import type { PermissionMap, PermissionModule } from '@/types';

interface UsePermissionsResult {
  isDeveloper: boolean;
  isCompanyAdmin: boolean;
  isEmployee: boolean;
  permissions: PermissionMap;
  can: (module: PermissionModule, actionPath?: string) => boolean;
  canSee: (module: PermissionModule, componentPath: string) => boolean;
}

function getLegacyRole(userRole?: string, employeeRole?: string | null): string | null {
  if (employeeRole) return employeeRole;
  if (!userRole) return null;
  if (userRole === 'manager') return 'operations-manager';
  if (userRole === 'broker') return 'sales-broker';
  if (userRole === 'driver') return 'logistics-driver';
  return null;
}

export function usePermissions(): UsePermissionsResult {
  const { user, permissions: authPermissions } = useAuth();

  const isDeveloper = user?.role === 'developer';
  const isCompanyAdmin = user?.role === 'company-admin' || (user as any)?.role === 'company_admin';
  const isEmployee = Boolean(user && !isDeveloper && !isCompanyAdmin);

  const permissions = useMemo(() => {
    if (authPermissions) return authPermissions;
    const legacyRole = getLegacyRole(user?.role, user?.employeeRole ?? null);
    return resolvePermissions(legacyRole, getDefaultPermissions());
  }, [authPermissions, user?.role, user?.employeeRole]);

  const can = useCallback(
    (module: PermissionModule, actionPath?: string) => {
      if (isDeveloper || isCompanyAdmin) return true;
      if (!isEmployee) return false;
      return canByPermissionMap(permissions, module, actionPath);
    },
    [isDeveloper, isCompanyAdmin, isEmployee, permissions],
  );

  const canSee = useCallback(
    (module: PermissionModule, componentPath: string) => {
      if (isDeveloper || isCompanyAdmin) return true;
      if (!isEmployee) return false;
      return canSeeByPermissionMap(permissions, module, componentPath);
    },
    [isDeveloper, isCompanyAdmin, isEmployee, permissions],
  );

  return {
    isDeveloper,
    isCompanyAdmin,
    isEmployee,
    permissions,
    can,
    canSee,
  };
}

