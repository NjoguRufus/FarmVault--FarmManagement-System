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
  'operations-manager': toMap(ROLE_DEFAULT_PERMISSIONS['operations-manager']),
  'sales-broker': toMap(ROLE_DEFAULT_PERMISSIONS['sales-broker']),
  custom: {},
};

export function getPresetPermissions(preset: PermissionPresetKey): Record<string, boolean> {
  return { ...PERMISSION_PRESETS[preset] };
}
