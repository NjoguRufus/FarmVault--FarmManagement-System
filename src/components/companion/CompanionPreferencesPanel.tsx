import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Sun, Moon, BarChart3, AlertCircle, Mail, Bell, Smartphone } from 'lucide-react';
import { useCompanionPreferences } from '@/hooks/useCompanionPreferences';

type Props = {
  clerkUserId: string | null;
};

type PrefRow = {
  key: keyof ReturnType<typeof useCompanionPreferences>['prefs'];
  label: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  group: 'type' | 'channel';
};

const ROWS: PrefRow[] = [
  {
    key: 'morning_enabled',
    label: 'Morning messages',
    description: 'Daily motivation and farm check-in (6–8 AM)',
    icon: Sun,
    iconColor: 'text-amber-500',
    group: 'type',
  },
  {
    key: 'evening_enabled',
    label: 'Evening reflections',
    description: 'End-of-day recap and activity logging prompt (6–9 PM)',
    icon: Moon,
    iconColor: 'text-violet-500',
    group: 'type',
  },
  {
    key: 'inactivity_enabled',
    label: 'Inactivity nudges',
    description: 'Gentle reminders when you haven\'t visited in a few days',
    icon: AlertCircle,
    iconColor: 'text-emerald-500',
    group: 'type',
  },
  {
    key: 'weekly_summary_enabled',
    label: 'Weekly summary',
    description: 'Sunday evening recap of your farm\'s week',
    icon: BarChart3,
    iconColor: 'text-blue-500',
    group: 'type',
  },
  {
    key: 'email_enabled',
    label: 'Email delivery',
    description: 'Receive companion messages to your email inbox',
    icon: Mail,
    iconColor: 'text-slate-500',
    group: 'channel',
  },
  {
    key: 'in_app_enabled',
    label: 'In-app messages',
    description: 'Show messages in this companion center',
    icon: Bell,
    iconColor: 'text-slate-500',
    group: 'channel',
  },
];

function PrefToggleRow({
  row,
  value,
  onChange,
  disabled,
}: {
  row: PrefRow;
  value: boolean;
  onChange: () => void;
  disabled: boolean;
}) {
  const Icon = row.icon;
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className={cn('h-3.5 w-3.5', row.iconColor)} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{row.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{row.description}</p>
        </div>
      </div>
      <Switch
        checked={value}
        onCheckedChange={onChange}
        disabled={disabled}
        className="shrink-0 mt-0.5"
        aria-label={row.label}
      />
    </div>
  );
}

export function CompanionPreferencesPanel({ clerkUserId }: Props) {
  const { prefs, isLoading, isSaving, toggle } = useCompanionPreferences(clerkUserId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-52" />
              </div>
            </div>
            <Skeleton className="h-5 w-9 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  const typeRows    = ROWS.filter((r) => r.group === 'type');
  const channelRows = ROWS.filter((r) => r.group === 'channel');

  return (
    <div className="flex flex-col gap-6">
      {/* Message types */}
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Message types
        </p>
        <div className="divide-y divide-border">
          {typeRows.map((row) => (
            <PrefToggleRow
              key={row.key}
              row={row}
              value={prefs[row.key] as boolean}
              onChange={() => toggle(row.key as Parameters<typeof toggle>[0])}
              disabled={isSaving}
            />
          ))}
        </div>
      </div>

      {/* Delivery channels */}
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Delivery channels
        </p>
        <div className="divide-y divide-border">
          {channelRows.map((row) => (
            <PrefToggleRow
              key={row.key}
              row={row}
              value={prefs[row.key] as boolean}
              onChange={() => toggle(row.key as Parameters<typeof toggle>[0])}
              disabled={isSaving}
            />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex items-start gap-2.5">
          <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-xs font-medium text-foreground">Push notifications</p>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
              Browser and mobile push notifications are managed in Notification Settings in your account preferences.
            </p>
          </div>
        </div>
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        Changes save automatically. Companion messages are always warm, supportive, and easy to dismiss.
      </p>
    </div>
  );
}
