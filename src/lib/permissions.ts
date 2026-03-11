import type {
  PermissionMap,
  PermissionModule,
  PermissionPresetKey,
} from '@/types';
import { getPresetDefaultPermissions, roleToPreset } from '@/lib/access';

type PermissionMapInput = Partial<PermissionMap> | null | undefined;
type LockedPermissionPath = {
  module: PermissionModule;
  path: string;
  value: boolean;
};

const MODULES: PermissionModule[] = [
  'dashboard',
  'projects',
  'planning',
  'inventory',
  'expenses',
  'operations',
  'harvest',
  'employees',
  'reports',
  'settings',
  'notes',
];

const DEFAULT_MINIMAL_PERMISSIONS: PermissionMap = {
  dashboard: {
    view: true,
    cards: {
      cropStage: true,
      revenue: true,
      expenses: true,
      profitLoss: true,
      budget: true,
    },
  },
  projects: {
    view: false,
    create: false,
    edit: false,
    delete: false,
    accessTabs: {
      overview: false,
      planning: false,
      expenses: false,
      inventory: false,
      operations: false,
      harvest: false,
      reports: false,
    },
  },
  planning: {
    view: false,
    create: false,
    edit: false,
    delete: false,
  },
  inventory: {
    view: false,
    addItem: false,
    editItem: false,
    deleteItem: false,
    restock: false,
    deduct: false,
    categories: false,
    purchases: false,
  },
  expenses: {
    view: false,
    create: false,
    edit: false,
    delete: false,
    approve: false,
  },
  operations: {
    view: false,
    createWorkCard: false,
    assignWork: false,
    recordDailyWork: false,
    approveWorkLog: false,
    markPaid: false,
    viewCost: false,
  },
  harvest: {
    view: false,
    create: false,
    edit: false,
    close: false,
    recordIntake: false,
    viewFinancials: false,
    payPickers: false,
    viewBuyerSection: false,
  },
  employees: {
    view: false,
    create: false,
    edit: false,
    deactivate: false,
  },
  reports: {
    view: false,
    export: false,
  },
  settings: {
    view: false,
    edit: false,
  },
  notes: {
    view: false,
    create: false,
    edit: false,
    delete: false,
  },
};

function clonePermissionMap(map: PermissionMap): PermissionMap {
  return JSON.parse(JSON.stringify(map)) as PermissionMap;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge<T extends Record<string, unknown>>(base: T, override: Record<string, unknown>): T {
  const result: Record<string, unknown> = { ...base };
  Object.keys(override).forEach((key) => {
    const next = override[key];
    if (next === undefined) return;
    const current = result[key];
    if (isPlainObject(current) && isPlainObject(next)) {
      result[key] = deepMerge(current, next);
      return;
    }
    result[key] = next;
  });
  return result as T;
}

export function normalizePermissions(input?: PermissionMapInput): PermissionMap {
  if (!input) return clonePermissionMap(DEFAULT_MINIMAL_PERMISSIONS);
  return deepMerge(clonePermissionMap(DEFAULT_MINIMAL_PERMISSIONS), input as Record<string, unknown>);
}

/**
 * Flatten a nested PermissionMap into flat \"module.path\" keys.
 * Example: permissions.dashboard.view -> \"dashboard.view\".
 * This is used when persisting employee permissions JSON so we have a single flat format.
 */
export function flattenPermissionMap(map: PermissionMap): Record<string, boolean> {
  const flat: Record<string, boolean> = {};

  const walk = (prefix: string, value: unknown) => {
    if (typeof value === 'boolean') {
      flat[prefix] = value;
      return;
    }
    if (!isPlainObject(value)) {
      return;
    }
    Object.entries(value).forEach(([key, v]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      walk(nextPrefix, v);
    });
  };

  walk('', map as unknown as Record<string, unknown>);
  return flat;
}

/**
 * Expand a flat permissions object (\"module.path\" => boolean) back into a PermissionMap.
 * This allows legacy nested PermissionMap consumers to keep working while employees.permissions
 * is stored in flat-key format only.
 */
export function expandFlatPermissions(flat: Record<string, boolean> | null | undefined): PermissionMap | null {
  if (!flat || typeof flat !== 'object') return null;
  const base = clonePermissionMap(DEFAULT_MINIMAL_PERMISSIONS);

  Object.entries(flat).forEach(([key, value]) => {
    if (typeof value !== 'boolean') return;
    const parts = key.split('.');
    if (parts.length === 0) return;

    let cursor: any = base;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (i === parts.length - 1) {
        // Only override when the existing value is boolean or undefined.
        if (typeof cursor[part] === 'boolean' || cursor[part] === undefined) {
          cursor[part] = value;
        }
      } else {
        if (!isPlainObject(cursor[part])) {
          cursor[part] = {};
        }
        cursor = cursor[part];
      }
    }
  });

  return base;
}

