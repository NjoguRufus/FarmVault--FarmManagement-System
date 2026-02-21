import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, type PanInfo } from 'framer-motion';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/config/navConfig';

interface MobileMoreDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NavItem[];
}

const BOTTOM_NAV_TOP_OFFSET_PX = 48;
const DRAWER_CHROME_PX = 56; // drag handle + header spacing
const DRAWER_ROW_PX = 52; // each nav row target height
const DRAWER_BOTTOM_PADDING_PX = 12;
const MAX_BASE_VISIBLE_ROWS = 4;

export function MobileMoreDrawer({
  open,
  onOpenChange,
  items,
}: MobileMoreDrawerProps) {
  const location = useLocation();
  const baseVisibleRows = Math.max(1, Math.min(items.length, MAX_BASE_VISIBLE_ROWS));
  const estimatedHeightPx =
    DRAWER_CHROME_PX + baseVisibleRows * DRAWER_ROW_PX + DRAWER_BOTTOM_PADDING_PX;
  const [drawerHeightPx, setDrawerHeightPx] = useState<number>(estimatedHeightPx);
  const drawerHeightRef = useRef<number>(estimatedHeightPx);
  const panStartHeightRef = useRef<number>(estimatedHeightPx);

  const getMaxHeightPx = useCallback(() => {
    if (typeof window === 'undefined') return 640;
    return Math.max(220, window.innerHeight - BOTTOM_NAV_TOP_OFFSET_PX);
  }, []);

  const clampDrawerHeight = useCallback(
    (value: number) => {
      const minHeight = Math.min(estimatedHeightPx, getMaxHeightPx());
      return Math.min(getMaxHeightPx(), Math.max(minHeight, value));
    },
    [estimatedHeightPx, getMaxHeightPx]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    },
    [onOpenChange]
  );

  useEffect(() => {
    if (!open) return;
    const nextHeight = clampDrawerHeight(estimatedHeightPx);
    setDrawerHeightPx(nextHeight);
    drawerHeightRef.current = nextHeight;
    panStartHeightRef.current = nextHeight;
  }, [open, estimatedHeightPx, clampDrawerHeight]);

  const handlePanStart = useCallback(() => {
    panStartHeightRef.current = drawerHeightRef.current;
  }, []);

  const handlePan = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const nextHeight = clampDrawerHeight(panStartHeightRef.current - info.offset.y);
      setDrawerHeightPx(nextHeight);
      drawerHeightRef.current = nextHeight;
    },
    [clampDrawerHeight]
  );

  const handlePanEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const baseHeight = clampDrawerHeight(estimatedHeightPx);
      const nearBase = drawerHeightRef.current <= baseHeight + 8;
      const closeGesture = info.offset.y > 150 || info.velocity.y > 900;

      if (nearBase && closeGesture) {
        onOpenChange(false);
        return;
      }

      if (drawerHeightRef.current < baseHeight) {
        setDrawerHeightPx(baseHeight);
        drawerHeightRef.current = baseHeight;
      }
    },
    [clampDrawerHeight, estimatedHeightPx, onOpenChange]
  );

  if (items.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="w-[92%] max-w-[480px] mx-auto rounded-t-3xl border-t border-border/50 bg-white/90 dark:bg-black/80 backdrop-blur-xl flex flex-col gap-0 p-0 overflow-hidden"
        style={{
          bottom: `${BOTTOM_NAV_TOP_OFFSET_PX}px`,
          height: `min(${drawerHeightPx}px, calc(100vh - ${BOTTOM_NAV_TOP_OFFSET_PX}px))`,
          maxHeight: `calc(100vh - ${BOTTOM_NAV_TOP_OFFSET_PX}px)`,
        }}
        onKeyDown={handleKeyDown}
      >
        <div className="flex h-full flex-col gap-0">
          <motion.button
            type="button"
            aria-label="Drag drawer"
            className="mx-auto mt-2 flex h-6 w-20 items-center justify-center touch-none cursor-grab active:cursor-grabbing"
            onPanStart={handlePanStart}
            onPan={handlePan}
            onPanEnd={handlePanEnd}
          >
            <span
              className="h-1.5 w-14 shrink-0 rounded-full bg-muted-foreground/30"
              aria-hidden
            />
          </motion.button>
          <SheetHeader className="px-4 pb-1 text-left">
            <SheetTitle className="sr-only">More menu</SheetTitle>
            <SheetDescription className="sr-only">
              Additional navigation options
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
            <ul className="space-y-0.5 py-2">
              {items.map((item) => {
                const itemPath = item.path.replace(/\/+/g, '/');
                const path = location.pathname.replace(/\/+/g, '/');
                const isActive =
                  path === itemPath ||
                  (itemPath !== '/' && path.startsWith(itemPath + '/'));
                const Icon = item.icon;

                return (
                  <li key={item.path}>
                    <Link
                      to={itemPath}
                      onClick={() => onOpenChange(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2',
                        isActive
                          ? 'bg-primary/15 text-primary dark:bg-primary/20'
                          : 'text-foreground hover:bg-muted/50'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-5 w-5 shrink-0',
                          isActive ? 'text-primary' : 'text-muted-foreground'
                        )}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
