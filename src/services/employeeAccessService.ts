import { logger } from "@/lib/logger";
/**
 * Employee Management & Access Control service.
 * Multi-company: all queries scoped by company_id.
 */

import { db } from '@/lib/db';
import { ROLE_DEFAULT_PERMISSIONS, PERMISSION_KEYS, type EmployeeRoleKey } from '@/config/accessControl';

export type ActivityLogEntry = {
  id: string;
  company_id: string;
  employee_id: string | null;
  action: string;
  module: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

/** Get role template from DB (company-specific or global). Returns allowed keys. */
export async function getRoleTemplatePermissionKeys(
  companyId: string,
  role: string
): Promise<Set<string>> {
  const roleNorm = role?.toLowerCase().trim() || 'custom';
  if (roleNorm === 'custom') return new Set();

  const { data: companyRows } = await db
    .public()
    .from('role_permission_templates')
    .select('permission_key')
    .eq('company_id', companyId)
    .eq('role', roleNorm)
    .eq('allowed', true);

  if (companyRows?.length) {
    return new Set(companyRows.map((r) => r.permission_key as string));
  }

  const { data: globalRows } = await db
    .public()
    .from('role_permission_templates')
    .select('permission_key')
    .is('company_id', null)
    .eq('role', roleNorm)
    .eq('allowed', true);

  if (globalRows?.length) {
    return new Set(globalRows.map((r) => r.permission_key as string));
  }

  const defaults = ROLE_DEFAULT_PERMISSIONS[roleNorm as EmployeeRoleKey] ?? [];
  return new Set(defaults);
}

/** Get employee permission overrides from DB. */
export async function getEmployeePermissionOverrides(
  companyId: string,
  employeeId: string
): Promise<Map<string, boolean>> {
  const { data } = await db
    .public()
    .from('employee_permissions')
    .select('permission_key, allowed')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId);

  const map = new Map<string, boolean>();
  (data ?? []).forEach((r) => map.set(r.permission_key as string, r.allowed === true));
  return map;
}

/** Effective permissions: prefer employees.permissions flat JSON; fall back to role template + overrides. */
export async function getEffectivePermissionKeys(
  companyId: string,
  employeeId: string,
  role: string | null
): Promise<Set<string>> {
  // 1) Try employees.permissions flat JSON first – this is the source of truth.
  const { data: empRow } = await db
    .public()
    .from('employees')
    .select('permissions, permission_preset')
    .eq('company_id', companyId)
    .eq('id', employeeId)
    .maybeSingle();

  let fromPermissions: Set<string> | null = null;
  if (empRow && empRow.permissions && typeof empRow.permissions === 'object') {
    const flat = empRow.permissions as Record<string, boolean>;
    const keys = Object.entries(flat)
      .filter(([, v]) => v === true)
      .map(([k]) => k);
    if (keys.length > 0) {
      fromPermissions = new Set(keys);
    }
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    logger.log('[Employee Access] loaded employee.permissions', {
      companyId,
      employeeId,
      permissions: empRow?.permissions ?? null,
      permission_preset: empRow?.permission_preset ?? null,
    });
  }

  if (fromPermissions) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      logger.log('[Employee Access] initial form state source = permissions', {
        companyId,
        employeeId,
      });
    }
    return fromPermissions;
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    logger.log('[Employee Access] initial form state source = preset', {
      companyId,
      employeeId,
      role,
    });
  }

  // 2) Fallback: role template + employee_permissions overrides (legacy behavior).
  const roleKeys = await getRoleTemplatePermissionKeys(companyId, role ?? 'custom');
  const overrides = await getEmployeePermissionOverrides(companyId, employeeId);

  const result = new Set(roleKeys);
  overrides.forEach((allowed, key) => {
    if (allowed) result.add(key);
    else result.delete(key);
  });
  return result;
}

/** Check if employee has permission (by key). Use after loading effective permissions. */
export function canByKeys(allowedKeys: Set<string>, permissionKey: string): boolean {
  return allowedKeys.has(permissionKey);
}

