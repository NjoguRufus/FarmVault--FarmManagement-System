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

  const summarize = (entry: PlanHistoryEntry) => {
    const field = (entry.field ?? '').toLowerCase();
    if (field.includes('planting')) return 'Planting date updated';
    if (field.includes('seed')) return 'Seed plan updated';
    if (field.includes('challenge')) return 'Challenge updated';
    if (field.includes('stage')) return 'Stages updated';
    return 'Plan updated';
  };

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
              className="rounded-lg border border-border/40 bg-muted/15 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-foreground">
                  {entry.changedAt ? formatDate(entry.changedAt) : '—'} — {summarize(entry)}
                </p>
                {entry.changedBy && (
                  <p className="text-xs text-muted-foreground">
                    {entry.changedBy}
                  </p>
                )}
              </div>
              {entry.reason && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {entry.reason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
