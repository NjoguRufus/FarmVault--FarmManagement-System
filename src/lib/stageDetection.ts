import {
  BUILTIN_CROP_CATALOG,
  findCropKnowledgeByTypeKey,
  getEffectiveEnvironmentForCrop,
  normalizeCropTypeKey,
  type EnvironmentType,
} from '@/knowledge/cropCatalog';
import { detectStageForCrop, getDaysSincePlanting } from '@/knowledge/stageDetection';
import { getCropStages } from '@/lib/cropStageConfig';

export type StageConfidence = 'high' | 'medium' | 'low';

type StageRuleCompat = {
  key: string;
  label: string;
  dayStart: number;
  dayEnd: number;
};

type CropTimelineCompat = {
  cropType: string;
  totalDaysToHarvest: number;
  stages: StageRuleCompat[];
};

export type StageDetectionResult = {
  stageKey: string;
  stageLabel: string;
  daysSincePlanting: number;
  stageRule: StageRuleCompat;
  timeline: CropTimelineCompat;
  rawDaysSincePlanting: number;
  inputWasInvalid: boolean;
  inputWasFuture: boolean;
};

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

function buildTimelineCompat(cropType: string): CropTimelineCompat | null {
  const crop = findCropKnowledgeByTypeKey(BUILTIN_CROP_CATALOG, cropType);
  if (!crop) return null;
  return {
    cropType: crop.cropTypeKey,
    totalDaysToHarvest: crop.baseCycleDays,
    stages: crop.stages.map((stage) => ({
      key: stage.key,
      label: stage.label,
      dayStart: stage.baseDayStart,
      dayEnd: stage.baseDayEnd,
    })),
  };
}

export function getDaysSince(dateInput: unknown): number {
  return getDaysSincePlanting(dateInput);
}

export function detectStage(
  cropType: string | null | undefined,
  plantingDate: unknown,
  requestedEnvironment?: EnvironmentType,
): StageDetectionResult | null {
  const crop = findCropKnowledgeByTypeKey(BUILTIN_CROP_CATALOG, cropType);
  if (!crop) return null;

  const environmentType = getEffectiveEnvironmentForCrop(crop, requestedEnvironment ?? 'open_field');
  const detected = detectStageForCrop(crop, plantingDate, environmentType);
  if (!detected) return null;

  const timeline = buildTimelineCompat(cropType || crop.cropTypeKey);
  if (!timeline) return null;

  const parsedDate = parseDateInput(plantingDate);
  const inputWasInvalid = !parsedDate;
  const rawDaysSincePlanting = inputWasInvalid
    ? -1
    : Math.floor((new Date().getTime() - parsedDate.getTime()) / (24 * 60 * 60 * 1000));

  return {
    stageKey: detected.stage.key,
    stageLabel: detected.stage.label,
    daysSincePlanting: detected.daysSincePlanting,
    stageRule: {
      key: detected.stage.key,
      label: detected.stage.label,
      dayStart: detected.stage.baseDayStart,
      dayEnd: detected.stage.baseDayEnd,
    },
    timeline,
    rawDaysSincePlanting,
    inputWasInvalid,
    inputWasFuture: rawDaysSincePlanting < 0,
  };
}

export function getStageConfidence(days: number, stageRule: StageRuleCompat | null | undefined): StageConfidence {
  if (!stageRule || !Number.isFinite(days) || days < 0) return 'low';

  const boundaryDistance = Math.min(
    Math.abs(days - stageRule.dayStart),
    Math.abs(stageRule.dayEnd - days),
  );

  if (boundaryDistance <= 2) return 'medium';
  return 'high';
}

export function getStageRuleByKey(
  cropType: string | null | undefined,
  stageKey: string | null | undefined,
): StageRuleCompat | null {
  const crop = findCropKnowledgeByTypeKey(BUILTIN_CROP_CATALOG, cropType);
  if (!crop) return null;
  const key = String(stageKey || '').trim();
  if (!key) return null;
  const rule = crop.stages.find((stage) => stage.key === key);
  if (!rule) return null;
  return {
    key: rule.key,
    label: rule.label,
    dayStart: rule.baseDayStart,
    dayEnd: rule.baseDayEnd,
  };
}

export function getStageLabelForKey(
  cropType: string | null | undefined,
  stageKey: string | null | undefined,
): string | null {
  const rule = getStageRuleByKey(cropType, stageKey);
  return rule?.label ?? null;
}

function titleCase(value: string) {
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getStageWhyText(
  cropType: string | null | undefined,
  stageRule: StageRuleCompat,
): string {
  const crop = findCropKnowledgeByTypeKey(BUILTIN_CROP_CATALOG, cropType);
  const cropLabel = crop?.displayName ?? titleCase(String(cropType || 'crop'));
  return `FarmVault auto-detected this stage because ${cropLabel} is typically in '${stageRule.label}' between day ${stageRule.dayStart}-${stageRule.dayEnd} after planting. You can change it if your farm conditions differ.`;
}

const LEGACY_STAGE_INDEX_MAP: Record<string, Record<string, number>> = {
  tomatoes: {
    nursery: 0,
    'nursery-seedling': 0,
    transplant: 1,
    'transplant-shock': 1,
    vegetative: 2,
    flowering: 3,
    fruiting: 4,
    harvest: 5,
  },
  french_beans: {
    germination: 1,
    vegetative: 2,
    flowering: 3,
    pod_fill: 4,
    'pod-formation': 4,
    harvest: 5,
  },
  capsicum: {
    nursery: 0,
    vegetative: 2,
    flowering: 3,
    fruiting: 4,
    harvest: 5,
  },
  maize: {
    emergence: 2,
    vegetative: 3,
    tasseling: 4,
    'tasseling-silking': 4,
    grain_fill: 5,
    'grain-filling': 5,
    harvest: 6,
  },
  rice: {
    nursery: 0,
    'nursery-seedling': 0,
    tillering: 2,
    panicle: 3,
    'panicle-initiation': 3,
    flowering: 4,
    maturity: 5,
    'maturity-harvest': 5,
  },
  watermelon: {
    germination: 1,
    vine_growth: 2,
    'vine-growth': 2,
    flowering: 3,
    fruit_set: 4,
    maturity_harvest: 5,
    harvest: 5,
  },
};

export function getLegacyStartingStageIndex(
  cropType: string | null | undefined,
  stageKey: string | null | undefined,
  fallback = 0,
): number {
  const normalizedCrop = normalizeCropTypeKey(cropType);
  if (!normalizedCrop) return Math.max(0, fallback);

  const legacyStages = getCropStages(cropType as any);
  const maxLegacyIndex = Math.max(legacyStages.length - 1, 0);
  const normalizedStageKey = String(stageKey || '').trim().toLowerCase();
  const mapped = LEGACY_STAGE_INDEX_MAP[normalizedCrop]?.[normalizedStageKey];
  const resolved = typeof mapped === 'number' ? mapped : fallback;
  return Math.min(Math.max(0, resolved), maxLegacyIndex);
}
