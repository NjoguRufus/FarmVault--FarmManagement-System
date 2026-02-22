import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Flag, Gauge, Sprout } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toDate } from '@/lib/dateUtils';
import type { CropStage } from '@/types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type StageLike = CropStage & {
  name?: string;
  status?: CropStage['status'] | 'active' | 'ongoing' | string;
};

interface StageDetails {
  stage: StageLike;
  stageName: string;
  start: Date;
  end: Date;
}

export interface CropStageProgressCardProps {
  projectName?: string | null;
  stages?: StageLike[];
  activeStageOverride?: StageLike | null;
}

type StageHealthStatus = 'On Track' | 'Finishing Soon' | 'Monitor' | 'Overdue';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const startOfDay = (input: Date) =>
  new Date(input.getFullYear(), input.getMonth(), input.getDate());

const formatStageDate = (date: Date) =>
  date.toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' });

function getStageLabel(stage: StageLike, fallbackIndex: number) {
  return stage.stageName || stage.name || `Stage ${stage.stageIndex ?? fallbackIndex + 1}`;
}

function resolveCurrentStage(
  stages: StageLike[],
  activeStageOverride?: StageLike | null
): StageDetails | null {
  if (!stages.length && !activeStageOverride) {
    return null;
  }

  const today = startOfDay(new Date());
  const normalized = stages.map((stage, index) => {
    const start = toDate(stage.startDate);
    const end = toDate(stage.endDate);
    return {
      stage,
      stageName: getStageLabel(stage, index),
      start: start ? startOfDay(start) : null,
      end: end ? startOfDay(end) : null,
      stageOrder: stage.stageIndex ?? index,
      index,
    };
  });

  const override = activeStageOverride
    ? {
        stage: activeStageOverride,
        stageName: getStageLabel(activeStageOverride, 0),
        start: toDate(activeStageOverride.startDate),
        end: toDate(activeStageOverride.endDate),
      }
    : null;
  const overrideNormalized = override
    ? {
        stage: override.stage,
        stageName: override.stageName,
        start: override.start ? startOfDay(override.start) : null,
        end: override.end ? startOfDay(override.end) : null,
        stageOrder: override.stage.stageIndex ?? 0,
        index: 0,
      }
    : null;

  const activeByStatus = normalized.find(({ stage }) => {
    const status = String(stage.status || '').toLowerCase();
    return status === 'active';
  });

  const activeByDateRange = normalized.find(({ start, end }) => {
    if (!start || !end) return false;
    return start.getTime() <= today.getTime() && today.getTime() <= end.getTime();
  });

  const latestByStartDate = normalized.reduce<(typeof normalized)[number] | null>((latest, current) => {
    if (!current.start) return latest;
    if (!latest || !latest.start) return current;
    return current.start.getTime() > latest.start.getTime() ? current : latest;
  }, null);

  const sortedByOrder = [...normalized].sort((a, b) => a.stageOrder - b.stageOrder);
  const latestByOrder = sortedByOrder.length ? sortedByOrder[sortedByOrder.length - 1] : null;
  const chosen =
    overrideNormalized ??
    activeByStatus ??
    activeByDateRange ??
    latestByStartDate ??
    latestByOrder;

  if (!chosen) return null;

  const start = chosen.start ?? today;
  const endCandidate = chosen.end ?? chosen.start ?? today;
  const end = endCandidate.getTime() < start.getTime() ? start : endCandidate;

  return {
    stage: chosen.stage,
    stageName: chosen.stageName,
    start,
    end,
  };
}

const cardClasses =
  'relative overflow-hidden rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-3 sm:p-4 transition-all after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-gradient-to-r after:from-primary/60 after:via-primary/20 after:to-transparent';

