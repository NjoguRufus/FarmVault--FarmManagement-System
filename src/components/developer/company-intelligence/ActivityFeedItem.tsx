import React from 'react';
import { Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDevDate } from './utils';

export type ActivityFeedItemData = {
  event_type?: string;
  title?: string;
  subtitle?: string | null;
  at?: string;
  actor?: string | null;
  module?: string;
  project_name?: string | null;
};

const moduleColors: Record<string, string> = {
  projects: 'bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-500/25',
  harvest: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/25',
  finance: 'bg-amber-500/15 text-amber-900 dark:text-amber-200 border-amber-500/25',
  inventory: 'bg-violet-500/15 text-violet-800 dark:text-violet-200 border-violet-500/25',
  employees: 'bg-rose-500/15 text-rose-800 dark:text-rose-200 border-rose-500/25',
  suppliers: 'bg-cyan-500/15 text-cyan-900 dark:text-cyan-200 border-cyan-500/25',
  activity: 'bg-muted text-muted-foreground border-border',
};

export function ActivityFeedItem({ item, className }: { item: ActivityFeedItemData; className?: string }) {
  const mod = (item.module ?? 'activity').toLowerCase();
  const badgeClass = moduleColors[mod] ?? moduleColors.activity;

  const clickable = typeof (item as any).__onViewDetails === 'function';
  const onView = clickable ? ((item as any).__onViewDetails as () => void) : null;

  return (
    <div
      className={cn(
        'relative flex gap-3 border-b border-border/40 py-3 last:border-0 sm:gap-4',
        className,
      )}
    >
      <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary/70 ring-4 ring-primary/10" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-md border px-1.5 py-0.5 text-[10px] font-medium', badgeClass)}>
            {(item.module ?? 'event').replace(/_/g, ' ')}
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{formatDevDate(item.at)}</span>
          {onView ? (
            <button
              type="button"
              onClick={onView}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted/30"
            >
              <Eye className="h-3 w-3" />
              View details
            </button>
          ) : null}
        </div>
        <p className="text-sm font-medium text-foreground">{item.title ?? 'Activity'}</p>
        {item.subtitle ? (
          <p className="text-xs text-muted-foreground line-clamp-2">{item.subtitle}</p>
        ) : null}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {item.project_name ? <span>Project: {item.project_name}</span> : null}
          {item.actor ? <span className="font-mono">Actor: {item.actor}</span> : null}
          {item.event_type ? <span className="opacity-70">{item.event_type.replace(/_/g, ' ')}</span> : null}
        </div>
      </div>
    </div>
  );
}
