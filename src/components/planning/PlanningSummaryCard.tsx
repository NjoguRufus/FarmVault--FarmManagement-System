import React from 'react';

export interface PlanningSummaryCardProps {
  nextStage: string | null;
  expectedHarvestWindow: string | null;
  totalStages: number;
}

export function PlanningSummaryCard({
  nextStage,
  expectedHarvestWindow,
  totalStages,
}: PlanningSummaryCardProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Planning Summary
      </h2>
      <div className="space-y-3">
        {nextStage && (
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Next stage</p>
            <p className="text-sm font-medium text-foreground">{nextStage}</p>
          </div>
        )}
        {expectedHarvestWindow && (
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Expected harvest window</p>
            <p className="text-sm font-medium text-foreground">{expectedHarvestWindow}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Total stages</p>
          <p className="text-sm font-medium text-foreground">{totalStages}</p>
        </div>
      </div>
    </div>
  );
}
