import { toDate } from '@/lib/dateUtils';
import type { CropStage } from '@/types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const startOfDay = (input: Date) =>
  new Date(input.getFullYear(), input.getMonth(), input.getDate());

export type StageLike = CropStage & {
  name?: string;
  status?: CropStage['status'] | 'active' | 'ongoing' | string;
};

export interface StageDetails {
  stage: StageLike;
  stageName: string;
  start: Date;
  end: Date;
}

export function getStageLabel(stage: StageLike, fallbackIndex: number) {
  return stage.stageName || stage.name || `Stage ${stage.stageIndex ?? fallbackIndex + 1}`;
}

export function resolveCurrentStage(
  stages: StageLike[],
  activeStageOverride?: StageLike | null,
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
    return (
      status === 'active' ||
      status === 'in-progress' ||
      status === 'in_progress' ||
      status === 'ongoing' ||
      status === 'current'
    );
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

/** Season-wide progress from stage date ranges (matches CropStageProgressCard). */
export function computeSeasonProgressPercent(
  stages: StageLike[],
  activeStageOverride?: StageLike | null,
): number {
  const allStages = stages?.length ? stages : activeStageOverride ? [activeStageOverride] : [];
  if (!allStages.length) return 0;
  const dates = allStages
    .flatMap((s) => [toDate(s.startDate), toDate(s.endDate)])
    .filter((d): d is Date => d != null);
  if (!dates.length) return 0;
  const cycleStart = new Date(Math.min(...dates.map((d) => d.getTime())));
  const cycleEnd = new Date(Math.max(...dates.map((d) => d.getTime())));
  const totalCycleDays = Math.ceil((cycleEnd.getTime() - cycleStart.getTime()) / MS_PER_DAY);
  if (totalCycleDays <= 0) return 0;
  const today = startOfDay(new Date());
  const daysIntoCycle = Math.ceil((today.getTime() - cycleStart.getTime()) / MS_PER_DAY);
  const pct = Math.round((daysIntoCycle / totalCycleDays) * 100);
  return clamp(Number.isFinite(pct) ? pct : 0, 0, 100);
}
