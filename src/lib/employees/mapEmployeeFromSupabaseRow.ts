import type { Employee, PermissionMap } from '@/types';
import { resolveUserDisplayName } from '@/lib/userDisplayName';

/** Map a `public.employees` row to the app `Employee` type (same shape as AuthContext). */
export function mapEmployeeFromSupabaseRow(row: Record<string, unknown>): Employee {
  const fullName = row.full_name != null ? String(row.full_name) : undefined;
  return {
    id: String(row.id ?? ''),
    companyId: String(row.company_id ?? ''),
    name: resolveUserDisplayName({
      profileDisplayName: fullName,
      email: row.email != null ? String(row.email) : undefined,
    }),
    fullName,
    email: row.email != null ? String(row.email) : undefined,
    phone: row.phone != null ? String(row.phone) : undefined,
    contact: row.phone != null ? String(row.phone) : undefined,
    role: (row.role as string | null | undefined) ?? null,
    employeeRole: (row.role as string | null | undefined) ?? null,
    department: row.department != null ? String(row.department) : undefined,
    status: (row.status as Employee['status']) ?? 'active',
    permissions: row.permissions as PermissionMap | undefined,
    joinDate: row.created_at ?? undefined,
    createdAt: row.created_at ?? undefined,
    authUserId: row.clerk_user_id != null ? String(row.clerk_user_id) : undefined,
  };
}
