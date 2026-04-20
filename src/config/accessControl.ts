/**
 * Employee Management & Access Control — permission keys and role templates.
 * All keys follow module.action format. Multi-company: isolate by company_id.
 */

export const EMPLOYEE_ROLES = [
  'admin',
  'operations-manager',
  'sales-broker',
  'custom',
] as const;

export type EmployeeRoleKey = (typeof EMPLOYEE_ROLES)[number];

export const EMPLOYEE_ROLE_LABELS: Record<EmployeeRoleKey, string> = {
  admin: 'Administrator',
  'operations-manager': 'Operations Manager',
  'sales-broker': 'Sales (Broker)',
  custom: 'Add Role',
};

/** All permission keys (module.action). Must match DB seed in migration. */
export const PERMISSION_KEYS = [
  'dashboard.view',
  'projects.view',
  'projects.create',
  'projects.edit',
  'projects.delete',
  'crop_monitoring.view',
  'crop_monitoring.progress',
  'crop_monitoring.edit',
  'records.view',
  'records.create',
  'records.edit',
  'inventory.view',
  'inventory.create',
  'inventory.edit',
  'inventory.delete',
  'suppliers.view',
  'suppliers.create',
  'suppliers.edit',
  'expenses.view',
  'expenses.create',
  'expenses.edit',
  'expenses.approve',
  'operations.view',
  'operations.createWorkCard',
  'operations.assignWork',
  'operations.recordDailyWork',
  'operations.approveWorkLog',
  'operations.markPaid',
  'operations.viewCost',
  'harvest.view',
  'harvest.create',
  'harvest.edit',
  'harvest_collections.view',
  'harvest_collections.create',
  'harvest_collections.edit',
  'harvest_collections.delete',
  'harvest_collections.confirm',
  'harvest_collections.pay',
  'harvest_collections.financials',
  'harvest_collections.view_picker_entries',
  'logistics.view',
  'logistics.create',
  'logistics.edit',
  'employees.view',
  'employees.create',
  'employees.edit',
  'employees.suspend',
  'employees.permissions.manage',
  'reports.view',
  'reports.export',
  'financials.view',
  'financials.manage',
  'settings.view',
  'settings.manage',
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/** Group permissions by module for UI. */
export const PERMISSION_GROUPS: { module: string; label: string; keys: PermissionKey[] }[] = [
  { module: 'dashboard', label: 'Dashboard', keys: ['dashboard.view'] },
  { module: 'projects', label: 'Projects', keys: ['projects.view', 'projects.create', 'projects.edit', 'projects.delete'] },
  { module: 'crop_monitoring', label: 'Crop Monitoring', keys: ['crop_monitoring.view', 'crop_monitoring.progress', 'crop_monitoring.edit'] },
  { module: 'records', label: 'Records', keys: ['records.view', 'records.create', 'records.edit'] },
  { module: 'inventory', label: 'Inventory', keys: ['inventory.view', 'inventory.create', 'inventory.edit', 'inventory.delete'] },
  { module: 'suppliers', label: 'Suppliers', keys: ['suppliers.view', 'suppliers.create', 'suppliers.edit'] },
  { module: 'expenses', label: 'Expenses', keys: ['expenses.view', 'expenses.create', 'expenses.edit', 'expenses.approve'] },
  {
    module: 'operations',
    label: 'Operations',
    keys: [
      'operations.view',
      'operations.createWorkCard',
      'operations.assignWork',
      'operations.recordDailyWork',
      'operations.approveWorkLog',
      'operations.markPaid',
      'operations.viewCost',
    ],
  },
  { module: 'harvest', label: 'Harvest', keys: ['harvest.view', 'harvest.create', 'harvest.edit'] },
  {
    module: 'harvest_collections',
    label: 'Harvest Collections',
    keys: [
      'harvest_collections.view',
      'harvest_collections.create',
      'harvest_collections.edit',
      'harvest_collections.delete',
      'harvest_collections.confirm',
      'harvest_collections.pay',
      'harvest_collections.financials',
      'harvest_collections.view_picker_entries',
    ],
  },
  { module: 'logistics', label: 'Logistics', keys: ['logistics.view', 'logistics.create', 'logistics.edit'] },
  {
    module: 'employees',
    label: 'Employees',
    keys: ['employees.view', 'employees.create', 'employees.edit', 'employees.suspend', 'employees.permissions.manage'],
  },
  { module: 'reports', label: 'Reports', keys: ['reports.view', 'reports.export'] },
  { module: 'financials', label: 'Financials', keys: ['financials.view', 'financials.manage'] },
  { module: 'settings', label: 'Settings', keys: ['settings.view', 'settings.manage'] },
];

/** Default permission keys per role (used when no DB template exists). */
export const ROLE_DEFAULT_PERMISSIONS: Record<EmployeeRoleKey, PermissionKey[]> = {
  admin: [...PERMISSION_KEYS],
  'operations-manager': [
    'dashboard.view',
    'projects.view',
    'projects.create',
    'projects.edit',
    'projects.delete',
    'operations.view',
    'operations.createWorkCard',
    'operations.assignWork',
    'operations.recordDailyWork',
    'operations.approveWorkLog',
    'operations.markPaid',
    'operations.viewCost',
    'inventory.view',
    'inventory.create',
    'inventory.edit',
    'inventory.delete',
    'harvest.view',
    'harvest.create',
    'harvest.edit',
    'harvest_collections.view',
    'harvest_collections.create',
    'harvest_collections.edit',
    'harvest_collections.delete',
    'harvest_collections.confirm',
    'harvest_collections.pay',
    'records.view',
    'records.create',
    'records.edit',
  ],
  'sales-broker': [
    // Broker routing is role-based; permissions here are “supporting access” for shared areas.
    'dashboard.view',
    'harvest_collections.view',
    'expenses.view',
    'expenses.create',
  ],
  custom: [],
};

export const EMPLOYEE_STATUSES = ['active', 'suspended', 'archived', 'inactive', 'on-leave'] as const;
export type EmployeeStatusKey = (typeof EMPLOYEE_STATUSES)[number];
