import type { User } from '@/types';

/** Canonical roles aligned with `public.employees.role` (ADMIN | WORKER | BROKER) plus app-level company admins. */
export type CanonicalEmployeeRole = 'ADMIN' | 'WORKER' | 'BROKER';

const ADMIN_LABELS = new Set([
  'admin',
  'administrator',
  'owner',
  'company_admin',
  'company-admin',
  'super_admin',
  'super-admin',
]);

/** True when `employees.role` (or legacy invite role) is a sales broker. */
export function isBrokerEmployeeRoleString(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const l = String(raw).trim().toLowerCase();
  return l === 'broker' || l === 'sales-broker' || l === 'sales_broker';
}

/** Map raw `employees.role` to canonical routing role. */
export function mapEmployeeRoleToCanonical(raw: string | null | undefined): CanonicalEmployeeRole {
  if (raw != null && String(raw).trim() !== '' && isBrokerEmployeeRoleString(raw)) {
    return 'BROKER';
  }
  const l = (raw ?? '').toString().trim().toLowerCase();
  if (ADMIN_LABELS.has(l)) return 'ADMIN';
  return 'WORKER';
}

/** Company / owner session from core membership (not `employees.role`). */
export function isCompanyAdminAppUser(user: User | null | undefined): boolean {
  if (!user?.role) return false;
  const r = user.role.toString().trim().toLowerCase();
  if (r === 'developer') return false;
  const compact = r.replace(/[-_\s]/g, '');
  return (
    r === 'owner' ||
    r === 'company_admin' ||
    r === 'company-admin' ||
    r === 'admin' ||
    r === 'super_admin' ||
    compact === 'companyadmin' ||
    compact === 'superadmin'
  );
}