export function CropStageProgressCard({
  projectName,
  stages = [],
  activeStageOverride = null,
}: CropStageProgressCardProps) {
  const stageDetails = useMemo(
    () => resolveCurrentStage(stages, activeStageOverride),
    [stages, activeStageOverride]
  );
  const totalDays = useMemo(() => {
    if (!stageDetails) return 1;
    const duration = Math.ceil((stageDetails.end.getTime() - stageDetails.start.getTime()) / MS_PER_DAY);
    return Math.max(1, Number.isFinite(duration) ? duration : 1);
  }, [stageDetails]);
  const dayNumber = useMemo(() => {
    if (!stageDetails) return 0;
    const today = startOfDay(new Date());
    const day = Math.ceil((today.getTime() - stageDetails.start.getTime()) / MS_PER_DAY) + 1;
    return clamp(Number.isFinite(day) ? day : 0, 1, totalDays);
  }, [stageDetails, totalDays]);
  const daysPassed = useMemo(() => {
    if (!stageDetails) return 0;
    const today = startOfDay(new Date());
    const passed = Math.ceil((today.getTime() - stageDetails.start.getTime()) / MS_PER_DAY) + 1;
    return clamp(Number.isFinite(passed) ? passed : 0, 0, totalDays);
  }, [stageDetails, totalDays]);
  const progressPct = useMemo(() => {
    if (!stageDetails) return 0;
    const normalizedStatus = String(stageDetails.stage.status || '').toLowerCase();
    if (normalizedStatus === 'completed') return 100;
    if (normalizedStatus === 'pending') return 0;
    const pct = Math.round((dayNumber / totalDays) * 100);
    return clamp(Number.isFinite(pct) ? pct : 0, 0, 100);
  }, [stageDetails, dayNumber, totalDays]);
  const daysLeft = useMemo(() => {
    if (!stageDetails) return 0;
    return clamp(totalDays - dayNumber, 0, totalDays);
  }, [stageDetails, totalDays, dayNumber]);
  const expectedProgress = useMemo(() => {
    if (!stageDetails) return 0;
    const expected = Math.round((daysPassed / totalDays) * 100);
    return clamp(Number.isFinite(expected) ? expected : 0, 0, 100);
  }, [stageDetails, daysPassed, totalDays]);
  const status = useMemo<StageHealthStatus>(() => {
    if (!stageDetails) return 'On Track';
    const today = startOfDay(new Date());
    if (today.getTime() > stageDetails.end.getTime()) return 'Overdue';
    if (daysLeft <= 7) return 'Finishing Soon';
    if (progressPct < expectedProgress - 10) return 'Monitor';
    return 'On Track';
  }, [stageDetails, daysLeft, progressPct, expectedProgress]);
  const progressAdvisory = useMemo(() => {
    if (progressPct < 30) return 'Early stage development underway.';
    if (progressPct < 70) return 'Mid-stage growth phase in progress.';
    if (progressPct < 90) return 'Approaching stage transition.';
    return 'Prepare for next stage operations.';
  }, [progressPct]);
  const finishAdvisory = useMemo(() => {
    if (daysLeft > 7) return '';
    if (daysLeft > 0) return 'Prepare transition activities.';
    return 'Stage completion required.';
  }, [daysLeft]);
  const badgeClassName = useMemo(() => {
    const tone: Record<StageHealthStatus, string> = {
      'On Track': 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
      'Finishing Soon': 'border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300',
      Monitor: 'border-yellow-500/40 bg-yellow-500/5 text-yellow-700 dark:text-yellow-300',
      Overdue: 'border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-300',
    };
    return tone[status];
  }, [status]);

  const [animatedProgress, setAnimatedProgress] = useState(0);
  const animatedStageKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!stageDetails) {
      setAnimatedProgress(0);
      animatedStageKeyRef.current = null;
      return;
    }

    const stageKey = `${stageDetails.stage.id}-${stageDetails.start.getTime()}-${stageDetails.end.getTime()}`;
    if (animatedStageKeyRef.current !== stageKey) {
      animatedStageKeyRef.current = stageKey;
      setAnimatedProgress(0);
      const rafId = requestAnimationFrame(() => {
        setAnimatedProgress(progressPct);
      });
      return () => cancelAnimationFrame(rafId);
    }

    setAnimatedProgress(progressPct);
    return undefined;
  }, [stageDetails, progressPct]);

  const hasProject = Boolean(projectName && projectName.trim().length > 0);

  if (!hasProject) {
    return (
      <div className={cardClasses}>
        <div className="flex items-center gap-2">
          <Sprout className="h-4 w-4 text-primary" />
          <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Crop Stage Progress
          </span>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Select a project to see stage progress</p>
      </div>
    );
  }

  if (!stageDetails) {
    return (
      <div className={cardClasses}>
        <div className="flex items-center gap-2">
          <Sprout className="h-4 w-4 text-primary" />
          <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Crop Stage Progress
          </span>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">No crop stage set for this project yet</p>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto w-fit p-0 text-xs"
        >
          Set stages
        </Button>
      </div>
    );
  }

  return (
    <div className={cardClasses}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Sprout className="h-4 w-4 text-primary" />
          <span className="truncate text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Crop Stage Progress
          </span>
        </div>
        <Badge
          variant="outline"
          className={`shrink-0 ${badgeClassName}`}
        >
          {status}
        </Badge>
      </div>

      <p className="truncate text-[11px] sm:text-xs text-muted-foreground">
        {projectName} • {stageDetails.stageName}
      </p>

      <div className="mt-1 flex items-end gap-2">
        <span className="font-heading text-lg sm:text-xl font-bold tracking-tight">
          {progressPct}%
        </span>
      </div>

      <div className="mt-1 flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
        <Gauge className="h-3 w-3" />
        <span>Stage completion</span>
      </div>

      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-muted/60">
        <div
          className="relative h-full rounded-full bg-gradient-to-r from-fv-green-dark via-fv-green-medium to-fv-green-light transition-all duration-700 ease-out"
          style={{ width: `${animatedProgress}%` }}
        >
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_0%,rgba(255,255,255,0.08)_35%,rgba(255,255,255,0.28)_50%,rgba(255,255,255,0.08)_65%,transparent_100%)] bg-[length:220%_100%] animate-crop-stage-shimmer" />
        </div>
      </div>
      <p className="mt-2 text-[10px] sm:text-xs text-muted-foreground">{progressAdvisory}</p>

      <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] sm:text-xs">
        <div className="rounded-lg border border-border/25 bg-background/30 p-2">
          <div className="flex items-center gap-1 text-muted-foreground">
            <CalendarDays className="h-3 w-3" />
            <span>Day {dayNumber} of {totalDays}</span>
          </div>
          <p className="mt-1 truncate text-foreground/90">
            Since {formatStageDate(stageDetails.start)}
          </p>
        </div>

        <div className="rounded-lg border border-border/25 bg-background/30 p-2">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Flag className="h-3 w-3" />
            <span>Est. finish {formatStageDate(stageDetails.end)}</span>
          </div>
          <p className="mt-1 truncate text-foreground/90">
            {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
          </p>
          {finishAdvisory && (
            <p className="mt-1 text-[10px] text-muted-foreground">{finishAdvisory}</p>
          )}
        </div>
      </div>
    </div>
  );
}
