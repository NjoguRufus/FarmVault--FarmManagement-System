import React from 'react';

export interface PlanningSummaryCardProps {
  nextStage: string | null;
  expectedHarvestWindow: string | null;
  totalStages: number;
  seasonDuration?: string | null;
  expectedChallengesCount?: number;
}

export function PlanningSummaryCard({
  nextStage,
  expectedHarvestWindow,
  totalStages,
  seasonDuration,
  expectedChallengesCount,
}: PlanningSummaryCardProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Planning Summary
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <p className="text-xs text-muted-foreground mb-0.5">Total stages</p>
          <p className="text-sm font-medium text-foreground">{totalStages}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <p className="text-xs text-muted-foreground mb-0.5">Expected harvest</p>
          <p className="text-sm font-medium text-foreground">{expectedHarvestWindow ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <p className="text-xs text-muted-foreground mb-0.5">Season duration</p>
          <p className="text-sm font-medium text-foreground">{seasonDuration ?? '—'}</p>
        </div>
        <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
          <p className="text-xs text-muted-foreground mb-0.5">Expected challenges</p>
          <p className="text-sm font-medium text-foreground">{typeof expectedChallengesCount === 'number' ? expectedChallengesCount : '—'}</p>
        </div>
      </div>
      {nextStage && (
        <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
          <p className="text-xs text-muted-foreground mb-0.5">Next stage</p>
          <p className="text-sm font-medium text-foreground">{nextStage}</p>
        </div>
      )}
    </div>
  );
}
