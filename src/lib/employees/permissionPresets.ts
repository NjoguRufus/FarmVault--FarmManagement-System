/**
 * Permission presets per role. Each preset is a flat map of permission key → true.
 * Used when creating/inviting employees or when role has no DB template.
 */
import { PERMISSION_KEYS, ROLE_DEFAULT_PERMISSIONS } from '@/config/accessControl';
import type { EmployeeRoleKey } from '@/config/accessControl';

export type PermissionPresetKey = EmployeeRoleKey;

/** Build a Record<key, true> from an array of keys. */
function toMap(keys: readonly string[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  keys.forEach((k) => { out[k] = true; });
  return out;
}

/** All permissions enabled (admin). */
export const PRESET_ADMIN: Record<string, boolean> = toMap([...PERMISSION_KEYS]);

/** Presets by role key. */
export const PERMISSION_PRESETS: Record<PermissionPresetKey, Record<string, boolean>> = {
  admin: PRESET_ADMIN,
  farm_manager: toMap(ROLE_DEFAULT_PERMISSIONS.farm_manager),
  supervisor: toMap(ROLE_DEFAULT_PERMISSIONS.supervisor),
  weighing_clerk: toMap(ROLE_DEFAULT_PERMISSIONS.weighing_clerk),
  finance_officer: toMap(ROLE_DEFAULT_PERMISSIONS.finance_officer),
  inventory_officer: toMap(ROLE_DEFAULT_PERMISSIONS.inventory_officer),
  viewer: toMap(ROLE_DEFAULT_PERMISSIONS.viewer),
  custom: {},
};

export function getPresetPermissions(preset: PermissionPresetKey): Record<string, boolean> {
  return { ...PERMISSION_PRESETS[preset] };
}
