/**
 * Supabase-backed employee operations (invite, list, update).
 * Uses Clerk for auth: never call supabase.auth. Identity from Clerk only.
 */
import { supabase, getSupabaseAccessToken } from '@/lib/supabase';
import { db } from '@/lib/db';
import { EMPLOYEES_SELECT } from '@/lib/employees/employeesColumns';
import type { Employee, EmployeeStatus, PermissionMap } from '@/types';
import { getPresetPermissions } from '@/lib/employees/permissionPresets';
import { flattenPermissionMap } from '@/lib/permissions';
import type { EmployeeRoleKey } from '@/config/accessControl';

/** Payload for Clerk-based invite (Edge Function). No Supabase Auth. */
export type InviteEmployeePayload = {
  companyId: string;
  fullName: string;
  email: string;
  phone?: string | null;
  role?: string | null;
  department?: string | null;
  permissionPreset?: string | null;
  permissionOverrides?: Record<string, boolean> | null;
  assignedProjectIds?: string[];
  actorEmployeeId?: string | null;
};

function mapRowToEmployee(row: Record<string, unknown>): Employee {
  const fullName = row.full_name != null ? String(row.full_name) : undefined;
  return {
    id: String(row.id ?? ''),
    companyId: String(row.company_id ?? ''),
    // `employees` table uses `full_name` (no `name` column). Keep the UI `name` field derived.
    // Never default to a generic label when we have an email; use email instead.
    name: fullName ?? (row.email != null ? String(row.email) : 'Employee'),
    fullName,
    email: row.email != null ? String(row.email) : undefined,
    phone: row.phone != null ? String(row.phone) : undefined,
    // UI legacy: keep `contact` derived from phone for display/search.
    contact: row.phone != null ? String(row.phone) : undefined,
    role: row.role != null ? String(row.role) : undefined,
    // `employees` table has only `role` (no `employee_role` column)
    employeeRole: row.role != null ? String(row.role) : undefined,
    department: row.department != null ? String(row.department) : undefined,
    status: (row.status as Employee['status']) ?? 'active',
    permissions: row.permissions as PermissionMap | undefined,
    authUserId: row.clerk_user_id != null ? String(row.clerk_user_id) : undefined,
    createdAt: row.created_at,
    // UI legacy: treat join date as created_at for Supabase-backed employees
    joinDate: row.created_at,
    avatarUrl: row.avatar_url != null ? String(row.avatar_url) : undefined,
  };
}

export async function listEmployees(companyId: string): Promise<Employee[]> {
  const { data, error, status, statusText } = await db
    .public()
    .from('employees')
    .select(EMPLOYEES_SELECT)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[employeesSupabaseService] listEmployees error', {
        companyId,
        error,
        status,
        statusText,
      });
    }
    throw new Error(error.message ?? 'Failed to list employees');
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[employeesSupabaseService] listEmployees raw', {
      companyId,
      rawCount: (data ?? []).length,
      rawStatuses: Array.from(new Set((data ?? []).map((r: any) => r.status))),
      sample: (data ?? []).slice(0, 3),
    });
  }

  const rows = (data ?? []).map(mapRowToEmployee);

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[employeesSupabaseService] listEmployees', {
      companyId,
      count: rows.length,
      statuses: Array.from(new Set(rows.map((r) => r.status))),
    });
  }

  return rows;
}

export type SaveEmployeeDraftInput = {
  id?: string;
  companyId: string;
  fullName?: string;
  email?: string;
  phone?: string | null;
  role?: EmployeeRoleKey | null;
  department?: string | null;
  permissionPreset?: EmployeeRoleKey | null;
  permissions?: PermissionMap | null;
};

