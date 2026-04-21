import { matchPath } from 'react-router-dom';

export interface RouteAnalyticsMeta {
  page_name: string;
  module_name: string;
}

type RouteRule = {
  pattern: string;
  end?: boolean;
  meta: RouteAnalyticsMeta;
};

/**
 * First match wins (most specific routes should appear first).
 */
const ROUTE_RULES: RouteRule[] = [
  { pattern: '/onboarding/company', end: true, meta: { page_name: 'Onboarding', module_name: 'onboarding' } },
  { pattern: '/onboarding', end: true, meta: { page_name: 'Onboarding', module_name: 'onboarding' } },
  { pattern: '/pending-approval', end: true, meta: { page_name: 'Pending approval', module_name: 'onboarding' } },
  { pattern: '/start-fresh', end: true, meta: { page_name: 'Start fresh', module_name: 'onboarding' } },
  { pattern: '/developer/companies/:companyId', end: true, meta: { page_name: 'Developer company details', module_name: 'developer' } },
  { pattern: '/developer/companies', end: true, meta: { page_name: 'Developer companies', module_name: 'developer' } },
  { pattern: '/developer/users', end: true, meta: { page_name: 'Developer users', module_name: 'developer' } },
  { pattern: '/developer/settings', end: true, meta: { page_name: 'Developer settings', module_name: 'developer' } },
  { pattern: '/developer/subscription-analytics', end: true, meta: { page_name: 'Developer subscription analytics', module_name: 'developer' } },
  { pattern: '/developer/finances', end: true, meta: { page_name: 'Developer finances', module_name: 'developer' } },
  { pattern: '/developer/farmvault-expenses', end: true, meta: { page_name: 'Developer expenses', module_name: 'developer' } },
  { pattern: '/developer/feedback-inbox', end: true, meta: { page_name: 'Developer feedback', module_name: 'developer' } },
  { pattern: '/developer/audit-logs', end: true, meta: { page_name: 'Developer audit logs', module_name: 'developer' } },
  { pattern: '/developer/email-center', end: true, meta: { page_name: 'Developer email center', module_name: 'developer' } },
  { pattern: '/developer', end: true, meta: { page_name: 'Developer home', module_name: 'developer' } },
  { pattern: '/admin/companies', end: true, meta: { page_name: 'Admin companies', module_name: 'developer' } },
  { pattern: '/admin/users/pending', end: true, meta: { page_name: 'Admin pending users', module_name: 'developer' } },
  { pattern: '/admin/users', end: true, meta: { page_name: 'Admin users', module_name: 'developer' } },
  { pattern: '/admin/analytics/subscriptions', end: true, meta: { page_name: 'Admin subscription analytics', module_name: 'developer' } },
  { pattern: '/staff/staff-dashboard', end: true, meta: { page_name: 'Staff dashboard', module_name: 'dashboard' } },
  { pattern: '/staff/harvest', end: true, meta: { page_name: 'Harvest', module_name: 'harvest' } },
  { pattern: '/staff/harvest-collections/:projectId', end: true, meta: { page_name: 'Harvest collections', module_name: 'harvest' } },
  { pattern: '/staff/harvest-collections', end: true, meta: { page_name: 'Harvest collections', module_name: 'harvest' } },
  { pattern: '/staff/tomato-harvest/:projectId/session/:sessionId', end: true, meta: { page_name: 'Tomato harvest session', module_name: 'harvest' } },
  { pattern: '/staff/tomato-harvest/:projectId', end: true, meta: { page_name: 'Tomato harvest', module_name: 'harvest' } },
  { pattern: '/staff/tomato-harvest', end: true, meta: { page_name: 'Tomato harvest', module_name: 'harvest' } },
  { pattern: '/staff/harvest-sessions/:projectId/session/:sessionId', end: true, meta: { page_name: 'Harvest session', module_name: 'harvest' } },
  { pattern: '/staff/harvest-sessions/:projectId', end: true, meta: { page_name: 'Harvest sessions', module_name: 'harvest' } },
  { pattern: '/staff/harvest-sessions', end: true, meta: { page_name: 'Harvest sessions', module_name: 'harvest' } },
  { pattern: '/staff/inventory/item/:itemId', end: true, meta: { page_name: 'Inventory item', module_name: 'inventory' } },
  { pattern: '/staff/inventory', end: true, meta: { page_name: 'Inventory', module_name: 'inventory' } },
  { pattern: '/staff/expenses', end: true, meta: { page_name: 'Expenses', module_name: 'expenses' } },
  { pattern: '/staff/operations', end: true, meta: { page_name: 'Farm work', module_name: 'operations' } },
  { pattern: '/staff/reports', end: true, meta: { page_name: 'Reports', module_name: 'reports' } },
  { pattern: '/staff/support', end: true, meta: { page_name: 'Support', module_name: 'support' } },
  { pattern: '/staff/feedback', end: true, meta: { page_name: 'Feedback', module_name: 'feedback' } },
  { pattern: '/projects/:projectId/edit', end: true, meta: { page_name: 'Edit project', module_name: 'projects' } },
  { pattern: '/projects/:projectId/planning', end: true, meta: { page_name: 'Project planning', module_name: 'planning' } },
  { pattern: '/projects/:projectId', end: true, meta: { page_name: 'Project details', module_name: 'projects' } },
  { pattern: '/projects', end: true, meta: { page_name: 'Projects', module_name: 'projects' } },
  { pattern: '/crop-stages', end: true, meta: { page_name: 'Crop stages', module_name: 'planning' } },
  { pattern: '/challenges', end: true, meta: { page_name: 'Season challenges', module_name: 'planning' } },
  { pattern: '/inventory/item/:itemId', end: true, meta: { page_name: 'Inventory item', module_name: 'inventory' } },
  { pattern: '/inventory/categories', end: true, meta: { page_name: 'Inventory categories', module_name: 'inventory' } },
  { pattern: '/inventory/suppliers', end: true, meta: { page_name: 'Inventory suppliers', module_name: 'inventory' } },
  { pattern: '/inventory', end: true, meta: { page_name: 'Inventory', module_name: 'inventory' } },
  { pattern: '/harvest-sales/harvest/:harvestId', end: true, meta: { page_name: 'Harvest details', module_name: 'harvest' } },
  { pattern: '/harvest-sales', end: true, meta: { page_name: 'Harvest & sales', module_name: 'harvest' } },
  { pattern: '/harvest-collections/:projectId', end: true, meta: { page_name: 'Harvest collections', module_name: 'harvest' } },
  { pattern: '/harvest-collections', end: true, meta: { page_name: 'Harvest collections', module_name: 'harvest' } },
  { pattern: '/harvest', end: true, meta: { page_name: 'Harvest entry', module_name: 'harvest' } },
  { pattern: '/expenses', end: true, meta: { page_name: 'Expenses', module_name: 'expenses' } },
  { pattern: '/farm-work/legacy', end: true, meta: { page_name: 'Farm work legacy', module_name: 'operations' } },
  { pattern: '/farm-work', end: true, meta: { page_name: 'Farm work', module_name: 'operations' } },
  { pattern: '/operations/legacy', end: true, meta: { page_name: 'Farm work legacy', module_name: 'operations' } },
  { pattern: '/operations', end: true, meta: { page_name: 'Farm work', module_name: 'operations' } },
  { pattern: '/suppliers', end: true, meta: { page_name: 'Suppliers', module_name: 'projects' } },
  { pattern: '/employees/:employeeId', end: true, meta: { page_name: 'Employee profile', module_name: 'employees' } },
  { pattern: '/employees', end: true, meta: { page_name: 'Employees', module_name: 'employees' } },
  { pattern: '/reports', end: true, meta: { page_name: 'Reports', module_name: 'reports' } },
  { pattern: '/billing', end: true, meta: { page_name: 'Billing', module_name: 'billing' } },
  { pattern: '/settings', end: true, meta: { page_name: 'Settings', module_name: 'settings' } },
  { pattern: '/support', end: true, meta: { page_name: 'Support', module_name: 'support' } },
  { pattern: '/feedback', end: true, meta: { page_name: 'Feedback', module_name: 'feedback' } },
  { pattern: '/notes/:cropId/:noteId', end: true, meta: { page_name: 'Note', module_name: 'notes' } },
  { pattern: '/notes/:cropId/new', end: true, meta: { page_name: 'New note', module_name: 'notes' } },
  { pattern: '/notes/:cropId', end: true, meta: { page_name: 'Crop notes', module_name: 'notes' } },
  { pattern: '/notes', end: true, meta: { page_name: 'Notes', module_name: 'notes' } },
  { pattern: '/records/:cropId/record/:recordId', end: true, meta: { page_name: 'Crop record', module_name: 'notes' } },
  { pattern: '/records/:cropId', end: true, meta: { page_name: 'Crop records', module_name: 'notes' } },
  { pattern: '/records/view/:recordId', end: true, meta: { page_name: 'Record view', module_name: 'notes' } },
  { pattern: '/records', end: true, meta: { page_name: 'Notes', module_name: 'notes' } },
  { pattern: '/more', end: true, meta: { page_name: 'More', module_name: 'dashboard' } },
  { pattern: '/home', end: true, meta: { page_name: 'Home', module_name: 'dashboard' } },
  { pattern: '/dashboard', end: true, meta: { page_name: 'Home', module_name: 'dashboard' } },
  { pattern: '/app', end: true, meta: { page_name: 'App home', module_name: 'dashboard' } },
  { pattern: '/sign-in', end: false, meta: { page_name: 'Sign in', module_name: 'auth' } },
  { pattern: '/sign-up', end: false, meta: { page_name: 'Sign up', module_name: 'auth' } },
  { pattern: '/accept-invitation', end: false, meta: { page_name: 'Accept invitation', module_name: 'auth' } },
];

