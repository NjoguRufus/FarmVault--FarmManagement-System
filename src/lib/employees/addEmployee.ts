import { logger } from "@/lib/logger";
/**
 * Add/invite an employee: insert into employees, assign preset, project access, log activity.
 * Uses Supabase only for DB; caller must be authenticated via Clerk (token sent by client).
 */
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { getPresetPermissions } from '@/lib/employees/permissionPresets';
import { flattenPermissionMap } from '@/lib/permissions';
import type { EmployeeRoleKey } from '@/config/accessControl';

export interface AddEmployeeInput {
  company_id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  role?: EmployeeRoleKey | null;
  department?: string | null;
  permission_preset?: EmployeeRoleKey | null;
  permissions?: Record<string, boolean> | null;
  project_ids?: string[];
  created_by_clerk_id?: string | null;
}

export async function addEmployee(input: AddEmployeeInput): Promise<{ employee_id: string }> {
  const companyId = input.company_id;
  const email = input.email?.trim();
  const fullName = input.full_name?.trim() || email;

  if (!companyId || !email) {
    throw new Error('Company ID and email are required.');
  }

  const { data: existing } = await db
    .public()
    .from('employees')
    .select('id')
    .eq('company_id', companyId)
    .ilike('email', email)
    .maybeSingle();

  if (existing) {
    throw new Error('An employee with this email already exists in this company.');
  }

  const preset = input.permission_preset ?? 'viewer';
  const nestedPermissions = (input.permissions ?? getPresetPermissions(preset)) as any;
  const permissions = flattenPermissionMap(nestedPermissions);

  const employeeInsertPayload = {
    company_id: companyId,
    clerk_user_id: null,
    email,
    full_name: fullName,
    phone: input.phone ?? null,
    role: input.role ?? preset,
    department: input.department ?? null,
    permission_preset: input.permission_preset ?? preset,
    permissions,
    status: 'invited' as const,
  };

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    logger.log('[addEmployee] employees.insert payload', employeeInsertPayload);
    if ('name' in (employeeInsertPayload as any) || 'created_by' in (employeeInsertPayload as any)) {
      // eslint-disable-next-line no-console
      console.warn('[addEmployee] Forbidden employees columns detected in insert payload', employeeInsertPayload);
    }
  }

  const { data: inserted, error: insertError } = await db
    .public()
    .from('employees')
    .insert(employeeInsertPayload)
    .select('id')
    .single();

  if (insertError) throw new Error(insertError.message ?? 'Failed to create employee');
  const employeeId = inserted?.id;
  if (!employeeId) throw new Error('Insert succeeded but no employee id returned');

  if (input.project_ids?.length) {
    await db
      .public()
      .from('employee_project_access')
      .insert(
        input.project_ids.map((project_id) => ({
          company_id: companyId,
          employee_id: employeeId,
          project_id,
        }))
      );
  }

  try {
    await supabase.rpc('log_employee_activity', {
      p_company_id: companyId,
      p_actor_employee_id: input.created_by_clerk_id ?? null,
      p_target_employee_id: employeeId,
      p_action: 'employee_invited',
      p_module: 'employees',
      p_metadata: { email, full_name: fullName, role: input.role ?? preset },
    });
  } catch {
    // Non-blocking; employee was created
  }

  return { employee_id: employeeId };
}