const FULL_ACCESS_PERMISSIONS: PermissionMap = {
  dashboard: {
    view: true,
    cards: {
      cropStage: true,
      revenue: true,
      expenses: true,
      profitLoss: true,
      budget: true,
    },
  },
  projects: {
    view: true,
    create: true,
    edit: true,
    delete: true,
    accessTabs: {
      overview: true,
      planning: true,
      expenses: true,
      inventory: true,
      operations: true,
      harvest: true,
      reports: true,
    },
  },
  planning: {
    view: true,
    create: true,
    edit: true,
    delete: true,
  },
  inventory: {
    view: true,
    addItem: true,
    editItem: true,
    deleteItem: true,
    restock: true,
    deduct: true,
    categories: true,
    purchases: true,
  },
  expenses: {
    view: true,
    create: true,
    edit: true,
    delete: true,
    approve: true,
  },
  operations: {
    view: true,
    createWorkCard: true,
    assignWork: true,
    recordDailyWork: true,
    approveWorkLog: true,
    markPaid: true,
    viewCost: true,
  },
  harvest: {
    view: true,
    create: true,
    edit: true,
    close: true,
    recordIntake: true,
    viewFinancials: true,
    payPickers: true,
    viewBuyerSection: true,
  },
  employees: {
    view: true,
    create: true,
    edit: true,
    deactivate: true,
  },
  reports: {
    view: true,
    export: true,
  },
  settings: {
    view: true,
    edit: true,
  },
  notes: {
    view: true,
    create: true,
    edit: true,
    delete: true,
  },
};

const PERMISSION_PRESETS: Record<PermissionPresetKey, PermissionMapInput> = {
  viewer: {
    dashboard: { view: true },
    projects: {
      view: true,
      accessTabs: {
        overview: true,
      },
    },
    planning: { view: true },
    inventory: { view: true },
    expenses: { view: true },
    operations: { view: true },
    harvest: { view: true },
    reports: { view: true, export: false },
    employees: { view: false },
    settings: { view: false },
  },
  'inventory-clerk': {
    dashboard: { view: true },
    inventory: {
      view: true,
      addItem: true,
      editItem: true,
      restock: true,
      deduct: true,
      categories: true,
      purchases: true,
    },
    projects: {
      view: true,
      accessTabs: { inventory: true, overview: true },
    },
    reports: { view: true, export: false },
  },
  'finance-clerk': {
    dashboard: { view: true },
    expenses: {
      view: true,
      create: true,
      edit: true,
      approve: true,
    },
    reports: { view: true, export: true },
    projects: {
      view: true,
      accessTabs: { expenses: true, reports: true, overview: true },
    },
  },
  'operations-staff': {
    dashboard: { view: true },
    operations: {
      view: true,
      recordDailyWork: true,
      viewCost: true,
    },
    projects: {
      view: true,
      accessTabs: { operations: true, overview: true },
    },
  },
  'harvest-intake-staff': {
    dashboard: { view: true },
    harvest: {
      view: true,
      recordIntake: true,
      create: true,
      edit: true,
      viewBuyerSection: true,
    },
    projects: {
      view: true,
      accessTabs: { harvest: true, overview: true },
    },
  },
  manager: {
    dashboard: { view: true },
    operations: {
      view: true,
      recordDailyWork: true,
      assignWork: true,
      approveWorkLog: true,
      markPaid: true,
      viewCost: true,
    },
    inventory: { view: true, deduct: true, restock: true },
    planning: { view: true, edit: true },
    projects: {
      view: true,
      accessTabs: {
        overview: true,
        planning: true,
        inventory: true,
        operations: true,
      },
    },
    expenses: { view: true, create: true, approve: true },
    reports: { view: true, export: true },
  },
  'full-access': FULL_ACCESS_PERMISSIONS,
};

