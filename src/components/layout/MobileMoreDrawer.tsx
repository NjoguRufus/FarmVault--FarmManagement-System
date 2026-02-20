import React, { useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
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

export function MobileMoreDrawer({
  open,
  onOpenChange,
  items,
}: MobileMoreDrawerProps) {
  const location = useLocation();

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    },
    [onOpenChange]
  );

  if (items.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl border-t border-border/50 bg-white/90 dark:bg-black/80 backdrop-blur-xl max-h-[85vh] flex flex-col gap-0 p-0"
        onKeyDown={handleKeyDown}
      >
        <div
          className="mx-auto mt-3 h-1.5 w-14 shrink-0 rounded-full bg-muted-foreground/30"
          aria-hidden
        />
        <SheetHeader className="px-6 pb-2 text-left">
          <SheetTitle className="sr-only">More menu</SheetTitle>
          <SheetDescription className="sr-only">
            Additional navigation options
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-8 safe-area-bottom" style={{ paddingBottom: 'max(2rem, calc(2rem + env(safe-area-inset-bottom)))' }}>
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
      </SheetContent>
    </Sheet>
  );
}
