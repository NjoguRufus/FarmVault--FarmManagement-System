/**
 * Single source of truth for crop stage computation from project plantingDate.
 * Used by Project Details (Crop Stage Timeline) and Crop Stages page.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface StageRule {
  key: string;
  label: string;
  dayStart: number;
  dayEnd: number;
  color?: string;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDateInput(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const cast = value as { toDate?: () => Date };
    if (typeof cast.toDate === 'function') {
      const parsed = cast.toDate();
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Days since planting (floor). Today = planting day => 0.
 * Future planting => negative. Invalid/missing date => 0.
 */
export function calculateDaysSince(date: Date | unknown): number {
  const parsed = parseDateInput(date);
  if (!parsed) return 0;
  const today = startOfDay(new Date());
  const planted = startOfDay(parsed);
  const diff = Math.floor((today.getTime() - planted.getTime()) / MS_PER_DAY);
  return diff;
}

export interface StageForDayResult {
  stage: StageRule;
  index: number;
}

/**
 * Returns the stage whose [dayStart, dayEnd] contains day, or last stage if day is beyond.
 * Day < 0 => first stage (upcoming). No stages => null.
 */
export function getStageForDay(
  stages: StageRule[],
  day: number,
): StageForDayResult | null {
  if (!stages.length) return null;
  if (day < 0) return { stage: stages[0], index: 0 };
  const lastIndex = stages.length - 1;
  const withinIndex = stages.findIndex(
    (s) => day >= s.dayStart && day <= s.dayEnd,
  );
  if (withinIndex >= 0) return { stage: stages[withinIndex], index: withinIndex };
  if (day > stages[lastIndex].dayEnd) return { stage: stages[lastIndex], index: lastIndex };
  return { stage: stages[0], index: 0 };
}

/**
 * Progress within current stage: 0..1.
 * (daysSincePlanting - startDay) / (endDay - startDay + 1)
 */
export function getProgressWithinStage(
  stage: StageRule,
  day: number,
): number {
  const span = stage.dayEnd - stage.dayStart + 1;
  if (span <= 0) return 0;
  if (day < stage.dayStart) return 0;
  if (day > stage.dayEnd) return 1;
  const into = day - stage.dayStart + 1;
  return Math.min(1, Math.max(0, into / span));
}

export type TimelineItemStatus = 'completed' | 'current' | 'upcoming';

export interface TimelineItem {
  stage: StageRule;
  index: number;
  status: TimelineItemStatus;
  /** 0..1 progress within this stage */
  progress: number;
  /** Estimated calendar end date for this stage (plantingDate + dayEnd) */
  estimatedEndDay: number;
}

export type BuildTimelineOptions = {
  /** When set, that stage is "current", all prior are completed, all later upcoming (fixes wrong calendar stage). */
  currentStageIndexOverride?: number | null;
};

/**
 * Build timeline items with status and progress from stages and daysSincePlanting.
 * completed: day > endDay; current: startDay <= day <= endDay; upcoming: day < startDay.
 * With currentStageIndexOverride, statuses follow the override instead of day ranges.
 */
export function buildTimeline(
  stages: StageRule[],
  day: number,
  options?: BuildTimelineOptions | null,
): TimelineItem[] {
  const override =
    options?.currentStageIndexOverride != null &&
    options.currentStageIndexOverride >= 0 &&
    options.currentStageIndexOverride < stages.length
      ? options.currentStageIndexOverride
      : null;

  return stages.map((stage, index) => {
    let status: TimelineItemStatus;
    let progress: number;

    if (override != null) {
      if (index < override) {
        status = 'completed';
        progress = 1;
      } else if (index === override) {
        status = 'current';
        progress = getProgressWithinStage(stage, day);
      } else {
        status = 'upcoming';
        progress = 0;
      }
    } else {
      if (day > stage.dayEnd) status = 'completed';
      else if (day >= stage.dayStart && day <= stage.dayEnd) status = 'current';
      else status = 'upcoming';
      progress = getProgressWithinStage(stage, day);
    }

    return {
      stage,
      index,
      status,
      progress,
      estimatedEndDay: stage.dayEnd,
    };
  });
}

/**
 * Estimated end date for a stage (plantingDate + endDay).
 */
export function getStageEndDate(plantingDate: Date, endDay: number): Date {
  const d = new Date(plantingDate);
  d.setDate(d.getDate() + endDay);
  return d;
}

/**
 * Dev-only: assert plantingDate-driven stage logic.
 * Call once in dev to validate: day 0 => first stage; day 30 for tomatoes => correct stage.
 */
export function assertCropStagesDev(): void {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'development') return;
  const stagesTomato: StageRule[] = [
    { key: 'nursery', label: 'Nursery/Seedling', dayStart: 0, dayEnd: 21 },
    { key: 'vegetative', label: 'Vegetative', dayStart: 22, dayEnd: 45 },
    { key: 'harvest', label: 'Harvest', dayStart: 81, dayEnd: 110 },
  ];
  const r0 = getStageForDay(stagesTomato, 0);
  const r30 = getStageForDay(stagesTomato, 30);
  const r100 = getStageForDay(stagesTomato, 100);
  console.assert(r0?.index === 0 && r0.stage.key === 'nursery', 'day 0 should be first stage');
  console.assert(r30?.index === 1 && r30.stage.key === 'vegetative', 'day 30 should be vegetative');
  console.assert(r100?.index === 2 && r100.stage.key === 'harvest', 'day 100 should be harvest');
  const prog = getProgressWithinStage(stagesTomato[1], 30);
  console.assert(prog > 0 && prog <= 1, 'progress within stage should be 0..1');
}