export const PERMISSION_PRESET_OPTIONS: Array<{ key: PermissionPresetKey; label: string }> = [
  { key: 'viewer', label: 'Viewer' },
  { key: 'inventory-clerk', label: 'Inventory Clerk' },
  { key: 'finance-clerk', label: 'Finance Clerk' },
  { key: 'operations-staff', label: 'Operations Staff' },
  { key: 'harvest-intake-staff', label: 'Harvest Intake Staff' },
  { key: 'manager', label: 'Manager' },
  { key: 'full-access', label: 'Full Access' },
];

const ROLE_DEFAULTS: Record<string, PermissionMapInput> = {
  'operations-manager': PERMISSION_PRESETS.manager,
  manager: PERMISSION_PRESETS.manager,
  'sales-broker': {
    dashboard: { view: true },
    expenses: { view: true, create: true, edit: true },
    harvest: {
      view: true,
      create: true,
      edit: true,
      recordIntake: true,
      viewFinancials: true,
      viewBuyerSection: true,
    },
    reports: { view: true, export: true },
  },
  broker: {
    dashboard: { view: true },
    expenses: { view: true, create: true, edit: true },
    harvest: {
      view: true,
      create: true,
      edit: true,
      viewFinancials: true,
      viewBuyerSection: true,
    },
    reports: { view: true, export: true },
  },
  'logistics-driver': {
    dashboard: { view: true },
    harvest: { view: true, recordIntake: true },
    projects: { view: true, accessTabs: { harvest: true, overview: true } },
  },
  driver: {
    dashboard: { view: true },
    harvest: { view: true, recordIntake: true },
    projects: { view: true, accessTabs: { harvest: true, overview: true } },
  },
};

const ROLE_LOCKED_PERMISSIONS: Record<string, LockedPermissionPath[]> = {
  manager: [
    { module: 'operations', path: 'view', value: true },
    { module: 'operations', path: 'recordDailyWork', value: true },
    { module: 'operations', path: 'assignWork', value: true },
    { module: 'operations', path: 'approveWorkLog', value: true },
    { module: 'operations', path: 'markPaid', value: true },
    { module: 'operations', path: 'viewCost', value: true },
  ],
  'operations-manager': [
    { module: 'operations', path: 'view', value: true },
    { module: 'operations', path: 'recordDailyWork', value: true },
    { module: 'operations', path: 'assignWork', value: true },
    { module: 'operations', path: 'approveWorkLog', value: true },
    { module: 'operations', path: 'markPaid', value: true },
    { module: 'operations', path: 'viewCost', value: true },
  ],
};

function normalizeRoleKey(role?: string | null): string | null {
  if (!role) return null;
  return role.toLowerCase();
}

function getRoleLockedPermissions(role?: string | null): LockedPermissionPath[] {
  const roleKey = normalizeRoleKey(role);
  if (!roleKey) return [];
  return ROLE_LOCKED_PERMISSIONS[roleKey] ?? [];
}

export function isPermissionLockedForRole(
  role: string | null | undefined,
  module: PermissionModule,
  actionPath: string
): boolean {
  return getRoleLockedPermissions(role).some(
    (lock) => lock.module === module && lock.path === actionPath
  );
}

function applyRoleLockedPermissions(
  permissions: PermissionMap,
  role?: string | null
): PermissionMap {
  const locks = getRoleLockedPermissions(role);
  if (locks.length === 0) return permissions;

  let next = permissions;
  locks.forEach((lock) => {
    next = setPermissionValue(next, lock.module, lock.path, lock.value);
  });
  return next;
}

export function getDefaultPermissions(): PermissionMap {
  return clonePermissionMap(DEFAULT_MINIMAL_PERMISSIONS);
}

export function getFullAccessPermissions(): PermissionMap {
  return clonePermissionMap(FULL_ACCESS_PERMISSIONS);
}

export function getPresetPermissions(presetKey: PermissionPresetKey): PermissionMap {
  return normalizePermissions(PERMISSION_PRESETS[presetKey]);
}

export function getRoleDefaultPermissions(role?: string | null): PermissionMap {
  if (!role) return getDefaultPermissions();
  const legacyKey = role.toLowerCase();
  const preset = ROLE_DEFAULTS[legacyKey];
  if (preset) {
    const normalized = normalizePermissions(preset);
    return applyRoleLockedPermissions(normalized, role);
  }
  const rolePreset = roleToPreset(role);
  const presetPerms = getPresetDefaultPermissions(rolePreset);
  return applyRoleLockedPermissions(presetPerms, role);
}

