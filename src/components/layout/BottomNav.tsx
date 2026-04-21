import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import {
  buildCompanyMobileDrawerGroups,
  COMPANY_PRIMARY_BOTTOM_PATHS,
  getMainNavItems,
  getNavItemsForSidebar,
  getMoreNavItems,
  type NavItem as BottomNavItem,
} from '@/config/navConfig';
import { MobileMoreDrawer } from './MobileMoreDrawer';
import { usePermissions } from '@/hooks/usePermissions';
import { getModuleForPath } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { brokerMayAccessNavPath } from '@/lib/brokerNav';
import { isNavItemActive } from '@/lib/navActive';
import { FARMER_FARM_WORK_PATH, FARMER_HOME_PATH, FARMER_NOTES_PATH } from '@/lib/routing/farmerAppPaths';

type DrawerGroup = { title: string; items: BottomNavItem[] };

const ACTIVE_TAB_SCALE = 1.04;
const NAV_ITEM_TRANSITION = {
  duration: 0.22,
  ease: 'easeInOut' as const,
};

/** Warm forest green (hue ~145); mint tints — not blue/cool sage. */
const TAB_TEXT_ACTIVE_CLASS = 'text-[#356b4e] dark:text-[#b5dcc4]';
const TAB_TEXT_INACTIVE_CLASS = 'text-[#6e9178] dark:text-[#8aad92]';
const TAB_RING_ACTIVE = 'ring-[#356b4e]/24 dark:ring-[#6ecf9a]/35';

const MAX_BOTTOM_TABS_NARROW = 5;
const MAX_BOTTOM_TABS_WIDE = 7;

const navFilter = (
  item: BottomNavItem,
  effectiveIsBroker: boolean,
  can: (m: string, a: string) => boolean
) => {
  if (effectiveIsBroker && brokerMayAccessNavPath(item.path)) return true;
  const module = getModuleForPath(item.path);
  if (!module) return true;
  return can(module, 'view');
};

function getBottomNavTourId(path: string, type: 'link' | 'more'): string | undefined {
  if (type === 'more') return 'mobile-nav-more';

  const normalized = path.replace(/\/+/g, '/');
  const map: Record<string, string> = {
    [FARMER_HOME_PATH]: 'mobile-nav-dashboard',
    '/dashboard': 'mobile-nav-dashboard',
    '/projects': 'mobile-nav-projects',
    [FARMER_FARM_WORK_PATH]: 'mobile-nav-operations',
    '/operations': 'mobile-nav-operations',
    '/manager/operations': 'mobile-nav-operations',
    '/inventory': 'mobile-nav-inventory',
    '/harvest': 'mobile-nav-harvest',
    [FARMER_NOTES_PATH]: 'mobile-nav-notes',
    '/records': 'mobile-nav-notes',
    '/expenses': 'mobile-nav-expenses',
    '/broker': 'mobile-nav-broker-dashboard',
    '/broker/harvest-sales': 'mobile-nav-broker-harvest',
    '/broker/expenses': 'mobile-nav-broker-expenses',
  };
  return map[normalized];
}

function isRouteUnderPrimary(pathname: string, primaryPath: string): boolean {
  const p = pathname.replace(/\/+/g, '/');
  const base = primaryPath.replace(/\/+/g, '/');
  return p === base || (base !== '/' && p.startsWith(`${base}/`));
}

