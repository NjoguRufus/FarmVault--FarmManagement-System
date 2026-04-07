import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/contexts/NotificationContext';
import { notificationPortalFromPathname, type NotificationPortalType } from '@/lib/notificationBellSection';

type BellVariant = 'main' | 'ambassador';

export interface NavbarNotificationBellProps {
  variant: BellVariant;
  /** Extra classes for the round trigger button */
  triggerClassName?: string;
}

function emptyMessageForPortal(portal: NotificationPortalType): string {
  switch (portal) {
    case 'ambassador':
      return 'No ambassador notifications yet.';
    case 'developer':
      return 'No developer notifications yet.';
    default:
      return 'No notifications yet.';
  }
}

export function NavbarNotificationBell({ variant, triggerClassName }: NavbarNotificationBellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications, markAsRead, markAllReadForSection } = useNotifications();

  const notificationType = notificationPortalFromPathname(location.pathname);

  const { visibleList, totalUnread } = useMemo(() => {
    const list = notifications.filter((n) => n.type === notificationType);
    return {
      visibleList: list,
      totalUnread: list.filter((n) => !n.read).length,
    };
  }, [notifications, notificationType]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'relative flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg hover:bg-muted transition-colors',
          variant === 'main' ? 'mr-1 md:mr-0' : '',
          triggerClassName,
        )}
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
        {totalUnread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-2 py-1.5 gap-2">
          <DropdownMenuLabel className="p-0 shrink-0">
            {variant === 'ambassador' ? 'Ambassador alerts' : 'Notifications'}
          </DropdownMenuLabel>
          {visibleList.length > 0 && (
            <button
              type="button"
              onClick={() => markAllReadForSection(notificationType)}
              className="text-xs text-primary hover:underline shrink-0"
            >
              <CheckCheck className="h-3.5 w-3.5 inline mr-0.5" />
              Mark read
            </button>
          )}
        </div>

        <DropdownMenuSeparator />
        <div className="overflow-y-auto max-h-[280px]">
          {visibleList.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground text-center">
              {emptyMessageForPortal(notificationType)}
            </p>
          ) : (
            visibleList.map((n) => (
              <DropdownMenuItem
                key={n.id}
                className={cn(
                  'flex flex-col items-start gap-0.5 cursor-pointer py-3',
                  !n.read && 'bg-muted/50',
                )}
                onClick={() => {
                  markAsRead(n.id);
                  const p = n.navigatePath?.trim();
                  if (p?.startsWith('/')) navigate(p);
                }}
              >
                <span className="font-medium text-sm text-foreground">{n.title}</span>
                {n.message && (
                  <span className="text-xs text-muted-foreground line-clamp-2">{n.message}</span>
                )}
                <span className="text-[10px] text-muted-foreground mt-0.5">
                  {formatDistanceToNow(n.createdAt, { addSuffix: true })}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
