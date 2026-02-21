import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { getMainNavItems, getMoreNavItems, type NavItem as BottomNavItem } from '@/config/navConfig';
import { MobileMoreDrawer } from './MobileMoreDrawer';

const ACTIVE_TAB_SCALE = 1.04;
const NAV_ITEM_TRANSITION = {
  duration: 0.2,
  ease: 'easeInOut' as const,
};
const ACTIVE_TAB_SHADOW = '0 8px 18px -12px rgba(27, 67, 50, 0.45), 0 3px 8px -6px rgba(27, 67, 50, 0.35)';
const MAX_BOTTOM_TABS = 5;

function getBottomNavTourId(path: string, type: 'link' | 'more'): string | undefined {
  if (type === 'more') return 'mobile-nav-more';

  const normalized = path.replace(/\/+/g, '/');
  const map: Record<string, string> = {
    '/dashboard': 'mobile-nav-dashboard',
    '/projects': 'mobile-nav-projects',
    '/operations': 'mobile-nav-operations',
    '/manager/operations': 'mobile-nav-operations',
    '/inventory': 'mobile-nav-inventory',
    '/broker': 'mobile-nav-broker-dashboard',
    '/broker/harvest-sales': 'mobile-nav-broker-harvest',
    '/broker/expenses': 'mobile-nav-broker-expenses',
  };
  return map[normalized];
}

export function BottomNav() {
  const { user } = useAuth();
  const location = useLocation();
  const mainItems = getMainNavItems(user);
  const moreItems = getMoreNavItems(user);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const visibleMainItems = useMemo(() => {
    const slotForMore = moreItems.length > 0 || mainItems.length > MAX_BOTTOM_TABS ? 1 : 0;
    const maxDirectTabs = Math.max(1, MAX_BOTTOM_TABS - slotForMore);
    return mainItems.slice(0, maxDirectTabs);
  }, [mainItems, moreItems.length]);

  const drawerItems = useMemo(() => {
    const overflowMainItems = mainItems.slice(visibleMainItems.length);
    const deduped = new Map<string, BottomNavItem>();
    [...moreItems, ...overflowMainItems].forEach((item) => {
      deduped.set(item.path, item);
    });
    return Array.from(deduped.values());
  }, [mainItems, moreItems, visibleMainItems.length]);

  const tabs = useMemo(() => {
    const list = visibleMainItems.map((item) => ({
      ...item,
      type: 'link' as const,
      tourId: getBottomNavTourId(item.path, 'link'),
    }));
    if (drawerItems.length > 0) {
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
  }, [visibleMainItems, drawerItems.length]);

  const handleMoreTap = () => {
    if (drawerItems.length > 0) setMoreOpen(true);
  };

  const isMoreActive = useMemo(() => {
    return drawerItems.some((m) => {
      const mp = m.path.replace(/\/+/g, '/');
      const path = location.pathname.replace(/\/+/g, '/');
      return path === mp || (mp !== '/' && path.startsWith(mp + '/'));
    });
  }, [drawerItems, location.pathname]);

  const navNode = (
    <div
      className="fixed inset-x-0 bottom-3.5 z-[60] md:hidden flex justify-center pointer-events-none"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: '14px',
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
      }}
    >
      <nav
        data-tour="bottom-navigation"
        className="pointer-events-auto w-[92%] max-w-[480px] rounded-2xl min-h-[56px] flex items-center justify-around px-1 py-1.5 gap-1 relative overflow-hidden bg-fv-cream dark:bg-card border border-primary/10 dark:border-emerald-200/10 border-t-primary/20 dark:border-t-emerald-200/15 shadow-[0_10px_24px_-16px_rgba(27,67,50,0.38),0_4px_10px_-6px_rgba(27,67,50,0.2)] dark:shadow-[0_12px_26px_-16px_rgba(0,0,0,0.65),0_4px_10px_-6px_rgba(0,0,0,0.5)]"
        aria-label="Bottom navigation"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-primary/15 to-transparent dark:from-emerald-900/30"
        />
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
              active={false}
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
      <MobileMoreDrawer open={moreOpen} onOpenChange={setMoreOpen} items={drawerItems} />
    </>
  );
}

function NavItem({
  item,
  active: activeProp,
  to,
  asButton,
  onPress,
}: {
  item: { label: string; icon: React.ComponentType<{ className?: string }>; tourId?: string };
  active?: boolean;
  to?: string;
  asButton?: boolean;
  onPress?: () => void;
}) {
  const Icon = item.icon;

  if (asButton && onPress) {
    return (
      <motion.button
        type="button"
        onClick={onPress}
        data-tour={item.tourId}
        className={cn(
          'relative z-10 flex flex-1 min-w-0 min-h-[44px] rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
          activeProp && 'bg-green-100/85 dark:bg-emerald-900/45'
        )}
        aria-label={item.label}
        initial={false}
        animate={
          activeProp
            ? {
                scale: ACTIVE_TAB_SCALE,
                boxShadow: ACTIVE_TAB_SHADOW,
              }
            : {
                scale: 1,
                boxShadow: 'none',
              }
        }
        transition={NAV_ITEM_TRANSITION}
        whileTap={{ scale: 0.985 }}
      >
        <span className="flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 min-h-[44px] py-1 px-2">
          <span className="flex items-center justify-center h-5 w-5 shrink-0">
            <Icon
              className={cn(
                'h-5 w-5 shrink-0 transition-colors duration-200 ease-in-out',
                activeProp ? 'text-primary dark:text-emerald-100' : 'text-primary/60 dark:text-emerald-100/60'
              )}
            />
          </span>
          <span
            className={cn(
              'text-[10px] font-medium truncate max-w-[72px] text-center transition-colors duration-200 ease-in-out',
              activeProp ? 'text-primary dark:text-emerald-100' : 'text-primary/60 dark:text-emerald-100/60'
            )}
          >
            {item.label}
          </span>
        </span>
      </motion.button>
    );
  }

  if (!to) return null;

  const itemPath = to.replace(/\/+/g, '/');

  return (
    <NavLink
      to={itemPath}
      end={itemPath === '/'}
      data-tour={item.tourId}
      className="relative z-10 flex flex-1 min-w-0 min-h-[44px] rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      aria-label={item.label}
    >
      {({ isActive }) => (
        <motion.span
          className={cn(
            'flex flex-1 min-w-0 w-full h-full rounded-xl',
            isActive && 'bg-green-100/85 dark:bg-emerald-900/45'
          )}
          initial={false}
          animate={
            isActive
              ? {
                  scale: ACTIVE_TAB_SCALE,
                  boxShadow: ACTIVE_TAB_SHADOW,
                }
              : {
                  scale: 1,
                  boxShadow: 'none',
                }
          }
          transition={NAV_ITEM_TRANSITION}
          whileTap={{ scale: 0.985 }}
        >
          <span className="flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 min-h-[44px] py-1 px-2">
            <span className="flex items-center justify-center h-5 w-5 shrink-0">
              <Icon
                className={cn(
                  'h-5 w-5 shrink-0 transition-colors duration-200 ease-in-out',
                  isActive ? 'text-primary dark:text-emerald-100' : 'text-primary/60 dark:text-emerald-100/60'
                )}
              />
            </span>
            <span
              className={cn(
                'text-[10px] font-medium truncate max-w-[72px] text-center transition-colors duration-200 ease-in-out',
                isActive ? 'text-primary dark:text-emerald-100' : 'text-primary/60 dark:text-emerald-100/60'
              )}
            >
              {item.label}
            </span>
          </span>
        </motion.span>
      )}
    </NavLink>
  );
}
