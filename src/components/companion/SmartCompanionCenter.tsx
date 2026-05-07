import React, { useMemo, useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  Bell,
  Sun,
  Moon,
  BarChart3,
  Leaf,
  Trash2,
  CheckCheck,
  Inbox,
} from 'lucide-react';
import { useFarmerSmartInbox, type FarmerSmartInboxRow } from '@/hooks/useFarmerSmartInbox';
import { useNotifications } from '@/contexts/NotificationContext';

type Props = {
  companyId: string | null;
  clerkUserId: string | null;
  trigger?: React.ReactNode;
};

type SlotMeta = {
  icon: React.ElementType;
  label: string;
  color: string;
  bg: string;
  border: string;
};

const SLOT_META: Record<string, SlotMeta> = {
  morning: {
    icon: Sun,
    label: 'Morning',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800/40',
  },
  evening: {
    icon: Moon,
    label: 'Evening',
    color: 'text-violet-600 dark:text-violet-400',
    bg: 'bg-violet-50 dark:bg-violet-950/30',
    border: 'border-violet-200 dark:border-violet-800/40',
  },
  weekly: {
    icon: BarChart3,
    label: 'Weekly',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-800/40',
  },
};

function CompanionMessageCard({
  row,
  onDismiss,
  dismissing,
}: {
  row: FarmerSmartInboxRow;
  onDismiss: (id: string) => void;
  dismissing: boolean;
}) {
  const meta = SLOT_META[row.slot] ?? SLOT_META.morning;
  const Icon = meta.icon;
  const age = formatDistanceToNow(new Date(row.created_at), { addSuffix: true });

  return (
    <div
      className={cn(
        'relative rounded-xl border p-4 transition-opacity',
        meta.bg,
        meta.border,
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/70 dark:bg-black/20', meta.border, 'border')}>
          <Icon className={cn('h-4 w-4', meta.color)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className={cn('text-xs font-semibold uppercase tracking-wide', meta.color)}>
              {meta.label} companion
            </span>
            <span className="text-[10px] text-muted-foreground">{age}</span>
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
            {row.body}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {format(new Date(row.created_at), 'EEEE, MMM d')}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground/60 hover:text-destructive"
          disabled={dismissing}
          onClick={() => onDismiss(row.id)}
          aria-label="Dismiss message"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function SystemNotificationItem({
  n,
  onRead,
}: {
  n: { id: string; title: string; message?: string; read: boolean; createdAt: number };
  onRead: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full flex-col items-start gap-1 rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted/60',
        !n.read && 'bg-primary/5',
      )}
      onClick={() => onRead(n.id)}
    >
      {!n.read && (
        <span className="mb-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
      )}
      <span className="text-sm font-medium leading-snug text-foreground">{n.title}</span>
      {n.message && (
        <span className="text-xs leading-relaxed text-muted-foreground line-clamp-2">{n.message}</span>
      )}
      <span className="text-[10px] text-muted-foreground">
        {formatDistanceToNow(n.createdAt, { addSuffix: true })}
      </span>
    </button>
  );
}

export function SmartCompanionCenter({ companyId, clerkUserId, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('system');

  const {
    data: inboxMessages = [],
    dismiss,
    dismissing,
    isLoading: inboxLoading,
  } = useFarmerSmartInbox(companyId, clerkUserId);

  const { notifications, markAsRead, markAllReadForSection } = useNotifications();

  const systemNotifications = useMemo(
    () => notifications.filter((n) => n.type === 'company'),
    [notifications],
  );

  const systemUnread = useMemo(
    () => systemNotifications.filter((n) => !n.read).length,
    [systemNotifications],
  );

  const companionCount = inboxMessages.length;
  const totalBadge = companionCount + systemUnread;

  const groupedMessages = useMemo(() => {
    const groups: Record<string, FarmerSmartInboxRow[]> = { morning: [], evening: [], weekly: [] };
    for (const m of inboxMessages) {
      (groups[m.slot] ?? (groups[m.slot] = [])).push(m);
    }
    return groups;
  }, [inboxMessages]);

  const defaultTrigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="relative h-8 w-8 md:h-10 md:w-10 rounded-lg"
      aria-label="Open notifications"
    >
      <Bell className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
      {totalBadge > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground pointer-events-none">
          {totalBadge > 99 ? '99+' : totalBadge}
        </span>
      )}
    </Button>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? defaultTrigger}
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        {/* Header */}
        <SheetHeader className="border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/40">
              <Leaf className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <SheetTitle className="text-base font-semibold">Farm Companion</SheetTitle>
              <p className="text-xs text-muted-foreground">Your daily farming companion</p>
            </div>
          </div>
        </SheetHeader>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <TabsList className="mx-5 mt-3 grid w-auto grid-cols-2 rounded-xl bg-muted/60">
            <TabsTrigger value="system" className="gap-1.5 rounded-lg text-xs">
              <Bell className="h-3.5 w-3.5" />
              Alerts
              {systemUnread > 0 && (
                <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[9px]">
                  {systemUnread}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="companion" className="gap-1.5 rounded-lg text-xs">
              <Leaf className="h-3.5 w-3.5" />
              Messages
              {companionCount > 0 && (
                <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[9px]">
                  {companionCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* --- Companion Messages Tab --- */}
          <TabsContent
            value="companion"
            className="mt-0 flex-1 overflow-y-auto px-5 py-4"
          >
            {inboxLoading ? (
              <div className="flex flex-col gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            ) : companionCount === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/40">
                  <Inbox className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">No messages yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Morning and evening companion messages will appear here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {(['morning', 'evening', 'weekly'] as const).map((slot) => {
                  const msgs = groupedMessages[slot];
                  if (!msgs?.length) return null;
                  const meta = SLOT_META[slot];
                  return (
                    <div key={slot} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 px-1">
                        <meta.icon className={cn('h-3.5 w-3.5', meta.color)} />
                        <span className={cn('text-xs font-semibold uppercase tracking-wide', meta.color)}>
                          {meta.label}
                        </span>
                        <span className="text-xs text-muted-foreground">({msgs.length})</span>
                      </div>
                      {msgs.map((row) => (
                        <CompanionMessageCard
                          key={row.id}
                          row={row}
                          onDismiss={(id) => dismiss(id)}
                          dismissing={dismissing}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* --- System Alerts Tab --- */}
          <TabsContent
            value="system"
            className="mt-0 flex-1 overflow-y-auto px-5 py-4"
          >
            {systemNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                  <Bell className="h-7 w-7 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">No alerts</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Farm and system alerts will appear here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {systemUnread > 0 && (
                  <div className="mb-3 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs text-muted-foreground"
                      onClick={() => markAllReadForSection('company')}
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark all read
                    </Button>
                  </div>
                )}
                {systemNotifications.map((n) => (
                  <SystemNotificationItem
                    key={n.id}
                    n={n}
                    onRead={markAsRead}
                  />
                ))}
              </div>
            )}
          </TabsContent>

        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
