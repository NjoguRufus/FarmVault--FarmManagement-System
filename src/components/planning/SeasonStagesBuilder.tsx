import React from 'react';
import { cn } from '@/lib/utils';

export interface StageItem {
  key: string;
  label: string;
  dayStart: number;
  dayEnd: number;
  color?: string;
}

export interface SeasonStagesBuilderProps {
  stages: StageItem[];
  /** Optional: highlight current stage index */
  currentStageIndex?: number | null;
}

export function SeasonStagesBuilder({ stages, currentStageIndex }: SeasonStagesBuilderProps) {
  if (!stages.length) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Season Stages
        </h2>
        <p className="text-sm text-muted-foreground">No stage template for this crop.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Season Stages
      </h2>
      <div className="space-y-2">
        {stages.map((stage, index) => (
          <div
            key={stage.key}
            className={cn(
              'flex items-center justify-between rounded-lg border px-3 py-2 text-sm',
              currentStageIndex === index
                ? 'border-primary/50 bg-primary/5'
                : 'border-border/60 bg-muted/20'
            )}
          >
            <span className="font-medium text-foreground">{stage.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              Day {stage.dayStart} – {stage.dayEnd}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