export function resolvePermissions(
  role?: string | null,
  permissionOverrides?: PermissionMapInput
): PermissionMap {
  const roleDefaults = getRoleDefaultPermissions(role);
  if (!permissionOverrides) return roleDefaults;
  const merged = deepMerge(roleDefaults, permissionOverrides as Record<string, unknown>);
  return applyRoleLockedPermissions(merged, role);
}

export function setPermissionValue(
  current: PermissionMap,
  module: PermissionModule,
  actionPath: string,
  value: boolean
): PermissionMap {
  const next = clonePermissionMap(current);
  const target = next[module] as Record<string, unknown>;
  const segments = actionPath.split('.');
  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i];
    const nested = cursor[seg];
    if (!isPlainObject(nested)) {
      cursor[seg] = {};
    }
    cursor = cursor[seg] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
  return next;
}

function readNestedBool(source: Record<string, unknown>, path: string): boolean {
  const segments = path.split('.');
  let cursor: unknown = source;
  for (let i = 0; i < segments.length; i += 1) {
    if (!isPlainObject(cursor)) return false;
    cursor = cursor[segments[i]];
  }
  return Boolean(cursor);
}

export function canByPermissionMap(
  permissionMap: PermissionMap | null | undefined,
  module: PermissionModule,
  actionPath?: string
): boolean {
  const permissions = normalizePermissions(permissionMap);
  const modulePermissions = permissions[module] as unknown as Record<string, unknown>;

  if (!actionPath || actionPath === 'view') {
    return Boolean(modulePermissions.view);
  }

  return readNestedBool(modulePermissions, actionPath);
}

export function canSeeByPermissionMap(
  permissionMap: PermissionMap | null | undefined,
  module: PermissionModule,
  componentPath: string
): boolean {
  return canByPermissionMap(permissionMap, module, componentPath);
}

const PATH_TO_MODULE: Array<{ prefix: string; module: PermissionModule }> = [
  { prefix: '/projects/', module: 'projects' },
  { prefix: '/projects', module: 'projects' },
  { prefix: '/suppliers', module: 'projects' },
  { prefix: '/notes/', module: 'notes' },
  { prefix: '/notes', module: 'notes' },
  { prefix: '/records/', module: 'notes' },
  { prefix: '/records', module: 'notes' },
  { prefix: '/developer/records', module: 'notes' },
  { prefix: '/crop-stages', module: 'planning' },
  { prefix: '/challenges', module: 'planning' },
  { prefix: '/inventory', module: 'inventory' },
  { prefix: '/expenses', module: 'expenses' },
  { prefix: '/operations', module: 'operations' },
  { prefix: '/manager/operations', module: 'operations' },
  { prefix: '/harvest', module: 'harvest' },
  { prefix: '/harvest-sales', module: 'harvest' },
  { prefix: '/harvest-collections', module: 'harvest' },
  { prefix: '/staff/harvest-collections', module: 'harvest' },
  { prefix: '/staff/inventory', module: 'inventory' },
  { prefix: '/staff/expenses', module: 'expenses' },
  { prefix: '/staff/operations', module: 'operations' },
  { prefix: '/staff/reports', module: 'reports' },
  { prefix: '/broker/harvest-sales', module: 'harvest' },
  { prefix: '/broker/harvest', module: 'harvest' },
  { prefix: '/broker/expenses', module: 'expenses' },
  { prefix: '/driver', module: 'harvest' },
  { prefix: '/reports', module: 'reports' },
  { prefix: '/employees', module: 'employees' },
  { prefix: '/billing', module: 'settings' },
  { prefix: '/settings', module: 'settings' },
  { prefix: '/dashboard', module: 'dashboard' },
  { prefix: '/staff', module: 'dashboard' },
  { prefix: '/broker', module: 'dashboard' },
];

export function getModuleForPath(path: string): PermissionModule | null {
  const normalized = path.replace(/\/+/g, '/');
  for (let i = 0; i < PATH_TO_MODULE.length; i += 1) {
    const { prefix, module } = PATH_TO_MODULE[i];
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return module;
    }
  }
  return null;
}

export function getAllPermissionModules(): PermissionModule[] {
  return [...MODULES];
}
