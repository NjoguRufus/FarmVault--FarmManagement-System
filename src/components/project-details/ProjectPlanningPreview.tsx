import React from 'react';
import { Calendar, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ProjectPlanningPreviewProps {
  hasPlan: boolean;
  plantingDate?: string | null;
  seedVariety?: string | null;
  expectedChallengesCount?: number;
  lastUpdated?: string | null;
  onPlanSeason: () => void;
  onViewFullPlan: () => void;
}

export function ProjectPlanningPreview({
  hasPlan,
  plantingDate,
  seedVariety,
  expectedChallengesCount = 0,
  lastUpdated,
  onPlanSeason,
  onViewFullPlan,
}: ProjectPlanningPreviewProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Season Plan
      </h3>

      {!hasPlan ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 sm:p-8 text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            No season plan yet. Set your planting date, seed or variety, and expected challenges to track progress.
          </p>
          <Button onClick={onPlanSeason} className="min-w-[140px]">
            <Calendar className="h-4 w-4 mr-2" />
            Plan Season
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {plantingDate && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Planting date:</span>
              <span className="font-medium text-foreground">{plantingDate}</span>
            </div>
          )}
          {seedVariety && (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Seed/variety:</span>
              <span className="font-medium text-foreground">{seedVariety}</span>
            </div>
          )}
          {expectedChallengesCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {expectedChallengesCount} expected challenge(s)
            </p>
          )}
          {lastUpdated && (
            <p className="text-xs text-muted-foreground">Last updated: {lastUpdated}</p>
          )}
          <Button variant="outline" size="sm" onClick={onViewFullPlan}>
            View Full Plan
          </Button>
        </div>
      )}
    </div>
  );
}
