import React from 'react';
import { ChevronLeft, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface PlanningHeroProps {
  projectName: string;
  plantingDate?: string | null;
  expectedHarvest?: string | null;
  seasonLength?: string | null;
  currentStage?: string | null;
  onBack: () => void;
}

export function PlanningHero({
  projectName,
  plantingDate,
  expectedHarvest,
  seasonLength,
  currentStage,
  onBack,
}: PlanningHeroProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back to Project
        </Button>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-foreground">
            <span>Season Planning</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:text-foreground cursor-help"
                  aria-label="More information"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p>
                  Changes here affect timelines and reports. All edits are logged as change-of-plan events.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-semibold text-foreground truncate">{projectName}</h1>
        <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
            <p className="text-xs text-muted-foreground">Planting Date</p>
            <p className="font-medium text-foreground">{plantingDate ?? 'Not set'}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
            <p className="text-xs text-muted-foreground">Expected Harvest</p>
            <p className="font-medium text-foreground">{expectedHarvest ?? '—'}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
            <p className="text-xs text-muted-foreground">Season Length</p>
            <p className="font-medium text-foreground">{seasonLength ?? '—'}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-card px-3 py-2">
            <p className="text-xs text-muted-foreground">Current Stage</p>
            <p className="font-medium text-foreground">{currentStage ?? '—'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
