import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  FolderKanban,
  Layers,
  Receipt,
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
} from 'lucide-react';

export type NavGroup = 'main' | 'more';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  group: NavGroup;
  employeeOnly?: boolean;
}

/** Company nav (company-admin, fallback). Main = bottom bar, More = drawer on mobile. */
export const companyNavConfig: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, group: 'main' },
  { label: 'My Dashboard', path: '/employee-dashboard', icon: LayoutDashboard, group: 'main', employeeOnly: true },
  { label: 'Projects', path: '/projects', icon: FolderKanban, group: 'main' },
  { label: 'Operations', path: '/operations', icon: Wrench, group: 'main' },
  { label: 'Inventory', path: '/inventory', icon: Package, group: 'main' },
  { label: 'Crop Stages', path: '/crop-stages', icon: Layers, group: 'more' },
  { label: 'Expenses', path: '/expenses', icon: Receipt, group: 'more' },
  { label: 'Harvest', path: '/harvest', icon: TrendingUp, group: 'more' },
  { label: 'Suppliers', path: '/suppliers', icon: Truck, group: 'more' },
  { label: 'Season Challenges', path: '/challenges', icon: AlertTriangle, group: 'more' },
  { label: 'Employees', path: '/employees', icon: Users, group: 'more' },
  { label: 'Records', path: '/records', icon: FileText, group: 'more' },
  { label: 'Reports', path: '/reports', icon: FileText, group: 'more' },
  { label: 'Billing & Subscription', path: '/billing', icon: CreditCard, group: 'more' },
  { label: 'Settings', path: '/settings', icon: Settings, group: 'more' },
  { label: 'Support', path: '/support', icon: HelpCircle, group: 'more' },
  { label: 'Feedback', path: '/feedback', icon: MessageSquare, group: 'more' },
];

/** Developer/Admin nav. All items in main for sidebar; mobile gets simplified. */
export const developerNavConfig: NavItem[] = [
  { label: 'Developer Home', path: '/developer', icon: LayoutDashboard, group: 'main' },
  { label: 'Companies', path: '/developer/companies', icon: Building2, group: 'main' },
  { label: 'Users', path: '/developer/users', icon: Users, group: 'main' },
  { label: 'Billing Confirmation', path: '/developer/billing-confirmation', icon: Users, group: 'main' },
  { label: 'Finances', path: '/developer/finances', icon: CreditCard, group: 'main' },
  { label: 'Subscription Analytics', path: '/developer/subscription-analytics', icon: BarChart3, group: 'main' },
  { label: 'FarmVault Expenses', path: '/developer/farmvault-expenses', icon: Receipt, group: 'main' },
  { label: 'Backups', path: '/developer/backups', icon: Database, group: 'main' },
  { label: 'Code Red', path: '/developer/code-red', icon: AlertTriangle, group: 'main' },
  { label: 'Feedback inbox', path: '/developer/feedback-inbox', icon: MessageSquare, group: 'main' },
  { label: 'Audit Logs', path: '/developer/audit-logs', icon: FileText, group: 'main' },
  { label: 'Records', path: '/developer/records', icon: FileText, group: 'main' },
];

/** Manager nav. */
export const managerNavConfig: NavItem[] = [
  { label: 'Operations', path: '/manager/operations', icon: Wrench, group: 'main' },
  { label: 'Inventory', path: '/inventory', icon: Package, group: 'main' },
  { label: 'Feedback', path: '/feedback', icon: MessageSquare, group: 'more' },
];

const managerExtraNavConfig: NavItem[] = companyNavConfig.filter(
  (item) =>
    item.path !== '/dashboard' &&
    item.path !== '/employee-dashboard' &&
    item.path !== '/operations' &&
    item.path !== '/inventory' &&
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

/** Broker nav. */
export const brokerNavConfig: NavItem[] = [
  { label: 'Broker Dashboard', path: '/broker', icon: LayoutDashboard, group: 'main' },
  { label: 'Harvest & Sales', path: '/broker/harvest-sales', icon: TrendingUp, group: 'main' },
  { label: 'Market Expenses', path: '/broker/expenses', icon: Receipt, group: 'main' },
  { label: 'Feedback', path: '/feedback', icon: MessageSquare, group: 'more' },
];

/** Driver nav. */
export const driverNavConfig: NavItem[] = [
  { label: 'Driver Dashboard', path: '/driver', icon: Truck, group: 'main' },
  { label: 'Feedback', path: '/feedback', icon: MessageSquare, group: 'more' },
];

/** Staff/employee nav: all routes live under /staff/* */
export const staffNavConfig: NavItem[] = [
  { label: 'Dashboard', path: '/staff/staff-dashboard', icon: LayoutDashboard, group: 'main' },
  { label: 'Operations', path: '/staff/operations', icon: Wrench, group: 'main' },
  { label: 'Inventory', path: '/staff/inventory', icon: Package, group: 'main' },
  { label: 'Harvest & Collections', path: '/staff/harvest-collections', icon: TrendingUp, group: 'more' },
  { label: 'Expenses', path: '/staff/expenses', icon: Receipt, group: 'more' },
  { label: 'Reports', path: '/staff/reports', icon: FileText, group: 'more' },
  { label: 'Support', path: '/staff/support', icon: HelpCircle, group: 'more' },
  { label: 'Feedback', path: '/staff/feedback', icon: MessageSquare, group: 'more' },
  { label: 'Profile', path: '/staff/profile', icon: Users, group: 'more' },
];

export type NavConfig = NavItem[];

/** Returns full nav items for Sidebar. Filter by permission in consumer (e.g. can(module, 'view')). */
export function getNavItemsForSidebar(user: { role?: string; employeeRole?: string } | null): NavConfig {
  if (!user) return companyNavConfig.filter((i) => i.path !== '/employee-dashboard');

  const emp = (user as any).employeeRole as string | undefined;

  if (user.role === 'developer') return developerNavConfig;
  if (user.role === 'company-admin' || user.role === ('company_admin' as any))
    return companyNavConfig.filter((i) => i.path !== '/employee-dashboard');
  if (user.role === 'employee' || user.role === ('user' as any)) return staffNavConfig;
  if (
    user.role === 'manager' ||
    emp === 'manager' ||
    emp === 'operations-manager'
  )
    return getMergedManagerNav();
  if (
    user.role === 'broker' ||
    emp === 'sales-broker' ||
    emp === 'broker'
  )
    return brokerNavConfig;
  if (
    (user.role === 'employee' || user.role === ('user' as any)) &&
    (emp === 'logistics-driver' || emp === 'driver')
  )
    return driverNavConfig;

  return companyNavConfig.filter((i) => i.path === '/dashboard');
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
