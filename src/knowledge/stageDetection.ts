import {
  type CropKnowledge,
  type CropStage,
  type EnvironmentType,
  getEffectiveEnvironmentForCrop,
} from '@/knowledge/cropCatalog';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface StageDetectionResult {
  stage: CropStage;
  stageIndex: number;
  daysSincePlanting: number;
  effectiveDay: number;
  environmentType: EnvironmentType;
  environmentDayAdjustment: number;
  /** Progress through the current stage (0–100). */
  stageProgressPercent: number;
  /** Progress through the full season/cycle from planting to harvest (0–100). */
  seasonProgressPercent: number;
  daysIntoStage: number;
  daysRemainingToNextStage: number;
  nextStage: CropStage | null;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

export function getDaysSincePlanting(plantingDate: unknown): number {
  const parsed = parseDateInput(plantingDate);
  if (!parsed) return 0;

  const today = startOfDay(new Date());
  const planted = startOfDay(parsed);
  const diff = Math.floor((today.getTime() - planted.getTime()) / MS_PER_DAY);
  return Math.max(0, diff);
}

export function getEnvironmentDayAdjustment(
  crop: CropKnowledge,
  requestedEnvironment: EnvironmentType | null | undefined,
): { environmentType: EnvironmentType; dayAdjustment: number } {
  const environmentType = getEffectiveEnvironmentForCrop(crop, requestedEnvironment);
  const selectedModifier =
    environmentType === 'greenhouse'
      ? crop.environmentModifiers.greenhouse
      : crop.environmentModifiers.open_field;
  return {
    environmentType,
    dayAdjustment: selectedModifier?.dayAdjustment ?? 0,
  };
}

function resolveStageIndex(stages: CropStage[], effectiveDay: number): number {
  if (!stages.length) return -1;

  if (effectiveDay < 0) return 0;

  const withinIndex = stages.findIndex(
    (stage) => effectiveDay >= stage.baseDayStart && effectiveDay <= stage.baseDayEnd,
  );
  if (withinIndex >= 0) return withinIndex;

  const lastIndex = stages.length - 1;
  if (effectiveDay > stages[lastIndex].baseDayEnd) return lastIndex;

  return 0;
}

export function detectStageForCrop(
  crop: CropKnowledge | null | undefined,
  plantingDate: unknown,
  requestedEnvironment: EnvironmentType | null | undefined,
): StageDetectionResult | null {
  if (!crop || !crop.stages.length) return null;

  const daysSincePlanting = getDaysSincePlanting(plantingDate);
  const { environmentType, dayAdjustment } = getEnvironmentDayAdjustment(crop, requestedEnvironment);
  const effectiveDay = daysSincePlanting - dayAdjustment;
  const stageIndex = resolveStageIndex(crop.stages, effectiveDay);

  if (stageIndex < 0) return null;

  const stage = crop.stages[stageIndex];
  const nextStage = crop.stages[stageIndex + 1] ?? null;
  const duration = Math.max(1, stage.baseDayEnd - stage.baseDayStart + 1);
  const rawIntoStage = effectiveDay - stage.baseDayStart + 1;
  const daysIntoStage = effectiveDay < stage.baseDayStart ? 0 : clamp(rawIntoStage, 0, duration);
  const stageProgressPercent =
    daysIntoStage <= 0 ? 0 : clamp(Math.round((daysIntoStage / duration) * 100), 0, 100);
  const baseCycleDays = Math.max(1, crop.baseCycleDays ?? (crop.stages[crop.stages.length - 1]?.baseDayEnd ?? 1));
  const seasonProgressPercent = clamp(
    Math.round((daysSincePlanting / baseCycleDays) * 100),
    0,
    100
  );
  const daysRemainingToNextStage = nextStage
    ? Math.max(0, stage.baseDayEnd - effectiveDay)
    : Math.max(0, stage.baseDayEnd - effectiveDay);

  return {
    stage,
    stageIndex,
    daysSincePlanting,
    effectiveDay,
    environmentType,
    environmentDayAdjustment: dayAdjustment,
    stageProgressPercent,
    seasonProgressPercent,
    daysIntoStage,
    daysRemainingToNextStage,
    nextStage,
  };
}