/** Get project IDs the employee is allowed to access. Empty = all projects (no restriction). */
export async function getEmployeeProjectAccess(
  companyId: string,
  employeeId: string
): Promise<string[]> {
  const { data } = await db
    .public()
    .from('employee_project_access')
    .select('project_id')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId);

  return (data ?? []).map((r) => r.project_id as string);
}

/** Check if employee has access to a project. If projectAccess list is empty, allow all. */
export function hasProjectAccess(projectId: string, allowedProjectIds: string[]): boolean {
  if (allowedProjectIds.length === 0) return true;
  return allowedProjectIds.includes(projectId);
}

/** Log an activity. Caller must ensure company_id and optional employee_id are correct. */
export async function logActivity(params: {
  companyId: string;
  employeeId?: string | null;
  action: string;
  module?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await db
    .public()
    .from('activity_logs')
    .insert({
      company_id: params.companyId,
      employee_id: params.employeeId ?? null,
      action: params.action,
      module: params.module ?? null,
      metadata: params.metadata ?? null,
    });
}

/** List activity logs for an employee or company. */
export async function listActivityLogs(params: {
  companyId: string;
  employeeId?: string | null;
  limit?: number;
}): Promise<ActivityLogEntry[]> {
  let q = db
    .public()
    .from('activity_logs')
    .select('*')
    .eq('company_id', params.companyId)
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 50);

  if (params.employeeId) {
    q = q.eq('employee_id', params.employeeId);
  }

  const { data } = await q;
  return (data ?? []) as ActivityLogEntry[];
}

/** Replace employee permission overrides. Pass full set of allowed keys; all keys not in the set are stored as allowed: false. */
export async function setEmployeePermissions(
  companyId: string,
  employeeId: string,
  allowedKeys: Set<string>
): Promise<void> {
  // Build flat JSON for employees.permissions from allowedKeys.
  const flat: Record<string, boolean> = {};
  PERMISSION_KEYS.forEach((permission_key) => {
    flat[permission_key] = allowedKeys.has(permission_key);
  });

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    logger.log('[Employee Access] save payload', {
      companyId,
      employeeId,
      allowedKeys: Array.from(allowedKeys),
      flat,
    });
  }

  // Keep legacy employee_permissions table in sync (per-key overrides).
  await db.public().from('employee_permissions').delete().eq('company_id', companyId).eq('employee_id', employeeId);

  const rows = PERMISSION_KEYS.map((permission_key) => ({
    company_id: companyId,
    employee_id: employeeId,
    permission_key,
    allowed: allowedKeys.has(permission_key),
  }));
  await db.public().from('employee_permissions').insert(rows);

  // Update employees.permissions flat JSON as the source of truth.
  const { error: empPermError } = await db
    .public()
    .from('employees')
    .update({ permissions: flat })
    .eq('company_id', companyId)
    .eq('id', employeeId);

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    logger.log('[Employee Access] save response', {
      companyId,
      employeeId,
      ok: !empPermError,
      error: empPermError ?? null,
    });
  }

  if (empPermError) {
    throw new Error(empPermError.message ?? 'Failed to update employee permissions');
  }
}

/** Set project access for an employee (replace all). */
export async function setEmployeeProjectAccess(
  companyId: string,
  employeeId: string,
  projectIds: string[]
): Promise<void> {
  await db.public().from('employee_project_access').delete().eq('company_id', companyId).eq('employee_id', employeeId);

  if (projectIds.length === 0) return;

  await db
    .public()
    .from('employee_project_access')
    .insert(
      projectIds.map((project_id) => ({
        company_id: companyId,
        employee_id: employeeId,
        project_id,
      }))
    );
}

/** List all permissions from DB (for admin UI). */
export async function listPermissions(): Promise<{ key: string; module: string; action: string; description: string | null }[]> {
  const { data } = await db.public().from('permissions').select('key, module, action, description').order('module');
  return (data ?? []) as { key: string; module: string; action: string; description: string | null }[];
}
