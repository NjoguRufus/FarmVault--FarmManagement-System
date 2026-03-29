import React from 'react';
import { ChevronLeft, MoreHorizontal, Pencil, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Project } from '@/types';

export interface ProjectHeroCardProps {
  project: Project;
  onBack: () => void;
  onEditProject: () => void;
  onPlanSeason: () => void;
  /** e.g. "Day 32 of Season" or "Not planted yet" */
  dayOfSeason: string;
  /** e.g. "Vegetative Growth" */
  currentStage: string;
  /** e.g. "Dec 15, 2025" or null */
  expectedHarvest: string | null;
  /** e.g. "First harvest in 18 days" */
  nextMilestone: string | null;
  /** Location from project */
  location: string;
  /** Field size e.g. "2.5 ac" */
  fieldSize: string;
  /** Optional hero/banner image URL (e.g. farm or crop image) */
  heroImageUrl?: string | null;
  /** When true, hide edit/plan actions (e.g. closed project). */
  readOnly?: boolean;
}

export function ProjectHeroCard({
  project,
  onBack,
  onEditProject,
  onPlanSeason,
  dayOfSeason,
  currentStage,
  expectedHarvest,
  nextMilestone,
  location,
  fieldSize,
  heroImageUrl,
  readOnly = false,
}: ProjectHeroCardProps) {
  const cropLabel = project.cropType?.replace(/-/g, ' ') ?? 'Crop';
  const plantingDateStr = project.plantingDate
    ? new Date(project.plantingDate as any).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';

  const statusBadgeClass = cn(
    'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium capitalize backdrop-blur-sm',
    project.status === 'active' && 'bg-emerald-100/90 text-emerald-950',
    project.status === 'planning' && 'bg-amber-100/90 text-amber-900',
    project.status === 'completed' && 'bg-emerald-100/70 text-emerald-900',
    project.status === 'archived' && 'bg-emerald-100/60 text-emerald-800',
    project.status === 'closed' && 'bg-rose-100/80 text-rose-900'
  );

  return (
    <div className="w-full rounded-none sm:rounded-2xl border-0 sm:border border-border/60 bg-card shadow-sm overflow-hidden">
      {/* Hero banner / farm image – full width; on mobile identity lives inside, soft fade at bottom */}
      <div
        className={cn(
          'relative w-full min-w-full',
          'h-[280px] sm:h-44 md:h-48',
          !heroImageUrl && 'bg-gradient-to-br from-primary/20 via-primary/10 to-background'
        )}
      >
        {heroImageUrl ? (
          <img
            src={heroImageUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 bg-gradient-to-br from-emerald-900/40 via-emerald-800/20 to-background"
            aria-hidden
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/20 to-black/10" />
        {/* Smooth bottom fade: thick opaque band at bottom then fades upwards; slimmer on desktop */}
        <div
          className="absolute bottom-0 left-0 right-0 h-40 sm:h-24 pointer-events-none"
          style={{ background: 'linear-gradient(to top, hsl(var(--background)) 0%, hsl(var(--background)) 45%, transparent 100%)' }}
          aria-hidden
        />

        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10">
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 bg-background/90 text-foreground hover:bg-background shadow-sm"
            onClick={onBack}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          {!readOnly ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon"
                  className="shrink-0 rounded-full bg-background/90 text-foreground hover:bg-background shadow-sm"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEditProject}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Project
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onPlanSeason}>
                  <Calendar className="h-4 w-4 mr-2" />
                  Plan Season
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="h-9 w-9 shrink-0" aria-hidden />
          )}
        </div>

        {/* Title and identity (Active · crop · acreage) in one row – darker green text */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end p-4 pb-20 sm:p-6 sm:pb-6 z-[1]">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-emerald-950 drop-shadow-md tracking-tight">
              {project.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-emerald-950/95 text-sm sm:text-base">
              <span className={statusBadgeClass}>{project.status}</span>
              <span className="font-medium capitalize drop-shadow-sm">{cropLabel}</span>
              {location && location !== '—' && (
                <span className="opacity-90 drop-shadow-sm">· {location}</span>
              )}
              {fieldSize && fieldSize !== '—' && (
                <span className="opacity-90 drop-shadow-sm">· {fieldSize}</span>
              )}
            </div>
          </div>
          <div className="mt-1 h-0.5 w-16 sm:w-20 bg-emerald-950/90 rounded-full" aria-hidden />
        </div>
      </div>

      {/* Below hero: planting, harvest, stage, day, countdown, actions – overlaps gradient for seamless blend */}
      <div className="relative bg-background px-4 pb-4 pt-2 sm:p-6 sm:pt-4 sm:space-y-4 space-y-3 -mt-16 sm:-mt-6">
        {/* Mobile: row 1 = Planting + Harvest, row 2 = Stage + Season, then separation line. Desktop: single flex row */}
        <div className="sm:hidden grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-muted-foreground shrink-0">Planting</span>
            <span className="text-muted-foreground"> - </span>
            <span className="font-medium text-foreground tabular-nums truncate">{plantingDateStr}</span>
          </div>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-muted-foreground shrink-0">Harvest</span>
            <span className="text-muted-foreground"> - </span>
            <span className="font-medium text-foreground tabular-nums truncate">{expectedHarvest ?? '—'}</span>
          </div>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-muted-foreground shrink-0">Stage</span>
            <span className="text-muted-foreground"> - </span>
            <span className="font-medium text-foreground truncate">{currentStage}</span>
          </div>
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="text-muted-foreground shrink-0">Season</span>
            <span className="text-muted-foreground"> - </span>
            <span className="font-medium text-foreground truncate">{dayOfSeason}</span>
          </div>
        </div>
        <div className="hidden sm:flex flex-wrap items-center gap-x-4 gap-y-2 sm:gap-x-6 text-sm text-muted-foreground">
          <div>
            <span className="text-muted-foreground">Planting</span>
            <span className="ml-2 font-medium text-foreground">{plantingDateStr}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Harvest</span>
            <span className="ml-2 font-medium text-foreground">{expectedHarvest ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Stage</span>
            <span className="ml-2 font-medium text-foreground">{currentStage}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Season</span>
            <span className="ml-2 font-medium text-foreground">{dayOfSeason}</span>
          </div>
        </div>

        <div className="border-t border-border/60" aria-hidden />

        {nextMilestone && (
          <p className="text-sm text-primary font-medium">{nextMilestone}</p>
        )}

        <div className="flex flex-wrap gap-2 pt-1 border-t border-border/50">
          <Button variant="outline" size="sm" onClick={onEditProject}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit Project
          </Button>
          <Button size="sm" onClick={onPlanSeason}>
            <Calendar className="h-4 w-4 mr-2" />
            Plan Season
          </Button>
        </div>
      </div>
    </div>
  );
}