export async function saveEmployeeDraft(input: SaveEmployeeDraftInput): Promise<{ employee_id: string }> {
  const companyId = input.companyId;
  const emailRaw = input.email?.trim();
  const fullNameRaw = input.fullName?.trim();
  const hasMeaningful =
    !!fullNameRaw ||
    !!emailRaw ||
    !!input.phone ||
    !!input.role ||
    !!input.department;

  if (!companyId || !hasMeaningful) {
    throw new Error('Nothing to save for draft.');
  }

  const email = emailRaw?.toLowerCase() ?? null;
  const fullName = fullNameRaw || email || null;
  const preset = input.permissionPreset ?? 'viewer';
  const nestedPermissions = (input.permissions ?? (getPresetPermissions(preset) as PermissionMap)) as PermissionMap;
  const permissions = flattenPermissionMap(nestedPermissions);

  const basePayload = {
    company_id: companyId,
    clerk_user_id: null,
    email,
    full_name: fullName,
    phone: input.phone ?? null,
    role: input.role ?? preset,
    department: input.department ?? null,
    permission_preset: preset,
    permissions,
    status: 'draft' as const,
  };

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[employeesSupabaseService] saveEmployeeDraft payload', { id: input.id, ...basePayload });
  }

  // If we have an explicit id, prefer updating that row.
  if (input.id) {
    const { data, error } = await db
      .public()
      .from('employees')
      .update(basePayload)
      .eq('id', input.id)
      .eq('company_id', companyId)
      .select('id')
      .single();

    if (error) {
      throw new Error(error.message ?? 'Failed to save draft');
    }
    return { employee_id: String(data.id) };
  }

  // Otherwise, avoid duplicate drafts where possible: reuse existing draft for same company+email.
  let existingId: string | null = null;
  if (email) {
    const { data: existing } = await db
      .public()
      .from('employees')
      .select('id, status')
      .eq('company_id', companyId)
      .ilike('email', email)
      .maybeSingle();

    if (existing?.id && existing.status === 'draft') {
      existingId = String(existing.id);
    } else if (existing?.id) {
      // Do not overwrite non-draft employees; just return their id.
      return { employee_id: String(existing.id) };
    }
  }

  if (existingId) {
    const { data, error } = await db
      .public()
      .from('employees')
      .update(basePayload)
      .eq('id', existingId)
      .eq('company_id', companyId)
      .select('id')
      .single();

    if (error) {
      throw new Error(error.message ?? 'Failed to update draft');
    }
    return { employee_id: String(data.id) };
  }

  const { data: inserted, error: insertError } = await db
    .public()
    .from('employees')
    .insert(basePayload)
    .select('id')
    .single();

  if (insertError) {
    throw new Error(insertError.message ?? 'Failed to create draft employee');
  }

  return { employee_id: String(inserted.id) };
}

export type InviteEmployeeResult = { employee_id: string; message?: string };

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

export async function inviteEmployee(payload: InviteEmployeePayload): Promise<InviteEmployeeResult> {
  const token = await getSupabaseAccessToken();
  if (!token) {
    throw new Error('You must be signed in to invite employees.');
  }

  const body = {
    companyId: payload.companyId,
    fullName: payload.fullName?.trim() || payload.email.trim(),
    email: payload.email.trim().toLowerCase(),
    phone: payload.phone?.trim() || null,
    role: payload.role ?? payload.permissionPreset ?? 'viewer',
    department: payload.department ?? null,
    permissionPreset: payload.permissionPreset ?? 'viewer',
    permissionOverrides: payload.permissionOverrides ?? null,
    assignedProjectIds: payload.assignedProjectIds ?? [],
    actorEmployeeId: payload.actorEmployeeId ?? null,
  };

  const url = SUPABASE_URL
    ? `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/invite-employee`
    : null;

  if (url) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    let data: {
      ok?: boolean;
      employee_id?: string;
      message?: string;
      error?: string;
      detail?: string;
      details?: unknown;
    } | null = null;
    try {
      const text = await res.text();
      if (text) data = JSON.parse(text) as typeof data;
    } catch {
      // ignore parse error
    }
    const errMsg = data?.error ?? data?.detail ?? (res.ok ? null : res.statusText || `Request failed (${res.status})`);
    if (!res.ok) {
      const err = new Error(errMsg ?? 'Invite request failed') as Error & { detail?: string; details?: unknown; code?: string };
      err.detail = data?.detail ?? undefined;
      err.details = data?.details;
      err.code = res.status === 409 ? 'ALREADY_INVITED' : 'CLERK_INVITE_FAILED';
      throw err;
    }
    if (data?.error) {
      const detail = data.detail ?? data.error;
      const code = /already invited|already exists|active in this company/i.test(String(detail)) ? 'EMPLOYEE_ALREADY_ACTIVE' : /already invited|resend/i.test(String(detail)) ? 'ALREADY_INVITED' : 'CLERK_INVITE_FAILED';
      const err = new Error(detail) as Error & { code?: string; detail?: string; details?: unknown };
      err.code = code;
      err.detail = data.detail;
      err.details = data.details;
      throw err;
    }
    if (!data?.employee_id) {
      throw new Error(data?.message ?? 'Invite succeeded but no employee id returned');
    }
    return { employee_id: data.employee_id, message: data.message };
  }

  const res = await supabase.functions.invoke<{
    ok?: boolean;
    employee_id?: string;
    message?: string;
    error?: string;
    detail?: string;
    code?: string;
  }>('invite-employee', {
    body,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = res.data;

  if (res.error) {
    const message =
      (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : null) ||
      (data && typeof data === 'object' && 'detail' in data && typeof (data as { detail: unknown }).detail === 'string'
        ? (data as { detail: string }).detail
        : null) ||
      res.error?.message ||
      'Invite request failed';
    throw new Error(message);
  }
  if (data?.error) {
    const detail = data.detail ?? data.error;
    const code = /already invited|already exists|active in this company/i.test(String(detail)) ? 'EMPLOYEE_ALREADY_ACTIVE' : /already invited|resend/i.test(String(detail)) ? 'ALREADY_INVITED' : 'CLERK_INVITE_FAILED';
    const err = new Error(detail) as Error & { code?: string };
    err.code = code;
    throw err;
  }
  if (!data?.employee_id) {
    throw new Error(data?.message ?? 'Invite succeeded but no employee id returned');
  }
  return { employee_id: data.employee_id, message: data.message };
}

export async function revokeEmployeeInvite(companyId: string, email: string): Promise<void> {
  const token = await getSupabaseAccessToken();
  if (!token) {
    throw new Error('You must be signed in to revoke employee invites.');
  }

  const body = {
    companyId,
    email: email.trim().toLowerCase(),
    hardDelete: true,
  };

  const url = SUPABASE_URL
    ? `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/revoke-employee-invite`
    : null;

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[employeesSupabaseService] revokeEmployeeInvite request', { url, body });
  }

  if (url) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    let data: { ok?: boolean; error?: string; detail?: string } | null = null;
    try {
      const text = await res.text();
      if (text) data = JSON.parse(text) as typeof data;
    } catch {
      // ignore parse error
    }

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[employeesSupabaseService] revokeEmployeeInvite response', {
        status: res.status,
        ok: res.ok,
        data,
      });
    }

    if (!res.ok || data?.error) {
      const msg = (data?.detail ?? data?.error ?? res.statusText) || `Revoke invite failed (${res.status})`;
      throw new Error(msg);
    }
    return;
  }

  const res = await supabase.functions.invoke<{
    ok?: boolean;
    error?: string;
    detail?: string;
  }>('revoke-employee-invite', {
    body,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[employeesSupabaseService] revokeEmployeeInvite invoke result', {
      data: res.data,
      error: res.error,
    });
  }

  if (res.error || res.data?.error) {
    const msg =
      res.data?.detail ??
      res.data?.error ??
      res.error?.message ??
      'Revoke invite failed';
    throw new Error(msg);
  }
}

