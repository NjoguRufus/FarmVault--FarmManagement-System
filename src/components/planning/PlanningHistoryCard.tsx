import React from 'react';
import { History } from 'lucide-react';

export interface PlanHistoryEntry {
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  changedAt?: string;
  changedBy?: string;
}

export interface PlanningHistoryCardProps {
  entries: PlanHistoryEntry[];
  formatDate?: (date: string | unknown) => string;
}

export function PlanningHistoryCard({
  entries,
  formatDate = (d) => (typeof d === 'string' ? new Date(d).toLocaleDateString() : '—'),
}: PlanningHistoryCardProps) {
  const displayEntries = entries.slice(0, 10);

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Planning History
        </h2>
      </div>
      {!entries.length ? (
        <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {displayEntries.map((entry, i) => (
            <li
              key={i}
              className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs space-y-0.5"
            >
              <p className="font-medium text-foreground">
                {entry.field ?? 'Plan updated'} · {entry.reason ?? '—'}
              </p>
              {entry.changedAt && (
                <p className="text-muted-foreground">
                  {formatDate(entry.changedAt)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
