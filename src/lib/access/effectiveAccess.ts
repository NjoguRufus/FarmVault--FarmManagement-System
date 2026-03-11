/**
 * Canonical resolved access model.
 * All UI, routes, sidebar, and landing logic should consume EffectiveAccess, not raw role checks.
 */

import type { PermissionMap } from '@/types';
import { roleToPreset, type RolePresetKey } from './rolePresetDefaults';

export interface EffectiveAccess {
  employeeId: string | null;
  companyId: string | null;
  rolePreset: RolePresetKey;
  permissions: Record<string, boolean>;
  allowedModules: string[];
  landingPage: string;
  canSeeDashboard: boolean;
  /** For broker/driver UI paths that are role-specific. Resolved from permissions + legacy role. */
  isBroker: boolean;
  isDriver: boolean;
}

const MODULE_ORDER: string[] = [
  'dashboard',
  'projects',
  'planning',
  'inventory',
  'expenses',
  'operations',
  'harvest',
  'employees',
  'reports',
  'settings',
  'notes',
];

function permissionMapToFlat(permissions: PermissionMap): Record<string, boolean> {
  const flat: Record<string, boolean> = {};
  const walk = (prefix: string, value: unknown) => {
    if (typeof value === 'boolean') {
      flat[prefix] = value;
      return;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
        walk(prefix ? `${prefix}.${k}` : k, v);
      });
    }
  };
  walk('', permissions as unknown as Record<string, unknown>);
  return flat;
}

function hasModuleView(permissions: PermissionMap, module: string): boolean {
  const m = permissions[module as keyof PermissionMap];
  if (!m || typeof m !== 'object') return false;
  const view = (m as { view?: boolean }).view;
  return Boolean(view);
}

/**
 * Compute allowed nav modules from permission map.
 */
export function getAllowedModules(permissions: PermissionMap): string[] {
  return MODULE_ORDER.filter((mod) => hasModuleView(permissions, mod));
}

/**
 * Resolve default landing page from permissions (and optional legacy role for broker/driver).
 */
export function getLandingPageFromPermissions(
  permissions: PermissionMap,
  options?: { legacyRole?: string | null; isCompanyAdmin?: boolean; isDeveloper?: boolean }
): string {
  if (options?.isDeveloper) return '/admin';
  if (options?.isCompanyAdmin) return '/dashboard';

  // All employees live under the /staff namespace. Default landing is always staff dashboard.
  // Module cards inside staff dashboard handle the rest (permission-aware).
  return '/staff/staff-dashboard';
}

/**
 * Build EffectiveAccess from permission map and context.
 */
export function resolveEffectiveAccess(params: {
  permissions: PermissionMap;
  employeeId?: string | null;
  companyId?: string | null;
  legacyRole?: string | null;
  isCompanyAdmin?: boolean;
  isDeveloper?: boolean;
}): EffectiveAccess {
  const {
    permissions,
    employeeId = null,
    companyId = null,
    legacyRole = null,
    isCompanyAdmin = false,
    isDeveloper = false,
  } = params;

  const rolePreset = roleToPreset(legacyRole);
  const flat = permissionMapToFlat(permissions);
  const allowedModules = getAllowedModules(permissions);
  const canSeeDashboard = hasModuleView(permissions, 'dashboard');
  const landingPage = getLandingPageFromPermissions(permissions, {
    legacyRole,
    isCompanyAdmin,
    isDeveloper,
  });

  const role = (legacyRole ?? '').toLowerCase();
  const isBroker = role === 'sales-broker' || role === 'broker';
  const isDriver = role === 'logistics-driver' || role === 'driver';

  return {
    employeeId,
    companyId,
    rolePreset,
    permissions: flat,
    allowedModules,
    landingPage,
    canSeeDashboard,
    isBroker,
    isDriver,
  };
}
