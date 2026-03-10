import React from 'react';
import { ChevronLeft, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface PlanningHeroProps {
  projectName: string;
  onBack: () => void;
}

export function PlanningHero({ projectName, onBack }: PlanningHeroProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:text-foreground" onClick={onBack}>
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to Project
      </Button>
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold text-foreground truncate">{projectName}</h1>
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-foreground">
          <span>Planning</span>
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
                Changes here affect project timelines and reports. All edits are logged as immutable
                change-of-plan events.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
