import React, { useMemo } from 'react';
import { EmptyStateBlock } from './EmptyStateBlock';
import { ActivityFeedItem, type ActivityFeedItemData } from './ActivityFeedItem';

type Props = {
  timeline: ActivityFeedItemData[];
  activityLogs: ActivityFeedItemData[];
  employeeActivity: ActivityFeedItemData[];
};

function toTime(v: unknown): number {
  if (typeof v !== 'string') return 0;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function CompanyActivityTimelineTab({ timeline, activityLogs, employeeActivity }: Props) {
  const merged = useMemo(() => {
    const rows: ActivityFeedItemData[] = [...timeline, ...activityLogs, ...employeeActivity];
    rows.sort((x, y) => toTime(y.at) - toTime(x.at));

    const seen = new Set<string>();
    const deduped: ActivityFeedItemData[] = [];
    for (const r of rows) {
      const key = `${r.event_type ?? ''}-${r.at ?? ''}-${r.title ?? ''}-${r.subtitle ?? ''}-${r.module ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
    }

    return deduped.slice(0, 180);
  }, [timeline, activityLogs, employeeActivity]);

  if (!merged.length) {
    return (
      <EmptyStateBlock
        title="No recent activity"
        description="As the farm uses projects, harvest, expenses, and inventory, a unified timeline will build up here."
      />
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card/30 p-4 sm:p-5">
      <h3 className="text-sm font-semibold">Chronological feed</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Aggregated from module tables plus activity logs. Read-only intelligence for developers.
      </p>
      <div className="mt-4 divide-y divide-border/40">
        {merged.map((item, i) => (
          <ActivityFeedItem key={`${item.at}-${i}`} item={item} />
        ))}
      </div>
    </div>
  );
}
