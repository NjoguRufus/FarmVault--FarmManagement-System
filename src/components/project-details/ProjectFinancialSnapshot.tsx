import React, { useState } from 'react';
import { List, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FinancialViewMode = 'list' | 'card';

export interface ProjectFinancialSnapshotProps {
  totalSpent: number;
  labourCost: number;
  inputCost: number;
  averageDailyCost: number;
  budgetRemaining?: number | null;
  formatCurrency: (amount: number) => string;
}

const METRICS = [
  { key: 'totalSpent' as const, label: 'Total Spent So Far' },
  { key: 'labourCost' as const, label: 'Labour Cost' },
  { key: 'inputCost' as const, label: 'Input Cost' },
  { key: 'averageDailyCost' as const, label: 'Average Daily Cost' },
] as const;

export function ProjectFinancialSnapshot({
  totalSpent,
  labourCost,
  inputCost,
  averageDailyCost,
  budgetRemaining,
  formatCurrency,
}: ProjectFinancialSnapshotProps) {
  const [viewMode, setViewMode] = useState<FinancialViewMode>('list');

  const values = {
    totalSpent: formatCurrency(totalSpent),
    labourCost: formatCurrency(labourCost),
    inputCost: formatCurrency(inputCost),
    averageDailyCost: formatCurrency(averageDailyCost),
  };

  return (
    <section className="space-y-4" aria-label="Financial snapshot">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Financial snapshot
        </h2>
        <div className="flex rounded-lg border border-border/60 p-0.5 bg-muted/30">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={cn(
              'rounded-md p-1.5 transition-colors',
              viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            aria-label="List view"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('card')}
            className={cn(
              'rounded-md p-1.5 transition-colors',
              viewMode === 'card' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
            aria-label="Card view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Card view */}
      <div className={cn('grid grid-cols-2 lg:grid-cols-4 gap-4', viewMode !== 'card' && 'hidden')}>
        {METRICS.map((m) => (
          <div
            key={m.key}
            className="rounded-xl border border-border/60 bg-card p-4 space-y-1"
          >
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {m.label}
            </p>
            <p className="text-lg font-semibold text-foreground tabular-nums">
              {values[m.key]}
            </p>
          </div>
        ))}
        {budgetRemaining != null && (
          <div className="rounded-xl border border-border/60 bg-card p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Budget Remaining
            </p>
            <p
              className={cn(
                'text-lg font-semibold tabular-nums',
                budgetRemaining >= 0 ? 'text-foreground' : 'text-destructive'
              )}
            >
              {formatCurrency(budgetRemaining)}
            </p>
          </div>
        )}
      </div>

      {/* List view */}
      <div className={cn('rounded-xl border border-border/60 bg-card overflow-hidden', viewMode !== 'list' && 'hidden')}>
        {METRICS.map((m, i) => (
          <div key={m.key}>
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-sm font-medium text-muted-foreground">
                {m.label}
              </span>
              <span className="text-sm font-semibold text-foreground tabular-nums shrink-0">
                {values[m.key]}
              </span>
            </div>
            {i < METRICS.length - 1 && (
              <div className="border-t border-border/50 mx-4" />
            )}
          </div>
        ))}
        {budgetRemaining != null && (
          <>
            <div className="border-t border-border/50 mx-4" />
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-sm font-medium text-muted-foreground">
                Budget Remaining
              </span>
              <span
                className={cn(
                  'text-sm font-semibold tabular-nums shrink-0',
                  budgetRemaining >= 0 ? 'text-foreground' : 'text-destructive'
                )}
              >
                {formatCurrency(budgetRemaining)}
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
