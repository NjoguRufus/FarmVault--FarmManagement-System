import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Home,
  Folder,
  Tractor,
  Receipt,
  Wallet,
  NotebookPen,
  Wrench,
  Package,
  TrendingUp,
  Users,
  Truck,
  AlertTriangle,
  FileText,
  CreditCard,
  HelpCircle,
  MessageSquare,
  Building2,
  Database,
  Settings,
  BarChart3,
  ArrowRightLeft,
  Shield,
  QrCode,
  Mail,
  ClipboardCheck,
  Scale,
  Plug,
  FlaskConical,
} from 'lucide-react';
import {
  FARMER_FARM_WORK_PATH,
  FARMER_HOME_PATH,
  FARMER_NOTES_PATH,
} from '@/lib/routing/farmerAppPaths';

export type NavGroup = 'main' | 'more';

export interface NavItem {
  label: string;
  /** Shorter label for mobile bottom bar (sidebar / More keep `label`). */
  shortLabel?: string;
  path: string;
  icon: LucideIcon;
  group: NavGroup;
  employeeOnly?: boolean;
  /** Opens in a new tab using a plain <a> tag instead of React Router Link. */
  external?: boolean;
}

/** Mobile More drawer: section headers + route paths (company shell). */
export const COMPANY_MOBILE_DRAWER_SECTIONS: { title: string; paths: string[] }[] = [
  { title: 'FARM', paths: ['/harvest', FARMER_FARM_WORK_PATH, '/inventory'] },
  { title: 'TEAM & PARTNERS', paths: ['/employees', '/suppliers'] },
  { title: 'INSIGHTS', paths: [FARMER_NOTES_PATH, '/reports'] },
  { title: 'FINANCE', paths: ['/expenses', '/billing'] },
  { title: 'SETTINGS & HELP', paths: ['/settings', '/support', '/feedback'] },
];

/** Build grouped drawer links; skips paths missing after permission filters. */
export function buildCompanyMobileDrawerGroups(items: NavItem[]): { title: string; items: NavItem[] }[] {
  const byPath = new Map<string, NavItem>();
  items.forEach((item) => {
    const key = item.path.replace(/\/+/g, '/');
    byPath.set(key, item);
  });
  return COMPANY_MOBILE_DRAWER_SECTIONS.map(({ title, paths }) => ({
    title,
    items: paths
      .map((p) => byPath.get(p.replace(/\/+/g, '/')))
      .filter((x): x is NavItem => Boolean(x)),
  })).filter((g) => g.items.length > 0);
}

/** Primary bottom bar order (company shell): Home → Projects → Farm Work → Expenses → Notes. */
export const COMPANY_PRIMARY_BOTTOM_PATHS = [
  FARMER_HOME_PATH,
  '/projects',
  FARMER_FARM_WORK_PATH,
  '/expenses',
  FARMER_NOTES_PATH,
] as const;

/** Company nav (company-admin, fallback). Main = bottom bar, More = drawer on mobile. */
export const companyNavConfig: NavItem[] = [
  { label: 'Home', path: FARMER_HOME_PATH, icon: Home, group: 'main' },
  {
    label: 'My Dashboard',
    path: '/employee-dashboard',
    icon: LayoutDashboard,
    group: 'main',
    employeeOnly: true,
  },
  { label: 'Projects', path: '/projects', icon: Folder, group: 'main' },
  { label: 'Farm Work', path: FARMER_FARM_WORK_PATH, icon: Tractor, group: 'main' },
  { label: 'Expenses', path: '/expenses', icon: Wallet, group: 'main' },
  { label: 'Notes', path: FARMER_NOTES_PATH, icon: NotebookPen, group: 'main' },
  { label: 'Harvest', path: '/harvest', icon: TrendingUp, group: 'more' },
  { label: 'Inventory', path: '/inventory', icon: Package, group: 'more' },
  { label: 'Suppliers', path: '/suppliers', icon: Truck, group: 'more' },
  { label: 'Employees', path: '/employees', icon: Users, group: 'more' },
  { label: 'Reports', path: '/reports', icon: BarChart3, group: 'more' },
  { label: 'Billing & Subscription', path: '/billing', icon: CreditCard, group: 'more' },
  { label: 'Settings', path: '/settings', icon: Settings, group: 'more' },
  { label: 'Support', path: '/support', icon: HelpCircle, group: 'more' },
  { label: 'Feedback', path: '/feedback', icon: MessageSquare, group: 'more' },
];

/** Developer console: main = mobile bottom bar (4 + More); more = drawer only on mobile. */
export const developerNavConfig: NavItem[] = [
  {
    label: 'Developer Home',
    shortLabel: 'Home',
    path: '/developer',
    icon: LayoutDashboard,
    group: 'main',
  },
  { label: 'Companies', path: '/developer/companies', icon: Building2, group: 'main' },
  { label: 'Users', path: '/developer/users', icon: Users, group: 'main' },
  {
    label: 'Billing Confirmation',
    shortLabel: 'Billing',
    path: '/developer/billing-confirmation',
    icon: ClipboardCheck,
    group: 'main',
  },
  { label: 'Scan QR', path: '/developer/qr', icon: QrCode, group: 'more' },
  { label: 'Developer Settings', path: '/developer/settings', icon: Shield, group: 'more' },
  { label: 'Finances', path: '/developer/finances', icon: CreditCard, group: 'more' },
  { label: 'Subscription Analytics', path: '/developer/subscription-analytics', icon: BarChart3, group: 'more' },
  { label: 'FarmVault Expenses', path: '/developer/farmvault-expenses', icon: Receipt, group: 'more' },
  { label: 'Backups', path: '/developer/backups', icon: Database, group: 'more' },
  { label: 'Code Red', path: '/developer/code-red', icon: AlertTriangle, group: 'more' },
  { label: 'Feedback inbox', path: '/developer/feedback-inbox', icon: MessageSquare, group: 'more' },
  { label: 'Audit Logs', path: '/developer/audit-logs', icon: FileText, group: 'more' },
  { label: 'Email Center', path: '/developer/email-center', icon: Mail, group: 'more' },
  { label: 'Notification Testing', path: '/developer/notification-testing', icon: FlaskConical, group: 'more' },
  { label: 'Integrations', path: '/developer/integrations', icon: Plug, group: 'more' },
  { label: 'Notes', path: '/developer/records', icon: NotebookPen, group: 'more' },
  { label: 'Company Migrations', path: '/developer/company-migrations', icon: ArrowRightLeft, group: 'more' },
  { label: 'Compliance & Documents', path: '/developer/documents', icon: Scale, group: 'more' },
];