export async function updateEmployee(
  employeeId: string,
  payload: {
    full_name?: string;
    role?: string | null;
    department?: string;
    phone?: string;
    status?: EmployeeStatus;
    permissions?: PermissionMap | null;
    permission_preset?: string | null;
  }
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (payload.full_name != null) updates.full_name = payload.full_name;
  if (payload.role != null) updates.role = payload.role;
  if (payload.department != null) updates.department = payload.department;
  if (payload.phone != null) updates.phone = payload.phone;
  if (payload.status != null) updates.status = payload.status;
   // Only update permission_preset when explicitly provided (e.g. role preset changed).
  if (payload.permission_preset !== undefined) {
    updates.permission_preset = payload.permission_preset;
  }
  if (payload.permissions != null) {
    const raw = payload.permissions as unknown as Record<string, unknown>;
    const isFlat = Object.keys(raw || {}).some((k) => k.includes('.'));
    updates.permissions = isFlat ? raw : flattenPermissionMap(raw as unknown as PermissionMap);
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[Employee Save] permissions payload', {
      employeeId,
      updates,
    });
    if ('name' in updates || 'created_by' in updates) {
      // eslint-disable-next-line no-console
      console.warn('[employeesSupabaseService] Forbidden employees columns detected in update payload', updates);
    }
  }

  const { error: updateEmpError } = await db
    .public()
    .from('employees')
    .update(updates)
    .eq('id', employeeId);

  if (updateEmpError) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[Employee Save] Supabase response', {
        employeeId,
        ok: false,
        error: updateEmpError,
      });
    }
    throw new Error(updateEmpError.message ?? 'Failed to update employee');
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[Employee Save] Supabase response', {
      employeeId,
      ok: true,
    });
  }
}

export async function setEmployeeStatus(employeeId: string, status: EmployeeStatus): Promise<void> {
  const { error } = await db
    .public()
    .from('employees')
    .update({ status })
    .eq('id', employeeId);

  if (error) {
    throw new Error(error.message ?? 'Failed to update employee status');
  }
}

export async function deleteEmployee(employeeId: string): Promise<void> {
  const { error } = await db
    .public()
    .from('employees')
    .delete()
    .eq('id', employeeId);

  if (error) {
    throw new Error(error.message ?? 'Failed to delete employee');
  }
}
