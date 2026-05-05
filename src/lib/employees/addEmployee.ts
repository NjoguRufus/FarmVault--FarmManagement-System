/**
 * Add/invite an employee: validate inputs, insert into employees,
 * assign preset, assign project access, log activity.
 */
import { logger } from '@/lib/logger';
import { db } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { getPresetPermissions } from '@/lib/employees/permissionPresets';
import { flattenPermissionMap } from '@/lib/permissions';
import { logError } from '@/lib/errors/appError';
import { assertCompanyId, assertEmail, normalizeToDbPreset } from '@/lib/validation';
import type { EmployeeRoleKey } from '@/config/accessControl';

export interface AddEmployeeInput {
  company_id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  role?: EmployeeRoleKey | null;
  department?: string | null;
  permission_preset?: string | null;
  permissions?: Record<string, boolean> | null;
  project_ids?: string[];
  created_by_clerk_id?: string | null;
}

export async function addEmployee(input: AddEmployeeInput): Promise<{ employee_id: string }> {
  // --- Validate inputs at the boundary (before any DB write) ---
  const companyId = assertCompanyId(input.company_id, 'addEmployee');
  const email = assertEmail(input.email, 'addEmployee');
  const fullName = input.full_name?.trim() || email;

  const { data: existing, error: lookupError } = await db
    .public()
    .from('employees')
    .select('id')
    .eq('company_id', companyId)
    .ilike('email', email)
    .maybeSingle();

  if (lookupError) {
    throw new Error(`Duplicate-check failed: ${lookupError.message}`);
  }
  if (existing) {
    throw new Error('An employee with this email already exists in this company.');
  }

  // Resolve permission preset — normalizeToDbPreset guarantees a DB-valid value
  const preset = normalizeToDbPreset(input.permission_preset ?? 'custom');
  const nestedPermissions = input.permissions ?? getPresetPermissions(preset as EmployeeRoleKey);
  const flatPermissions = flattenPermissionMap(nestedPermissions as Parameters<typeof flattenPermissionMap>[0]);

  const employeeInsertPayload = {
    company_id: companyId,
    clerk_user_id: null,
    email,
    full_name: fullName,
    phone: input.phone ?? null,
    role: input.role ?? preset,
    department: input.department ?? null,
    permission_preset: preset,
    permissions: flatPermissions,
    status: 'invited' as const,
  };

  if (import.meta.env.DEV) {
    logger.log('[addEmployee] employees.insert payload', employeeInsertPayload);
  }

  const { data: inserted, error: insertError } = await db
    .public()
    .from('employees')
    .insert(employeeInsertPayload)
    .select('id')
    .single();

  if (insertError) {
    throw new Error(
      insertError.message?.includes('employees_permission_preset_check')
        ? `Invalid permission preset "${preset}" — contact support.`
        : (insertError.message ?? 'Failed to create employee'),
    );
  }

  const employeeId = inserted?.id;
  if (!employeeId) throw new Error('Insert succeeded but no employee ID returned');

  if (input.project_ids?.length) {
    const { error: accessError } = await db
      .public()
      .from('employee_project_access')
      .insert(
        input.project_ids.map((project_id) => ({
          company_id: companyId,
          employee_id: employeeId,
          project_id,
        })),
      );
    if (accessError) {
      logError(accessError, {
        operation: 'addEmployee.project_access',
        companyId,
        employeeId,
      });
    }
  }

  // Activity log — non-blocking; failure must not roll back the employee creation
  supabase
    .rpc('log_employee_activity', {
      p_company_id: companyId,
      p_actor_employee_id: input.created_by_clerk_id ?? null,
      p_target_employee_id: employeeId,
      p_action: 'employee_invited',
      p_module: 'employees',
      p_metadata: { email, full_name: fullName, role: input.role ?? preset },
    })
    .then(({ error }) => {
      if (error) {
        logError(error, { operation: 'addEmployee.log_activity', companyId, employeeId });
      }
    });

  return { employee_id: employeeId };
}
