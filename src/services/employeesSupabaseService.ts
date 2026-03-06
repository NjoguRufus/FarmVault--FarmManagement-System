/**
 * Supabase-backed employee operations (invite, list, update).
 * Used when VITE_EMPLOYEES_PROVIDER=supabase. No service role key on client.
 */
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import type { Employee, PermissionMap } from '@/types';

export type InviteEmployeePayload = {
  email: string;
  name: string;
  role?: string | null;
  department?: string;
  phone?: string;
  permissions?: PermissionMap | null;
};

function mapRowToEmployee(row: Record<string, unknown>): Employee {
  return {
    id: String(row.id ?? ''),
    companyId: String(row.company_id ?? ''),
    name: String(row.name ?? ''),
    fullName: row.full_name != null ? String(row.full_name) : undefined,
    email: row.email != null ? String(row.email) : undefined,
    phone: row.phone != null ? String(row.phone) : undefined,
    contact: row.contact != null ? String(row.contact) : undefined,
    role: row.role != null ? String(row.role) : undefined,
    employeeRole: row.employee_role != null ? String(row.employee_role) : undefined,
    department: row.department != null ? String(row.department) : undefined,
    status: (row.status as Employee['status']) ?? 'active',
    permissions: row.permissions as PermissionMap | undefined,
    authUserId: row.clerk_user_id != null ? String(row.clerk_user_id) : (row.auth_user_id != null ? String(row.auth_user_id) : undefined),
    createdAt: row.created_at,
    joinDate: row.join_date,
    createdBy: row.created_by != null ? String(row.created_by) : undefined,
  };
}

export async function listEmployees(companyId: string): Promise<Employee[]> {
  const { data, error } = await db
    .public()
    .from('employees')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message ?? 'Failed to list employees');
  }
  return (data ?? []).map(mapRowToEmployee);
}

export async function inviteEmployee(payload: InviteEmployeePayload & { company_id?: string }): Promise<{ invited_user_id: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('You must be signed in to invite employees.');
  }

  const res = await supabase.functions.invoke<{ ok?: boolean; invited_user_id?: string; error?: string; detail?: string }>('invite-employee', {
    body: {
      email: payload.email.trim(),
      name: payload.name?.trim() ?? payload.email.trim(),
      role: payload.role ?? null,
      department: payload.department ?? null,
      phone: payload.phone ?? null,
      permissions: payload.permissions ?? null,
      company_id: payload.company_id ?? null,
    },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (res.error) {
    throw new Error(res.error.message ?? 'Invite request failed');
  }
  const body = res.data;
  if (body?.error) {
    throw new Error(body.detail ?? body.error);
  }
  if (!body?.invited_user_id) {
    throw new Error('Invite succeeded but no user id returned');
  }
  return { invited_user_id: body.invited_user_id };
}

export async function updateEmployee(
  employeeId: string,
  payload: {
    name?: string;
    role?: string | null;
    employee_role?: string | null;
    department?: string;
    phone?: string;
    contact?: string;
    status?: 'active' | 'on-leave' | 'inactive';
    permissions?: PermissionMap | null;
  }
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (payload.name != null) {
    updates.name = payload.name;
    updates.full_name = payload.name;
  }
  if (payload.role != null) updates.role = payload.role;
  if (payload.employee_role != null) updates.employee_role = payload.employee_role;
  if (payload.department != null) updates.department = payload.department;
  if (payload.phone != null) {
    updates.phone = payload.phone;
    updates.contact = payload.phone;
  }
  if (payload.contact != null) {
    updates.contact = payload.contact;
    updates.phone = payload.phone ?? payload.contact;
  }
  if (payload.status != null) updates.status = payload.status;
  if (payload.permissions != null) updates.permissions = payload.permissions;

  const { data: employee, error: empError } = await db
    .public()
    .from('employees')
    .select('clerk_user_id')
    .eq('id', employeeId)
    .single();

  if (empError || !employee?.clerk_user_id) {
    throw new Error(empError?.message ?? 'Employee not found');
  }

  const { error: updateEmpError } = await db
    .public()
    .from('employees')
    .update(updates)
    .eq('id', employeeId);

  if (updateEmpError) {
    throw new Error(updateEmpError.message ?? 'Failed to update employee');
  }

  if (payload.permissions != null) {
    const { error: profileError } = await db
      .core()
      .from('profiles')
      .update({ permissions: payload.permissions, updated_at: new Date().toISOString() })
      .eq('clerk_user_id', employee.clerk_user_id);

    if (profileError) {
      throw new Error(profileError.message ?? 'Employee updated but profile permissions failed');
    }
  }
}
