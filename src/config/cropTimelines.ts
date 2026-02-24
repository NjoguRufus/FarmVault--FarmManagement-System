import type { CropType } from '@/types';

export type StageRule = {
  key: string;
  label: string;
  dayStart: number;
  dayEnd: number;
  color?: string;
};

export type CropTimeline = {
  cropType: string;
  totalDaysToHarvest: number;
  stages: StageRule[];
};

const TIMELINES_BY_CROP: Record<CropType, CropTimeline> = {
  'french-beans': {
    cropType: 'french-beans',
    totalDaysToHarvest: 50,
    stages: [
      { key: 'germination', label: 'Germination', dayStart: 0, dayEnd: 7, color: '#22c55e' },
      { key: 'vegetative', label: 'Vegetative', dayStart: 8, dayEnd: 21, color: '#16a34a' },
      { key: 'flowering', label: 'Flowering', dayStart: 22, dayEnd: 30, color: '#f59e0b' },
      { key: 'pod-formation', label: 'Pod Formation', dayStart: 31, dayEnd: 40, color: '#84cc16' },
      { key: 'harvest', label: 'Harvest', dayStart: 41, dayEnd: 60, color: '#65a30d' },
    ],
  },
  tomatoes: {
    cropType: 'tomatoes',
    totalDaysToHarvest: 90,
    stages: [
      { key: 'nursery-seedling', label: 'Nursery/Seedling', dayStart: 0, dayEnd: 21, color: '#22c55e' },
      { key: 'transplant-shock', label: 'Transplant Shock', dayStart: 22, dayEnd: 28, color: '#86efac' },
      { key: 'vegetative', label: 'Vegetative', dayStart: 29, dayEnd: 45, color: '#16a34a' },
      { key: 'flowering', label: 'Flowering', dayStart: 46, dayEnd: 60, color: '#f59e0b' },
      { key: 'fruiting', label: 'Fruiting', dayStart: 61, dayEnd: 80, color: '#f97316' },
      { key: 'harvest', label: 'Harvest', dayStart: 81, dayEnd: 110, color: '#65a30d' },
    ],
  },
  maize: {
    cropType: 'maize',
    totalDaysToHarvest: 120,
    stages: [
      { key: 'emergence', label: 'Emergence', dayStart: 0, dayEnd: 10, color: '#4ade80' },
      { key: 'vegetative', label: 'Vegetative', dayStart: 11, dayEnd: 45, color: '#16a34a' },
      { key: 'tasseling-silking', label: 'Tasseling/Silking', dayStart: 46, dayEnd: 70, color: '#eab308' },
      { key: 'grain-filling', label: 'Grain Filling', dayStart: 71, dayEnd: 105, color: '#ca8a04' },
      { key: 'harvest', label: 'Harvest', dayStart: 106, dayEnd: 140, color: '#65a30d' },
    ],
  },
  rice: {
    cropType: 'rice',
    totalDaysToHarvest: 120,
    stages: [
      { key: 'nursery-seedling', label: 'Nursery/Seedling', dayStart: 0, dayEnd: 25, color: '#4ade80' },
      { key: 'tillering', label: 'Tillering', dayStart: 26, dayEnd: 55, color: '#16a34a' },
      { key: 'panicle-initiation', label: 'Panicle Initiation', dayStart: 56, dayEnd: 80, color: '#84cc16' },
      { key: 'flowering', label: 'Flowering', dayStart: 81, dayEnd: 95, color: '#eab308' },
      { key: 'maturity-harvest', label: 'Maturity/Harvest', dayStart: 96, dayEnd: 140, color: '#65a30d' },
    ],
  },
  capsicum: {
    cropType: 'capsicum',
    totalDaysToHarvest: 120,
    stages: [
      { key: 'nursery-seedling', label: 'Nursery/Seedling', dayStart: 0, dayEnd: 28, color: '#4ade80' },
      { key: 'vegetative', label: 'Vegetative', dayStart: 29, dayEnd: 55, color: '#16a34a' },
      { key: 'flowering', label: 'Flowering', dayStart: 56, dayEnd: 75, color: '#f59e0b' },
      { key: 'fruiting', label: 'Fruiting', dayStart: 76, dayEnd: 110, color: '#f97316' },
      { key: 'harvest', label: 'Harvest', dayStart: 111, dayEnd: 150, color: '#65a30d' },
    ],
  },
  watermelons: {
    cropType: 'watermelons',
    totalDaysToHarvest: 85,
    stages: [
      { key: 'germination', label: 'Germination', dayStart: 0, dayEnd: 10, color: '#4ade80' },
      { key: 'vine-growth', label: 'Vine Growth', dayStart: 11, dayEnd: 30, color: '#16a34a' },
      { key: 'flowering', label: 'Flowering', dayStart: 31, dayEnd: 45, color: '#f59e0b' },
      { key: 'fruit-set', label: 'Fruit Set', dayStart: 46, dayEnd: 60, color: '#f97316' },
      { key: 'harvest', label: 'Fruit Maturity/Harvest', dayStart: 61, dayEnd: 95, color: '#65a30d' },
    ],
  },
};

export const cropTimelines: CropTimeline[] = Object.values(TIMELINES_BY_CROP);

const CROP_DISPLAY_NAMES: Record<CropType, string> = {
  tomatoes: 'Tomatoes',
  'french-beans': 'French Beans',
  capsicum: 'Capsicum',
  maize: 'Maize',
  watermelons: 'Watermelon',
  rice: 'Rice',
};

const CROP_TYPE_ALIASES: Record<string, CropType> = {
  watermelon: 'watermelons',
};

function toTitleCase(value: string) {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normalizeCropTimelineType(cropType: string | null | undefined): CropType | null {
  const raw = String(cropType || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw in TIMELINES_BY_CROP) return raw as CropType;
  return CROP_TYPE_ALIASES[raw] ?? null;
}

export function getCropTimeline(cropType: string | null | undefined): CropTimeline | null {
  const normalized = normalizeCropTimelineType(cropType);
  if (!normalized) return null;
  return TIMELINES_BY_CROP[normalized];
}

export function getCropDisplayName(cropType: string | null | undefined): string {
  const normalized = normalizeCropTimelineType(cropType);
  if (normalized) return CROP_DISPLAY_NAMES[normalized];
  const raw = String(cropType || '').trim();
  return raw ? toTitleCase(raw) : 'Crop';
}
