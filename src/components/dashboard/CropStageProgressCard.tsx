import React, { useMemo } from 'react';
import { Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toDate } from '@/lib/dateUtils';
import type { CropStage } from '@/types';
import { CropProgressCard } from './CropProgressCard';

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
  knowledgeDetection?: {
    cropType?: string | null;
    stageLabel: string;
    progressPercent: number;
    totalCycleDays?: number;
    daysSincePlanting?: number;
    stageDurationDays: number;
    daysIntoStage: number;
    daysRemainingToNextStage: number;
    estimatedNextStageDate?: Date | null;
    estimatedHarvestStartDate?: Date | null;
  } | null;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const startOfDay = (input: Date) =>
  new Date(input.getFullYear(), input.getMonth(), input.getDate());

const formatStageDate = (date: Date) =>
  date.toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' });

const resolveCropNameForImage = (cropType?: string | null) =>
  String(cropType || '').trim() || 'tomatoes';

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
  knowledgeDetection = null,
}: CropStageProgressCardProps) {
  if (knowledgeDetection) {
    const dayOf = Math.max(
      1,
      Math.round(knowledgeDetection.totalCycleDays || knowledgeDetection.stageDurationDays || 1),
    );
    const daysCompleted = clamp(Math.round(knowledgeDetection.daysSincePlanting || 0), 0, dayOf);
    const daysLeft = Math.max(
      0,
      Math.round(knowledgeDetection.daysRemainingToNextStage || 0),
    );
    const progressPct = clamp(Math.round(knowledgeDetection.progressPercent || 0), 0, 100);
    const estimatedHarvestStart = knowledgeDetection.estimatedHarvestStartDate
      ? formatStageDate(knowledgeDetection.estimatedHarvestStartDate)
      : '—';

    return (
      <CropProgressCard
        crop={resolveCropNameForImage(knowledgeDetection.cropType)}
        farmName={projectName}
        stage={knowledgeDetection.stageLabel}
        progress={progressPct}
        dayOf={dayOf}
        daysCompleted={daysCompleted}
        estimatedFinish={estimatedHarvestStart}
        daysLeft={daysLeft}
        primaryMetricLabel={`Day ${daysCompleted} of ${dayOf}`}
        primaryMetricDetail={`${daysCompleted} ${daysCompleted === 1 ? 'day' : 'days'} since planting`}
        secondaryMetricLabel={`Est. harvest start ${estimatedHarvestStart}`}
        secondaryMetricDetail={`${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} to next stage`}
        className={cardClasses}
      />
    );
  }

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
  const progressPct = useMemo(() => {
    if (!stageDetails) return 0;
    const normalizedStatus = String(stageDetails.stage.status || '').toLowerCase();
    if (normalizedStatus === 'completed') return 100;
    if (normalizedStatus === 'pending') return 0;
    const pct = Math.round((dayNumber / totalDays) * 100);
    return clamp(Number.isFinite(pct) ? pct : 0, 0, 100);
  }, [stageDetails, dayNumber, totalDays]);

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

  const normalizedStatus = String(stageDetails.stage.status || '').toLowerCase();
  const daysCompleted = normalizedStatus === 'completed' ? totalDays : normalizedStatus === 'pending' ? 0 : dayNumber;
  const daysLeft = clamp(totalDays - daysCompleted, 0, totalDays);

  return (
    <CropProgressCard
      crop={resolveCropNameForImage(stageDetails.stage.cropType)}
      farmName={projectName}
      stage={stageDetails.stageName}
      progress={progressPct}
      dayOf={totalDays}
      daysCompleted={daysCompleted}
      estimatedFinish={formatStageDate(stageDetails.end)}
      daysLeft={daysLeft}
      className={cardClasses}
    />
  );
}
