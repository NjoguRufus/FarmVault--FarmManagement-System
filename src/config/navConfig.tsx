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
  { label: 'Harvest & Sales', path: '/harvest-sales', icon: TrendingUp, group: 'more' },
  { label: 'Suppliers', path: '/suppliers', icon: Truck, group: 'more' },
  { label: 'Season Challenges', path: '/challenges', icon: AlertTriangle, group: 'more' },
  { label: 'Employees', path: '/employees', icon: Users, group: 'more' },
  { label: 'Reports', path: '/reports', icon: FileText, group: 'more' },
  { label: 'Billing & Subscription', path: '/billing', icon: CreditCard, group: 'more' },
  { label: 'Settings', path: '/settings', icon: Settings, group: 'more' },
  { label: 'Support', path: '/support', icon: HelpCircle, group: 'more' },
  { label: 'Feedback', path: '/feedback', icon: MessageSquare, group: 'more' },
];

/** Developer/Admin nav. All items in main for sidebar; mobile gets simplified. */
export const developerNavConfig: NavItem[] = [
  { label: 'Admin Home', path: '/admin', icon: LayoutDashboard, group: 'main' },
  { label: 'Companies', path: '/admin/companies', icon: Building2, group: 'main' },
  { label: 'Users', path: '/admin/users', icon: Users, group: 'main' },
  { label: 'Pending Users', path: '/admin/users/pending', icon: Users, group: 'main' },
  { label: 'Finances', path: '/admin/finances', icon: CreditCard, group: 'main' },
  { label: 'FarmVault Expenses', path: '/admin/expenses', icon: Receipt, group: 'main' },
  { label: 'Backups', path: '/admin/backups', icon: Database, group: 'main' },
  { label: 'Code Red', path: '/admin/code-red', icon: AlertTriangle, group: 'main' },
  { label: 'Feedback inbox', path: '/admin/feedback', icon: MessageSquare, group: 'main' },
  { label: 'Audit Logs', path: '/admin/audit-logs', icon: FileText, group: 'main' },
];

/** Manager nav. */
export const managerNavConfig: NavItem[] = [
  { label: 'Manager Operations', path: '/manager/operations', icon: Wrench, group: 'main' },
  { label: 'Inventory', path: '/inventory', icon: Package, group: 'main' },
  { label: 'Feedback', path: '/feedback', icon: MessageSquare, group: 'more' },
];

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

export type NavConfig = NavItem[];

/** Returns full nav items for Sidebar (all groups). */
export function getNavItemsForSidebar(user: { role?: string; employeeRole?: string } | null): NavConfig {
  if (!user) return companyNavConfig.filter((i) => i.path !== '/employee-dashboard');

  const emp = (user as any).employeeRole as string | undefined;

  if (user.role === 'developer') return developerNavConfig;
  if (user.role === 'company-admin' || user.role === ('company_admin' as any))
    return companyNavConfig.filter((i) => i.path !== '/employee-dashboard');
  if (
    user.role === 'manager' ||
    emp === 'manager' ||
    emp === 'operations-manager'
  )
    return managerNavConfig;
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
