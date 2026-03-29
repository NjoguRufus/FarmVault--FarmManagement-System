/**
 * Employee access control hook: can(permissionKey), hasProjectAccess(projectId), getEmployeeEffectivePermissions().
 * Uses new access control tables when employee exists; falls back to legacy usePermissions for company_admin/developer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getEffectivePermissionKeys,
  getEmployeeProjectAccess,
  canByKeys,
  hasProjectAccess as hasProjectAccessCheck,
} from '@/services/employeeAccessService';

export interface UseEmployeeAccessResult {
  /** Check permission by key (e.g. "harvest_collections.pay"). */
  can: (permissionKey: string) => boolean;
  /** Check if current user has access to the given project. */
  hasProjectAccess: (projectId: string) => boolean;
  /** Get the set of allowed permission keys for the current employee. */
  getEmployeeEffectivePermissions: () => Set<string>;
  /** Allowed permission keys (cached). */
  effectivePermissionKeys: Set<string>;
  /** Project IDs the employee can access (empty = all). */
  projectAccessIds: string[];
  /** True while loading permissions/project access. */
  isLoading: boolean;
}

export function useEmployeeAccess(): UseEmployeeAccessResult {
  const { user, employeeProfile } = useAuth();
  const { can: legacyCan } = usePermissions();
  const [effectivePermissionKeys, setEffectivePermissionKeys] = useState<Set<string>>(new Set());
  const [projectAccessIds, setProjectAccessIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const companyId = user?.companyId ?? null;
  const employeeId = employeeProfile?.id ?? null;
  const role = employeeProfile?.employeeRole ?? employeeProfile?.role ?? null;
  const isAdminOrDev =
    user?.role === 'developer' ||
    user?.role === 'company-admin' ||
    (user as { role?: string })?.role === 'company_admin';

  useEffect(() => {
    if (!companyId) {
      setEffectivePermissionKeys(new Set());
      setProjectAccessIds([]);
      setIsLoading(false);
      return;
    }
    // Company admins / developers often have no employees row — must not require employeeId.
    if (isAdminOrDev) {
      setEffectivePermissionKeys(new Set(['*']));
      setProjectAccessIds([]);
      setIsLoading(false);
      return;
    }
    if (!employeeId) {
      setEffectivePermissionKeys(new Set());
      setProjectAccessIds([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    (async () => {
      try {
        const [keys, projectIds] = await Promise.all([
          getEffectivePermissionKeys(companyId, employeeId, role),
          getEmployeeProjectAccess(companyId, employeeId),
        ]);
        if (!cancelled) {
          setEffectivePermissionKeys(keys);
          setProjectAccessIds(projectIds);
        }
      } catch {
        if (!cancelled) {
          setEffectivePermissionKeys(new Set());
          setProjectAccessIds([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, employeeId, role, isAdminOrDev]);

  const can = useCallback(
    (permissionKey: string): boolean => {
      if (isAdminOrDev) return true;
      const mapped = mapKeyToModuleAction(permissionKey);
      if (!employeeId) return legacyCan(mapped.module, mapped.action);
      // Prefer flat keys from employee access (e.g. harvest_collections.edit)
      if (canByKeys(effectivePermissionKeys, permissionKey)) return true;
      // Fallback: respect legacy permission map (e.g. harvest.edit from role preset) so staff
      // with edit/delete in Access & Permissions or role presets can edit/delete.
      return legacyCan(mapped.module, mapped.action);
    },
    [isAdminOrDev, employeeId, effectivePermissionKeys, legacyCan]
  );

  const hasProjectAccess = useCallback(
    (projectId: string): boolean => {
      if (isAdminOrDev) return true;
      return hasProjectAccessCheck(projectId, projectAccessIds);
    },
    [isAdminOrDev, projectAccessIds]
  );

  const getEmployeeEffectivePermissions = useCallback((): Set<string> => {
    if (isAdminOrDev) return new Set(['*']);
    return new Set(effectivePermissionKeys);
  }, [isAdminOrDev, effectivePermissionKeys]);

  return useMemo(
    () => ({
      can,
      hasProjectAccess,
      getEmployeeEffectivePermissions,
      effectivePermissionKeys,
      projectAccessIds,
      isLoading,
    }),
    [can, hasProjectAccess, getEmployeeEffectivePermissions, effectivePermissionKeys, projectAccessIds, isLoading]
  );
}

/** Map permission key to legacy PermissionModule + action for usePermissions fallback. */
function mapKeyToModuleAction(key: string): { module: 'dashboard' | 'projects' | 'harvest' | 'employees' | 'expenses' | 'inventory' | 'reports' | 'settings' | 'planning' | 'operations' | 'notes'; action: string } {
  const [mod, ...rest] = key.split('.');
  const action = rest.join('.') || 'view';
  const moduleMap: Record<string, 'dashboard' | 'projects' | 'harvest' | 'employees' | 'expenses' | 'inventory' | 'reports' | 'settings' | 'planning' | 'operations' | 'notes'> = {
    dashboard: 'dashboard',
    projects: 'projects',
    crop_monitoring: 'planning',
    records: 'notes',
    inventory: 'inventory',
    suppliers: 'projects',
    expenses: 'expenses',
    harvest: 'harvest',
    harvest_collections: 'harvest',
    logistics: 'operations',
    employees: 'employees',
    reports: 'reports',
    financials: 'settings',
    settings: 'settings',
    planning: 'planning',
    operations: 'operations',
    notes: 'notes',
  };
  return { module: moduleMap[mod ?? ''] ?? 'dashboard', action };
}
