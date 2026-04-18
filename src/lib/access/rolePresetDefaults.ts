/**
 * Role preset defaults for FarmVault.
 * Roles are presets/templates only; effective access is permission-driven.
 * Old DB role values are mapped to these presets for backward compatibility.
 */

import type { PermissionMap } from '@/types';

export const ROLE_PRESET_KEYS = [
  'administrator',
  'operations_manager',
  'inventory_staff',
  'harvest_staff',
  'finance_staff',
  'custom',
] as const;

export type RolePresetKey = (typeof ROLE_PRESET_KEYS)[number];

/** Old/legacy role strings that may exist in DB. Map to RolePresetKey for defaults. */
export const LEGACY_ROLE_TO_PRESET: Record<string, RolePresetKey> = {
  admin: 'administrator',
  administrator: 'administrator',
  company_admin: 'administrator',
  'company-admin': 'administrator',
  farm_manager: 'operations_manager',
  supervisor: 'operations_manager',
  manager: 'operations_manager',
  'operations-manager': 'operations_manager',
  weighing_clerk: 'harvest_staff',
  harvest_intake_staff: 'harvest_staff',
  'harvest-intake-staff': 'harvest_staff',
  inventory_officer: 'inventory_staff',
  'inventory-clerk': 'inventory_staff',
  finance_officer: 'finance_staff',
  'finance-clerk': 'finance_staff',
  viewer: 'custom',
  custom: 'custom',
  logistics_driver: 'harvest_staff',
  'logistics-driver': 'harvest_staff',
  driver: 'harvest_staff',
  sales_broker: 'harvest_staff',
  'sales-broker': 'harvest_staff',
  broker: 'harvest_staff',
  worker: 'operations_manager',
  'operations-staff': 'operations_manager',
  'full-access': 'administrator',
};

export const ROLE_PRESET_LABELS: Record<RolePresetKey, string> = {
  administrator: 'Administrator',
  operations_manager: 'Operations Manager',
  inventory_staff: 'Inventory Staff',
  harvest_staff: 'Harvest Staff',
  finance_staff: 'Finance Staff',
  custom: 'Custom',
};

/** Default permission map per preset. Used as template; overrides stored in employee.permissions. */
function fullAccess(): PermissionMap {
  return {
    dashboard: { view: true, cards: { cropStage: true, revenue: true, expenses: true, profitLoss: true, budget: true } },
    projects: { view: true, create: true, edit: true, delete: true, accessTabs: { overview: true, planning: true, expenses: true, inventory: true, operations: true, harvest: true, reports: true } },
    planning: { view: true, create: true, edit: true, delete: true },
    inventory: { view: true, addItem: true, editItem: true, deleteItem: true, restock: true, deduct: true, categories: true, purchases: true },
    expenses: { view: true, create: true, edit: true, delete: true, approve: true },
    operations: { view: true, createWorkCard: true, assignWork: true, recordDailyWork: true, approveWorkLog: true, markPaid: true, viewCost: true },
    harvest: { view: true, create: true, edit: true, close: true, recordIntake: true, viewFinancials: true, payPickers: true, viewBuyerSection: true },
    employees: { view: true, create: true, edit: true, deactivate: true },
    reports: { view: true, export: true },
    settings: { view: true, edit: true },
    notes: { view: true, create: true, edit: true, delete: true },
  };
}

function minimal(): PermissionMap {
  return {
    dashboard: { view: false, cards: { cropStage: false, revenue: false, expenses: false, profitLoss: false, budget: false } },
    projects: { view: false, create: false, edit: false, delete: false, accessTabs: { overview: false, planning: false, expenses: false, inventory: false, operations: false, harvest: false, reports: false } },
    planning: { view: false, create: false, edit: false, delete: false },
    inventory: { view: false, addItem: false, editItem: false, deleteItem: false, restock: false, deduct: false, categories: false, purchases: false },
    expenses: { view: false, create: false, edit: false, delete: false, approve: false },
    operations: { view: false, createWorkCard: false, assignWork: false, recordDailyWork: false, approveWorkLog: false, markPaid: false, viewCost: false },
    harvest: { view: false, create: false, edit: false, close: false, recordIntake: false, viewFinancials: false, payPickers: false, viewBuyerSection: false },
    employees: { view: false, create: false, edit: false, deactivate: false },
    reports: { view: false, export: false },
    settings: { view: false, edit: false },
    notes: { view: false, create: false, edit: false, delete: false },
  };
}

export const ROLE_PRESET_DEFAULT_PERMISSIONS: Record<RolePresetKey, PermissionMap> = {
  administrator: fullAccess(),
  operations_manager: {
    ...minimal(),
    operations: { view: true, createWorkCard: true, assignWork: true, recordDailyWork: true, approveWorkLog: true, markPaid: true, viewCost: true },
    inventory: { view: true, addItem: true, editItem: false, deleteItem: false, restock: true, deduct: true, categories: false, purchases: false },
    projects: { view: true, create: false, edit: false, delete: false, accessTabs: { overview: true, planning: false, expenses: false, inventory: true, operations: true, harvest: false, reports: false } },
  },
  inventory_staff: {
    ...minimal(),
    inventory: { view: true, addItem: true, editItem: true, deleteItem: true, restock: true, deduct: true, categories: true, purchases: false },
    projects: { view: true, create: false, edit: false, delete: false, accessTabs: { overview: true, inventory: true, planning: false, expenses: false, operations: false, harvest: false, reports: false } },
    reports: { view: true, export: false },
  },
  harvest_staff: {
    ...minimal(),
    harvest: { view: true, create: true, edit: true, close: true, recordIntake: true, viewFinancials: false, payPickers: false, viewBuyerSection: false },
    projects: { view: true, create: false, edit: false, delete: false, accessTabs: { overview: true, harvest: true, planning: false, expenses: false, inventory: false, operations: false, reports: false } },
  },
  finance_staff: {
    ...minimal(),
    harvest: { view: true, create: false, edit: false, close: false, recordIntake: false, viewFinancials: true, payPickers: true, viewBuyerSection: true },
    expenses: { view: true, create: true, edit: true, delete: false, approve: true },
    reports: { view: true, export: true },
    projects: { view: true, create: false, edit: false, delete: false, accessTabs: { overview: true, expenses: true, reports: true, planning: false, inventory: false, operations: false, harvest: false } },
  },
  custom: minimal(),
};

/**
 * Map legacy DB role string to RolePresetKey for default permissions.
 * Preserves unknown roles as 'custom' so we don't break existing data.
 */
export function roleToPreset(role: string | null | undefined): RolePresetKey {
  if (!role || typeof role !== 'string') return 'custom';
  const key = role.trim().toLowerCase().replace(/-/g, '_');
  return LEGACY_ROLE_TO_PRESET[key] ?? 'custom';
}

/** Map preset key to legacy DB role string for saving (backward-safe). */
export const PRESET_TO_LEGACY_ROLE: Record<RolePresetKey, string> = {
  administrator: 'admin',
  operations_manager: 'operations-manager',
  inventory_staff: 'inventory_officer',
  harvest_staff: 'weighing_clerk',
  finance_staff: 'finance_officer',
  custom: 'custom',
};

export function presetToLegacyRole(preset: RolePresetKey): string {
  return PRESET_TO_LEGACY_ROLE[preset] ?? 'custom';
}

/**
 * Default permissions for a role preset (no overrides).
 */
export function getPresetDefaultPermissions(preset: RolePresetKey): PermissionMap {
  return JSON.parse(JSON.stringify(ROLE_PRESET_DEFAULT_PERMISSIONS[preset])) as PermissionMap;
}
