/**
 * Centralized validation for FarmVault inputs.
 *
 * Rules:
 * - Validate at the boundary (before any DB write).
 * - Throw AppError with a machine-readable code so callers can surface
 *   meaningful messages without guessing the cause.
 * - Never trust the frontend to send only valid values.
 */

import { AppError } from '@/lib/errors/appError';

// ---------------------------------------------------------------------------
// Permission presets — must stay in sync with:
//   • supabase/migrations/20260505000000_fix_permission_preset_constraint.sql
//   • src/lib/employees/permissionPresets.ts
//   • src/config/accessControl.ts
// ---------------------------------------------------------------------------
export const DB_VALID_PERMISSION_PRESETS = [
  // Legacy (keep for existing rows)
  'admin',
  'farm_manager',
  'supervisor',
  'weighing_clerk',
  'finance_officer',
  'inventory_officer',
  'viewer',
  // Current EmployeeRoleKey
  'operations-manager',
  'sales-broker',
  // Current PermissionPresetKey
  'inventory-clerk',
  'finance-clerk',
  'operations-staff',
  'harvest-intake-staff',
  'manager',
  'full-access',
  // Catch-all
  'custom',
] as const;

export type DbPermissionPreset = (typeof DB_VALID_PERMISSION_PRESETS)[number];

const PRESET_SET = new Set<string>(DB_VALID_PERMISSION_PRESETS);

// ---------------------------------------------------------------------------
// User roles
// ---------------------------------------------------------------------------
export const VALID_APP_ROLES = [
  'developer',
  'company-admin',
  'manager',
  'broker',
  'employee',
] as const;

export type ValidAppRole = (typeof VALID_APP_ROLES)[number];

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/**
 * Normalize permission_preset to a value that satisfies the DB constraint.
 * Falls back to 'custom' for any unknown or empty value — the permissions JSONB
 * column already captures the real effective permissions, so this is safe.
 */
export function normalizeToDbPreset(preset: string | null | undefined): DbPermissionPreset {
  if (!preset || !PRESET_SET.has(preset)) return 'custom';
  return preset as DbPermissionPreset;
}

/**
 * Assert companyId is a non-empty string.
 * Throws AppError so the caller surfaces "missing company" instead of a DB FK error.
 */
export function assertCompanyId(
  companyId: string | null | undefined,
  operation: string,
): string {
  if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
    throw new AppError(
      `Operation "${operation}" requires a valid company ID`,
      'MISSING_COMPANY_ID',
      { operation, companyId },
    );
  }
  return companyId.trim();
}

/**
 * Assert email is a plausible email string.
 */
export function assertEmail(email: string | null | undefined, operation: string): string {
  const trimmed = (email ?? '').trim();
  if (!trimmed || !trimmed.includes('@')) {
    throw new AppError(
      `Operation "${operation}" requires a valid email address`,
      'INVALID_EMAIL',
      { operation, email },
    );
  }
  return trimmed.toLowerCase();
}

/**
 * Validate a flat permission map: warn about unknown keys (typos) and strip them.
 * Returns a cleaned copy containing only keys present in the known permission schema.
 */
export function sanitizeFlatPermissions(
  raw: Record<string, boolean> | null | undefined,
  knownKeys: ReadonlyArray<string>,
): Record<string, boolean> {
  if (!raw || typeof raw !== 'object') return {};
  const known = new Set<string>(knownKeys);
  const cleaned: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'boolean') continue;
    if (!known.has(key)) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn(`[validation] Unknown permission key stripped: "${key}"`);
      }
      continue;
    }
    cleaned[key] = value;
  }
  return cleaned;
}