const FALLBACK: RouteAnalyticsMeta = { page_name: 'Other', module_name: 'other' };

export function resolveRouteAnalyticsMeta(pathname: string): RouteAnalyticsMeta {
  const path = pathname || '/';
  for (const rule of ROUTE_RULES) {
    const m = matchPath({ path: rule.pattern, end: rule.end ?? true }, path);
    if (m) return rule.meta;
  }
  return FALLBACK;
}

export function extractRouteContextParams(pathname: string): {
  project_id?: string;
  harvest_id?: string;
  employee_id?: string;
  item_id?: string;
  company_id_param?: string;
} {
  const path = pathname || '/';
  const out: ReturnType<typeof extractRouteContextParams> = {};
  const p = matchPath({ path: '/projects/:projectId', end: false }, path);
  if (p?.params.projectId) out.project_id = String(p.params.projectId);
  const h = matchPath({ path: '/harvest-sales/harvest/:harvestId', end: true }, path);
  if (h?.params.harvestId) out.harvest_id = String(h.params.harvestId);
  const e = matchPath({ path: '/employees/:employeeId', end: true }, path);
  if (e?.params.employeeId) out.employee_id = String(e.params.employeeId);
  const i = matchPath({ path: '/inventory/item/:itemId', end: true }, path);
  if (i?.params.itemId) out.item_id = String(i.params.itemId);
  const si = matchPath({ path: '/staff/inventory/item/:itemId', end: true }, path);
  if (si?.params.itemId) out.item_id = String(si.params.itemId);
  const dc = matchPath({ path: '/developer/companies/:companyId', end: true }, path);
  if (dc?.params.companyId) out.company_id_param = String(dc.params.companyId);
  const hc = matchPath({ path: '/harvest-collections/:projectId', end: true }, path);
  if (hc?.params.projectId) out.project_id = String(hc.params.projectId);
  return out;
}
