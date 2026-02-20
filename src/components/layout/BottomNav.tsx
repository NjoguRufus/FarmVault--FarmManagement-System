import React, { useState, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { getMainNavItems, getMoreNavItems } from '@/config/navConfig';
import { MobileMoreDrawer } from './MobileMoreDrawer';

const POP_EASING = [0.2, 0.9, 0.2, 1] as const;
const POP_DURATION = 0.22;

export function BottomNav() {
  const { user } = useAuth();
  const location = useLocation();
  const mainItems = getMainNavItems(user);
  const moreItems = getMoreNavItems(user);
  const [moreOpen, setMoreOpen] = useState(false);

  const tabs = useMemo(() => {
    const list = mainItems.map((item) => ({ ...item, type: 'link' as const }));
    if (moreItems.length > 0) {
      list.push({
        label: 'More',
        path: '',
        icon: MoreHorizontal,
        group: 'main' as const,
        type: 'more' as const,
      });
    }
    return list;
  }, [mainItems, moreItems.length]);

  const handleMoreTap = () => {
    if (moreItems.length > 0) setMoreOpen(true);
  };

  const isMoreActive = useMemo(() => {
    return moreItems.some((m) => {
      const mp = m.path.replace(/\/+/g, '/');
      const path = location.pathname.replace(/\/+/g, '/');
      return path === mp || (mp !== '/' && path.startsWith(mp + '/'));
    });
  }, [moreItems, location.pathname]);

  return (
    <>
      <nav
        className="fixed left-1/2 -translate-x-1/2 z-40 md:hidden w-[92%] max-w-[480px] rounded-[18px] min-h-[52px] flex items-center justify-around px-1 py-1.5 gap-1"
        style={{
          bottom: 'max(14px, calc(14px + env(safe-area-inset-bottom, 0px)))',
          background: 'linear-gradient(to bottom, #174f3a, #0e2f22)',
          boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
        }}
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
              active={false}
              to={item.path}
            />
          );
        })}
      </nav>

      <MobileMoreDrawer open={moreOpen} onOpenChange={setMoreOpen} items={moreItems} />
    </>
  );
}

const GLASS_BG = 'rgba(255, 255, 255, 0.2)';
const ACTIVE_SHADOW =
  '0 8px 24px rgba(0,0,0,0.35), 0 4px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.5)';
const POP_KEYFRAMES = {
  scale: [1, 1.08, 1],
  y: [0, -4, -2],
};
const POP_TRANSITION = {
  duration: POP_DURATION,
  ease: POP_EASING,
};

function NavItem({
  item,
  active: activeProp,
  to,
  asButton,
  onPress,
}: {
  item: { label: string; icon: React.ComponentType<{ className?: string }> };
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
        className={cn(
          'flex flex-1 min-w-0 min-h-[40px] rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
          activeProp && 'backdrop-blur-xl border border-white/30'
        )}
        aria-label={item.label}
        initial={false}
        key={activeProp ? 'active' : 'inactive'}
        animate={
          activeProp
            ? {
                background: GLASS_BG,
                boxShadow: ACTIVE_SHADOW,
                ...POP_KEYFRAMES,
              }
            : {
                background: 'transparent',
                boxShadow: 'none',
                y: 0,
                scale: 1,
              }
        }
        transition={POP_TRANSITION}
        whileTap={{ scale: 0.98 }}
      >
        <span className="flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 min-h-[40px] py-1 px-2">
          <span className="flex items-center justify-center h-5 w-5 shrink-0">
            <Icon
              className={cn(
                'h-5 w-5 shrink-0 transition-colors duration-200',
                activeProp ? 'text-white' : 'text-white/70'
              )}
            />
          </span>
          <span
            className={cn(
              'text-[10px] font-medium truncate max-w-[72px] text-center transition-colors duration-200',
              activeProp ? 'text-white' : 'text-white/70'
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
        className="flex flex-1 min-w-0 min-h-[40px] rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      aria-label={item.label}
    >
      {({ isActive }) => (
        <motion.span
          className={cn(
            'flex flex-1 min-w-0 w-full h-full rounded-xl',
            isActive && 'backdrop-blur-xl border border-white/30'
          )}
          initial={false}
          key={isActive ? 'active' : 'inactive'}
          animate={
            isActive
              ? {
                  background: GLASS_BG,
                  boxShadow: ACTIVE_SHADOW,
                  ...POP_KEYFRAMES,
                }
              : {
                  background: 'transparent',
                  boxShadow: 'none',
                  y: 0,
                  scale: 1,
                }
          }
          transition={POP_TRANSITION}
          whileTap={{ scale: 0.98 }}
        >
          <span className="flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 min-h-[40px] py-1 px-2">
            <span className="flex items-center justify-center h-5 w-5 shrink-0">
              <Icon
                className={cn(
                  'h-5 w-5 shrink-0 transition-colors duration-200',
                  isActive ? 'text-white' : 'text-white/70'
                )}
              />
            </span>
            <span
              className={cn(
                'text-[10px] font-medium truncate max-w-[72px] text-center transition-colors duration-200',
                isActive ? 'text-white' : 'text-white/70'
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