export function BottomNav() {
  const { user, effectiveAccess } = useAuth();
  const { can } = usePermissions();
  const location = useLocation();

  const isCompanyAdminShell =
    user?.role === 'company-admin' || (user as { role?: string } | null)?.role === 'company_admin';
  const isDeveloperShell = user?.role === 'developer';

  const allNavItems = useMemo(() => {
    return getNavItemsForSidebar(user).filter((item) =>
      navFilter(item, effectiveAccess.isBroker, can as (m: string, a: string) => boolean)
    );
  }, [user, effectiveAccess.isBroker, can]);

  const mainItems = useMemo(
    () => allNavItems.filter((i) => i.group === 'main'),
    [allNavItems]
  );
  const moreItems = useMemo(
    () => allNavItems.filter((i) => i.group === 'more'),
    [allNavItems]
  );

  const mainItemsLegacy = getMainNavItems(user).filter((item) =>
    navFilter(item, effectiveAccess.isBroker, can as (m: string, a: string) => boolean)
  );
  const moreItemsLegacy = getMoreNavItems(user).filter((item) =>
    navFilter(item, effectiveAccess.isBroker, can as (m: string, a: string) => boolean)
  );

  const [moreOpen, setMoreOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isWide, setIsWide] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const update = () => {
      if (typeof window === 'undefined') return;
      const width = window.innerWidth;
      setIsWide(width >= 380 && width < 1024);
      setIsDesktop(width >= 1024);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        logger.log('[Responsive] bottom nav viewport', { width, isDesktop: width >= 1024 });
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const visibleMainItems = useMemo(() => {
    if (!user) return [];
    if (isCompanyAdminShell && !isDeveloperShell) {
      const byPath = new Map(mainItems.map((i) => [i.path.replace(/\/+/g, '/'), i]));
      return COMPANY_PRIMARY_BOTTOM_PATHS.map((p) => byPath.get(p)).filter(Boolean) as BottomNavItem[];
    }

    const maxTabs = isWide ? MAX_BOTTOM_TABS_WIDE : MAX_BOTTOM_TABS_NARROW;
    const slotForMore = moreItemsLegacy.length > 0 || mainItemsLegacy.length > MAX_BOTTOM_TABS_NARROW ? 1 : 0;
    const maxDirectTabs = Math.max(1, maxTabs - slotForMore);

    const allMain = [...mainItemsLegacy];

    if (isWide) {
      const home = allMain.find((i) => i.path === FARMER_HOME_PATH);
      const rest = allMain.filter((i) => i.path !== FARMER_HOME_PATH);
      const ordered: BottomNavItem[] = [];
      if (home) ordered.push(home);
      ordered.push(...rest);
      return ordered.slice(0, maxDirectTabs);
    }

    return allMain.slice(0, maxDirectTabs);
  }, [
    user,
    isCompanyAdminShell,
    isDeveloperShell,
    mainItems,
    mainItemsLegacy,
    moreItemsLegacy,
    isWide,
  ]);

  const drawerItems = useMemo(() => {
    const overflowMainItems = mainItemsLegacy.slice(visibleMainItems.length);
    const deduped = new Map<string, BottomNavItem>();
    [...moreItemsLegacy, ...overflowMainItems].forEach((item) => {
      deduped.set(item.path, item);
    });
    return Array.from(deduped.values());
  }, [mainItemsLegacy, moreItemsLegacy, visibleMainItems.length]);

  const drawerGroups = useMemo<DrawerGroup[]>(() => {
    if (!user) return [{ title: 'More', items: drawerItems }];

    if (isCompanyAdminShell && !isDeveloperShell) {
      return buildCompanyMobileDrawerGroups(allNavItems);
    }

    if (isDeveloperShell) {
      const developerOrder = [
        'Platform Overview',
        'Workspace Management',
        'Finance & Billing',
        'Operations & Monitoring',
        'Communication',
        'Security, Compliance & Data',
      ] as const;

      const sectionForPath = (path: string) => {
        const normalized = path.replace(/\/+/g, '/');
        switch (normalized) {
          case '/developer':
            return 'Platform Overview';
          case '/developer/companies':
          case '/developer/users':
          case '/developer/settings':
          case '/developer/integrations':
          case '/developer/company-migrations':
            return 'Workspace Management';
          case '/developer/finances':
          case '/developer/subscription-analytics':
          case '/developer/farmvault-expenses':
          case '/developer/billing-confirmation':
            return 'Finance & Billing';
          case '/developer/qr':
          case '/developer/records':
          case '/developer/code-red':
          case '/developer/backups':
            return 'Operations & Monitoring';
          case '/developer/email-center':
          case '/developer/feedback-inbox':
            return 'Communication';
          case '/developer/audit-logs':
          case '/developer/documents':
            return 'Security, Compliance & Data';
          default:
            return 'Workspace Management';
        }
      };

      const order = developerOrder;
      const buckets = new Map<string, BottomNavItem[]>();
      order.forEach((title) => buckets.set(title, []));
      drawerItems.forEach((item) => {
        const section = sectionForPath(item.path);
        const bucket = buckets.get(section);
        if (bucket) bucket.push(item);
      });

      return order
        .map((title) => ({ title, items: buckets.get(title) ?? [] }))
        .filter((group) => group.items.length > 0);
    }

    return [{ title: 'More', items: drawerItems }];
  }, [drawerItems, user, isDeveloperShell, isCompanyAdminShell, allNavItems]);

  const drawerItemsForSheet = useMemo(() => {
    if (isCompanyAdminShell && !isDeveloperShell) {
      const seen = new Set<string>();
      const out: BottomNavItem[] = [];
      drawerGroups.forEach((g) => {
        g.items.forEach((item) => {
          const k = item.path;
          if (seen.has(k)) return;
          seen.add(k);
          out.push(item);
        });
      });
      return out;
    }
    return drawerItems;
  }, [drawerGroups, drawerItems, isCompanyAdminShell, isDeveloperShell]);

  const tabs = useMemo(() => {
    const list = visibleMainItems.map((item) => ({
      ...item,
      label: item.shortLabel ?? item.label,
      type: 'link' as const,
      tourId: getBottomNavTourId(item.path, 'link'),
    }));
    const showMore = isCompanyAdminShell && !isDeveloperShell ? drawerGroups.length > 0 : drawerItems.length > 0;
    if (showMore) {
      list.push({
        label: 'More',
        path: '',
        icon: MoreHorizontal,
        group: 'main' as const,
        type: 'more' as const,
        tourId: getBottomNavTourId('', 'more'),
      });
    }
    return list;
  }, [visibleMainItems, drawerItems.length, drawerGroups.length, isCompanyAdminShell, isDeveloperShell]);

  const handleMoreTap = () => {
    const open = isCompanyAdminShell && !isDeveloperShell ? drawerGroups.length > 0 : drawerItems.length > 0;
    if (open) setMoreOpen(true);
  };

  const isMoreActive = useMemo(() => {
    const path = location.pathname.replace(/\/+/g, '/');
    if (isCompanyAdminShell && !isDeveloperShell) {
      if (path === '/more' || path.startsWith('/more/')) return true;
      const isPrimary = COMPANY_PRIMARY_BOTTOM_PATHS.some((base) => isRouteUnderPrimary(path, base));
      if (isPrimary) return false;
      return buildCompanyMobileDrawerGroups(allNavItems).some((group) =>
        group.items.some((m) => {
          const mp = m.path.replace(/\/+/g, '/');
          return path === mp || (mp !== '/' && path.startsWith(`${mp}/`));
        })
      );
    }
    return drawerItems.some((m) => {
      const mp = m.path.replace(/\/+/g, '/');
      return path === mp || (mp !== '/' && path.startsWith(`${mp}/`));
    });
  }, [drawerItems, location.pathname, isCompanyAdminShell, isDeveloperShell, allNavItems]);

  if (!user || isDesktop) {
    return null;
  }

  const navNode = (
    <div
      className="fixed inset-x-0 z-[60] lg:hidden flex justify-center pointer-events-none bottom-0 pb-[max(0.5rem,env(safe-area-inset-bottom))] px-3 pt-2"
      style={{
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
      }}
    >
      <nav
        data-tour="bottom-navigation"
        className={cn(
          'pointer-events-auto w-full max-w-[480px] rounded-2xl min-h-[58px] flex items-stretch justify-between gap-0 px-1 py-1.5 relative overflow-hidden',
          /* 1px vertical rules between tabs (not cell outlines) */
          'divide-x divide-solid divide-[#356b4e]/32 dark:divide-[#6ecf9a]/42',
          'bg-[#f2f8f4] dark:bg-[hsl(145_22%_13%)]/95',
          'border border-[#356b4e]/22 dark:border-[#6ecf9a]/28 shadow-[0_12px_32px_-18px_rgba(0,0,0,0.1),0_6px_20px_-12px_rgba(53,107,78,0.16)]',
          'backdrop-blur-md supports-[backdrop-filter]:bg-[#f2f8f4]/92 dark:supports-[backdrop-filter]:bg-[hsl(145_22%_13%)]/92',
        )}
        aria-label="Bottom navigation"
      >
        {tabs.map((item) => {
          if (item.type === 'more') {
            return (
              <NavItem
                key="more"
                item={item}
                active={isMoreActive}
                asButton
                onPress={handleMoreTap}
              />
            );
          }
          return (
            <NavItem
              key={item.path}
              item={item}
              activeOverride={
                effectiveAccess.isBroker
                  ? isNavItemActive(location.pathname, location.search, item.path)
                  : undefined
              }
              to={item.path}
            />
          );
        })}
      </nav>
    </div>
  );

  return (
    <>
      {mounted ? createPortal(navNode, document.body) : null}
      <MobileMoreDrawer
        open={moreOpen}
        onOpenChange={setMoreOpen}
        items={drawerItemsForSheet}
        groups={drawerGroups}
        variant={isCompanyAdminShell && !isDeveloperShell ? 'left' : 'bottom'}
      />
    </>
  );
}

function NavItem({
  item,
  active: activeProp,
  activeOverride,
  to,
  asButton,
  onPress,
}: {
  item: { label: string; icon: React.ComponentType<{ className?: string }>; tourId?: string };
  active?: boolean;
  activeOverride?: boolean;
  to?: string;
  asButton?: boolean;
  onPress?: () => void;
}) {
  const Icon = item.icon;
  /** Mint-green tint (hue ~145); outline matches TAB_GREEN */
  const activePill = cn(
    'bg-gradient-to-b from-[#d9eee0] via-[#e8f4ec] to-[#f2f8f4] dark:from-[hsl(145_32%_17%)] dark:via-[hsl(145_28%_15%)] dark:to-[hsl(145_24%_13%)]',
    'ring-1',
    TAB_RING_ACTIVE,
    'shadow-[inset_0_0_0_1px_rgba(53,107,78,0.12),inset_0_1px_0_rgba(255,255,255,0.9),0_2px_10px_-4px_rgba(53,107,78,0.14)]'
  );

  if (asButton && onPress) {
    return (
      <motion.button
        type="button"
        onClick={onPress}
        data-tour={item.tourId}
        className={cn(
          'relative z-10 flex flex-1 min-w-0 min-h-[48px] rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#356b4e]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f2f8f4] dark:focus-visible:ring-offset-transparent',
          activeProp && activePill
        )}
        aria-label={item.label}
        aria-current={activeProp ? 'page' : undefined}
        initial={false}
        animate={activeProp ? { scale: ACTIVE_TAB_SCALE } : { scale: 1 }}
        transition={NAV_ITEM_TRANSITION}
        whileTap={{ scale: 0.96 }}
      >
          <span className="flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 min-h-[48px] py-1 px-1.5">
          <span className="flex items-center justify-center h-5 w-5 shrink-0">
            <Icon
              className={cn(
                'h-[1.15rem] w-[1.15rem] shrink-0 transition-colors duration-200 ease-out',
                activeProp ? TAB_TEXT_ACTIVE_CLASS : TAB_TEXT_INACTIVE_CLASS
              )}
            />
          </span>
          <span
            className={cn(
              'text-[10px] font-semibold tracking-tight truncate max-w-[4.75rem] text-center transition-colors duration-200 ease-out',
              activeProp ? TAB_TEXT_ACTIVE_CLASS : TAB_TEXT_INACTIVE_CLASS
            )}
          >
            {item.label}
          </span>
        </span>
      </motion.button>
    );
  }

  if (!to) return null;

  const [pathOnly] = to.split('?');
  const normalizedPath = pathOnly.replace(/\/+/g, '/') || '/';
  const endMatch =
    !to.includes('?') &&
    (normalizedPath === '/' ||
      normalizedPath === FARMER_HOME_PATH ||
      normalizedPath === '/developer' ||
      normalizedPath === '/broker');

  return (
    <NavLink
      to={to}
      end={endMatch}
      data-tour={item.tourId}
      className="relative z-10 flex flex-1 min-w-0 min-h-[48px] rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#356b4e]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f2f8f4] dark:focus-visible:ring-offset-transparent"
      aria-label={item.label}
    >
      {({ isActive }) => {
        const tabActive = activeOverride ?? isActive;
        return (
          <motion.span
            className={cn(
              'flex flex-1 min-w-0 w-full h-full rounded-xl',
              tabActive && activePill
            )}
            initial={false}
            animate={tabActive ? { scale: ACTIVE_TAB_SCALE } : { scale: 1 }}
            transition={NAV_ITEM_TRANSITION}
            whileTap={{ scale: 0.96 }}
          >
            <span className="flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 min-h-[48px] py-1 px-1.5">
              <span className="flex items-center justify-center h-5 w-5 shrink-0">
                <Icon
                  className={cn(
                    'h-[1.15rem] w-[1.15rem] shrink-0 transition-colors duration-200 ease-out',
                    tabActive ? TAB_TEXT_ACTIVE_CLASS : TAB_TEXT_INACTIVE_CLASS
                  )}
                />
              </span>
              <span
                className={cn(
                  'text-[10px] font-semibold tracking-tight truncate max-w-[4.75rem] text-center transition-colors duration-200 ease-out',
                  tabActive ? TAB_TEXT_ACTIVE_CLASS : TAB_TEXT_INACTIVE_CLASS
                )}
              >
                {item.label}
              </span>
            </span>
          </motion.span>
        );
      }}
    </NavLink>
  );
}