/** Manager nav. */
export const managerNavConfig: NavItem[] = [
  { label: 'Farm Work', path: '/manager/operations', icon: Tractor, group: 'main' },
  { label: 'Inventory', path: '/inventory', icon: Package, group: 'main' },
  { label: 'Feedback', path: '/feedback', icon: MessageSquare, group: 'more' },
];

const managerExtraNavConfig: NavItem[] = companyNavConfig.filter(
  (item) =>
    item.path !== FARMER_HOME_PATH &&
    item.path !== '/employee-dashboard' &&
    item.path !== FARMER_FARM_WORK_PATH &&
    item.path !== '/inventory' &&
    item.path !== '/projects' &&
    item.path !== '/expenses' &&
    item.path !== FARMER_NOTES_PATH &&
    item.path !== '/feedback'
);

function getMergedManagerNav(): NavItem[] {
  const merged = [...managerNavConfig, ...managerExtraNavConfig];
  const deduped = new Map<string, NavItem>();
  merged.forEach((item) => {
    deduped.set(item.path, item);
  });
  return Array.from(deduped.values());
}

/** Broker nav — same shell as farm app; detail routes are /broker/harvest/:id. */
export const brokerNavConfig: NavItem[] = [
  { label: 'Home', shortLabel: 'Home', path: '/broker', icon: Home, group: 'main' },
  {
    label: 'Market expenses',
    shortLabel: 'Expenses',
    path: '/broker/expenses',
    icon: Wallet,
    group: 'main',
  },
  { label: 'Settings', path: '/settings', icon: Settings, group: 'more' },
  { label: 'Support', path: '/support', icon: HelpCircle, group: 'more' },
  { label: 'Feedback', path: '/feedback', icon: MessageSquare, group: 'more' },
];

/** Driver nav. */
export const driverNavConfig: NavItem[] = [
  { label: 'Driver Dashboard', path: '/driver', icon: Truck, group: 'main' },
  { label: 'Feedback', path: '/feedback', icon: MessageSquare, group: 'more' },
];

/** Staff/employee nav: all routes live under /staff/* */
export const staffNavConfig: NavItem[] = [
  { label: 'Home', path: '/staff/staff-dashboard', icon: Home, group: 'main' },
  { label: 'Farm Work', path: '/staff/operations', icon: Tractor, group: 'main' },
  { label: 'Inventory', path: '/staff/inventory', icon: Package, group: 'main' },
  { label: 'Harvest', path: '/staff/harvest', icon: TrendingUp, group: 'more' },
  { label: 'Expenses', path: '/staff/expenses', icon: Wallet, group: 'more' },
  { label: 'Reports', path: '/staff/reports', icon: FileText, group: 'more' },
  { label: 'Settings', path: '/settings', icon: Settings, group: 'more' },
  { label: 'Support', path: '/staff/support', icon: HelpCircle, group: 'more' },
  { label: 'Feedback', path: '/staff/feedback', icon: MessageSquare, group: 'more' },
];

export type NavConfig = NavItem[];

/** Returns full nav items for Sidebar. Filter by permission in consumer (e.g. can(module, 'view')). */
export function getNavItemsForSidebar(user: { role?: string; employeeRole?: string } | null): NavConfig {
  if (!user) return companyNavConfig.filter((i) => i.path !== '/employee-dashboard');

  const emp = (user as any).employeeRole as string | undefined;

  if (user.role === 'developer') return developerNavConfig;
  if (user.role === 'company-admin' || user.role === ('company_admin' as any))
    return companyNavConfig.filter((i) => i.path !== '/employee-dashboard');
  const empNorm = String(emp ?? '').trim().toLowerCase();
  if (user.role === 'broker' || empNorm === 'sales-broker' || empNorm === 'broker') return brokerNavConfig;
  if (
    user.role === 'employee' ||
    user.role === ('user' as any)
  ) {
    if (emp === 'logistics-driver' || emp === 'driver') return driverNavConfig;
    return staffNavConfig;
  }
  if (
    user.role === 'manager' ||
    emp === 'manager' ||
    emp === 'operations-manager'
  )
    return getMergedManagerNav();

  return companyNavConfig.filter((i) => i.path === FARMER_HOME_PATH);
}

/** Returns main items for BottomNav (visible on bar). */
export function getMainNavItems(user: { role?: string; employeeRole?: string } | null): NavItem[] {
  const all = getNavItemsForSidebar(user);
  return all.filter((i) => i.group === 'main');
}

/** Returns more items for MobileMoreDrawer. */
export function getMoreNavItems(user: { role?: string; employeeRole?: string } | null): NavItem[] {
  const all = getNavItemsForSidebar(user);
  return all.filter((i) => i.group === 'more');
}
