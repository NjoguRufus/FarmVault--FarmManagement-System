import React from 'react';
import { Calendar, AlertCircle, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SeasonInsightPanelProps {
  currentStage: string;
  harvestInDays: number | null;
  latestActivity: string | null;
  alerts: string[];
}

export function SeasonInsightPanel({
  currentStage,
  harvestInDays,
  latestActivity,
  alerts,
}: SeasonInsightPanelProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Season Insight
      </h3>

      <div className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">Current stage</p>
          <p className="font-semibold text-foreground">{currentStage}</p>
        </div>

        {harvestInDays != null && harvestInDays >= 0 && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-primary shrink-0" />
            <span className="text-foreground">
              Harvest expected in <strong>{harvestInDays} days</strong>
            </span>
          </div>
        )}

        {latestActivity && (
          <div className="flex items-start gap-2 text-sm">
            <Activity className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-muted-foreground">{latestActivity}</p>
          </div>
        )}

        {alerts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Key alerts</p>
            <ul className="space-y-1">
              {alerts.slice(0, 3).map((msg, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{msg}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
