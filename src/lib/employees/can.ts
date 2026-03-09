/**
 * Permission check: returns true if the permission key is enabled in the given permissions map.
 * Used with employee.permissions JSON (module.action keys).
 */
export function can(
  permissions: Record<string, boolean> | null | undefined,
  permissionKey: string
): boolean {
  if (!permissions || typeof permissions !== 'object') return false;
  return Boolean(permissions[permissionKey]);
}
