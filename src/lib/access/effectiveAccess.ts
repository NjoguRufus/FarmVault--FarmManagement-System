/**
 * Canonical resolved access model.
 * All UI, routes, sidebar, and landing logic should consume EffectiveAccess, not raw role checks.
 */

import type { PermissionMap } from '@/types';
import { isBrokerEmployeeRoleString } from '@/lib/roles/canonicalEmployeeRole';
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

/** Canonical staff home; only valid when the session has a company tenant (see getLandingPageFromPermissions). */
export const STAFF_DASHBOARD_PATH = '/staff/staff-dashboard';

/**
 * Guards that deny a role-specific route should send users to their real home, never invent /staff without a tenant.
 */
export function resolveStaffShellEntryOrHome(landingPage: string | null | undefined): string {
  const p = (landingPage ?? '').trim();
  if (p === STAFF_DASHBOARD_PATH || p === '/staff' || p.startsWith('/staff/')) return p;
  if (p === '/dashboard' || p === '/broker' || p === '/developer') return p;
  if (p.startsWith('/ambassador/')) return p;
  return '/';
}

/**
 * Resolve default landing page from permissions (and optional legacy role for broker/driver).
 * Never defaults to the staff shell without a company id — unlinked/deleted sessions must not get a staff dashboard.
 */
export function getLandingPageFromPermissions(
  permissions: PermissionMap,
  options?: {
    legacyRole?: string | null;
    isCompanyAdmin?: boolean;
    isDeveloper?: boolean;
    employeeId?: string | null;
    companyId?: string | null;
  },
): string {
  if (options?.isDeveloper) return '/developer';
  if (options?.isCompanyAdmin) return '/dashboard';

  const companyId = options?.companyId != null ? String(options.companyId).trim() : '';
  if (!companyId) {
    return '/';
  }

  const legacy = (options?.legacyRole ?? '').toLowerCase();
  if (legacy === 'broker' || legacy === 'sales-broker') {
    return '/broker';
  }

  return STAFF_DASHBOARD_PATH;
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
    employeeId,
    companyId,
  });

  const role = (legacyRole ?? '').toLowerCase();
  const isBroker = isBrokerEmployeeRoleString(legacyRole);
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
