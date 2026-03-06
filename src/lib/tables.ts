/**
 * Legacy table name constants. Prefer db.<schema>().from('<table>') from @/lib/db
 * so that schema is always explicit (core, projects, public, etc.).
 */
export const TABLES = {
  COMPANIES: 'companies',
  COMPANY_MEMBERS: 'company_members',
  EMPLOYEES: 'employees',
  EXPENSES: 'expenses',
  FARMS: 'farms',
  HARVESTS: 'harvests',
  INVENTORY_ITEMS: 'inventory_items',
  PLATFORM_ADMINS: 'platform_admins',
  PROFILES: 'profiles',
  PROJECTS: 'projects',
  SUBSCRIPTION_PAYMENTS: 'subscription_payments',
  COMPANY_SUBSCRIPTIONS: 'billing.company_subscriptions',
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES] | string;

