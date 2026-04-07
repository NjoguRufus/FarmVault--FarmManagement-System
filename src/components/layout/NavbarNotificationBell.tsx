import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { useAuth } from '@/contexts/AuthContext';
import { resolveUserNotificationAudiences } from '@/lib/notificationAudience';
import type { NotificationBellSection } from '@/lib/notificationBellSection';

type BellVariant = 'main' | 'ambassador';

export interface NavbarNotificationBellProps {
  variant: BellVariant;
  /** Extra classes for the round trigger button */
  triggerClassName?: string;
}

export function NavbarNotificationBell({ variant, triggerClassName }: NavbarNotificationBellProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { notifications, markAsRead, markAllReadForSection } = useNotifications();

  const dualWorkspaceAmbassador = useMemo(() => {
    if (variant !== 'main' || !user) return false;
    const aud = resolveUserNotificationAudiences(user);
    return aud.has('ambassador') && aud.has('company');
  }, [variant, user]);

  const [activeTab, setActiveTab] = useState<NotificationBellSection>('workspace');

  const { visibleList, totalUnread, tabUnread } = useMemo(() => {
    const secOf = (n: (typeof notifications)[0]) => n.bellSection ?? 'workspace';

    if (variant === 'ambassador') {
      const list = notifications.filter((n) => secOf(n) === 'ambassador');
      return {
        visibleList: list,
        totalUnread: list.filter((n) => !n.read).length,
        tabUnread: { workspace: 0, ambassador: list.filter((n) => !n.read).length },
      };
    }

    const workspaceList = notifications.filter((n) => secOf(n) !== 'ambassador');
    const ambassadorList = notifications.filter((n) => secOf(n) === 'ambassador');
    const wUnread = workspaceList.filter((n) => !n.read).length;
    const aUnread = ambassadorList.filter((n) => !n.read).length;

    if (!dualWorkspaceAmbassador) {
      return {
        visibleList: workspaceList,
        totalUnread: wUnread,
        tabUnread: { workspace: wUnread, ambassador: aUnread },
      };
    }

    const tab = activeTab;
    const list = tab === 'workspace' ? workspaceList : ambassadorList;
    return {
      visibleList: list,
      totalUnread: wUnread + aUnread,
      tabUnread: { workspace: wUnread, ambassador: aUnread },
    };
  }, [notifications, variant, dualWorkspaceAmbassador, activeTab]);

  const sectionForMarkAll: NotificationBellSection =
    variant === 'ambassador' ? 'ambassador' : dualWorkspaceAmbassador ? activeTab : 'workspace';

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
              onClick={() => markAllReadForSection(sectionForMarkAll)}
              className="text-xs text-primary hover:underline shrink-0"
            >
              <CheckCheck className="h-3.5 w-3.5 inline mr-0.5" />
              Mark read
            </button>
          )}
        </div>

        {variant === 'main' && dualWorkspaceAmbassador && (
          <div className="flex gap-1 px-2 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('workspace')}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                activeTab === 'workspace'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/80 text-muted-foreground hover:bg-muted',
              )}
            >
              Workspace
              {tabUnread.workspace > 0 ? (
                <span className="ml-1 tabular-nums opacity-90">({tabUnread.workspace})</span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ambassador')}
              className={cn(
                'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                activeTab === 'ambassador'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/80 text-muted-foreground hover:bg-muted',
              )}
            >
              Ambassador
              {tabUnread.ambassador > 0 ? (
                <span className="ml-1 tabular-nums opacity-90">({tabUnread.ambassador})</span>
              ) : null}
            </button>
          </div>
        )}

        <DropdownMenuSeparator />
        <div className="overflow-y-auto max-h-[280px]">
          {visibleList.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted-foreground text-center">
              {variant === 'ambassador'
                ? 'No ambassador notifications yet.'
                : dualWorkspaceAmbassador && activeTab === 'ambassador'
                  ? 'No ambassador notifications yet.'
                  : 'No notifications yet.'}
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
