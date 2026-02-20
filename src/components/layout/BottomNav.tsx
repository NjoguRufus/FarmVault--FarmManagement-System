import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { getMainNavItems, getMoreNavItems } from '@/config/navConfig';
import { MobileMoreDrawer } from './MobileMoreDrawer';

export function BottomNav() {
  const { user } = useAuth();
  const location = useLocation();
  const mainItems = getMainNavItems(user);
  const moreItems = getMoreNavItems(user);
  const [moreOpen, setMoreOpen] = useState(false);

  const handleMoreTap = () => {
    if (moreItems.length > 0) {
      setMoreOpen(true);
    }
  };

  const isMoreActive = moreItems.some((item) => {
    const itemPath = item.path.replace(/\/+/g, '/');
    const path = location.pathname.replace(/\/+/g, '/');
    return path === itemPath || (itemPath !== '/' && path.startsWith(itemPath + '/'));
  });

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 md:hidden flex items-center justify-around px-2 pt-2 bg-white/80 dark:bg-black/60 backdrop-blur-xl border-t border-border/50 rounded-t-2xl shadow-2xl safe-area-bottom"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        aria-label="Bottom navigation"
      >
        {mainItems.map((item) => {
          const itemPath = item.path.replace(/\/+/g, '/');
          const path = location.pathname.replace(/\/+/g, '/');
          const isActive =
            path === itemPath ||
            (itemPath !== '/' && path.startsWith(itemPath + '/'));
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={itemPath}
              end={itemPath === '/'}
              className={({ isActive: navActive }) => {
                const active = navActive || isActive;
                return cn(
                  'relative flex flex-col items-center justify-center min-w-0 flex-1 py-3 px-2 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2',
                  active && 'text-primary'
                );
              }}
              aria-label={item.label}
            >
              {({ isActive: navActive }) => {
                const active = navActive || isActive;
                return (
                  <>
                    {active && (
                      <motion.div
                        layoutId="bottom-nav-pill"
                        className="absolute inset-0 rounded-xl bg-primary/15 dark:bg-primary/20 shadow-[0_0_12px_rgba(45,74,62,0.25)] dark:shadow-[0_0_12px_rgba(45,74,62,0.35)]"
                        transition={{
                          type: 'spring',
                          stiffness: 400,
                          damping: 30,
                        }}
                      />
                    )}
                    <motion.span
                      className="relative z-10 flex flex-col items-center gap-0.5"
                      whileTap={{ scale: 0.9 }}
                      animate={{
                        scale: active ? 1.05 : 1,
                        y: active ? -2 : 0,
                      }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    >
                      <Icon
                        className={cn(
                          'h-5 w-5 shrink-0 transition-colors',
                          active ? 'text-primary' : 'text-muted-foreground'
                        )}
                      />
                      <span
                        className={cn(
                          'text-[10px] font-medium truncate max-w-full',
                          active ? 'text-primary' : 'text-muted-foreground'
                        )}
                      >
                        {item.label}
                      </span>
                    </motion.span>
                  </>
                );
              }}
            </NavLink>
          );
        })}

        {moreItems.length > 0 && (
          <button
            type="button"
            onClick={handleMoreTap}
            className={cn(
              'relative flex flex-col items-center justify-center min-w-0 flex-1 py-3 px-2 rounded-xl transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2',
              isMoreActive && 'text-primary'
            )}
            aria-label="More menu"
            aria-expanded={moreOpen}
          >
            {isMoreActive && (
              <motion.div
                layoutId="bottom-nav-pill"
                className="absolute inset-0 rounded-xl bg-primary/15 dark:bg-primary/20 shadow-[0_0_12px_rgba(45,74,62,0.25)] dark:shadow-[0_0_12px_rgba(45,74,62,0.35)]"
                transition={{
                  type: 'spring',
                  stiffness: 400,
                  damping: 30,
                }}
              />
            )}
            <motion.span
              className="relative z-10 flex flex-col items-center gap-0.5"
              whileTap={{ scale: 0.9 }}
              animate={{
                scale: isMoreActive ? 1.05 : 1,
                y: isMoreActive ? -2 : 0,
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <MoreHorizontal
                className={cn(
                  'h-5 w-5 shrink-0 transition-colors',
                  isMoreActive ? 'text-primary' : 'text-muted-foreground'
                )}
              />
              <span
                className={cn(
                  'text-[10px] font-medium',
                  isMoreActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                More
              </span>
            </motion.span>
          </button>
        )}
      </nav>

      <MobileMoreDrawer
        open={moreOpen}
        onOpenChange={setMoreOpen}
        items={moreItems}
      />
    </>
  );
}
