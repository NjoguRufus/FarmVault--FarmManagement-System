import type { CropType } from '@/types';

export type EnvironmentType = 'open_field' | 'greenhouse';

export interface CropStage {
  key: string;
  label: string;
  baseDayStart: number;
  baseDayEnd: number;
}

export interface CropKnowledge {
  id: string;
  cropTypeKey: string;
  displayName: string;
  category: 'horticulture' | 'field_crop';
  baseCycleDays: number;
  supportsEnvironment: boolean;
  environmentModifiers: {
    open_field: { dayAdjustment: number };
    greenhouse?: { dayAdjustment: number };
  };
  stages: CropStage[];
}

export interface CropCatalogDoc extends CropKnowledge {
  companyId: string;
}

const CROP_TYPE_ALIASES: Record<string, string> = {
  'french-beans': 'french_beans',
  frenchbeans: 'french_beans',
  watermelons: 'watermelon',
};

const PROJECT_CROP_KEYS_BY_CANONICAL: Record<string, string> = {
  tomatoes: 'tomatoes',
  french_beans: 'french-beans',
  capsicum: 'capsicum',
  maize: 'maize',
  rice: 'rice',
  watermelon: 'watermelons',
};

export function normalizeCropTypeKey(cropTypeKey: string | null | undefined): string {
  const raw = String(cropTypeKey || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
  if (!raw) return '';
  return CROP_TYPE_ALIASES[raw] ?? raw;
}

export function toProjectCropTypeKey(cropTypeKey: string): CropType {
  const canonical = normalizeCropTypeKey(cropTypeKey);
  const mapped = PROJECT_CROP_KEYS_BY_CANONICAL[canonical];
  return (mapped || cropTypeKey) as CropType;
}

export function cropSupportsEnvironment(crop: CropKnowledge | null | undefined): boolean {
  return Boolean(crop?.supportsEnvironment);
}

export function getEnvironmentOptionsForCrop(crop: CropKnowledge | null | undefined): EnvironmentType[] {
  if (!crop?.supportsEnvironment) return ['open_field'];
  return crop.environmentModifiers.greenhouse ? ['open_field', 'greenhouse'] : ['open_field'];
}

export function getEffectiveEnvironmentForCrop(
  crop: CropKnowledge | null | undefined,
  requested: EnvironmentType | null | undefined,
): EnvironmentType {
  if (!crop?.supportsEnvironment) return 'open_field';
  if (requested === 'greenhouse' && crop.environmentModifiers.greenhouse) return 'greenhouse';
  return 'open_field';
}

export const BUILTIN_CROP_CATALOG: CropKnowledge[] = [
  {
    id: 'builtin-tomatoes',
    cropTypeKey: 'tomatoes',
    displayName: 'Tomatoes',
    category: 'horticulture',
    baseCycleDays: 110,
    supportsEnvironment: true,
    environmentModifiers: {
      open_field: { dayAdjustment: 0 },
      greenhouse: { dayAdjustment: -10 },
    },
    stages: [
      { key: 'nursery', label: 'Nursery/Seedling', baseDayStart: 0, baseDayEnd: 20 },
      { key: 'transplant', label: 'Transplant Establishment', baseDayStart: 21, baseDayEnd: 30 },
      { key: 'vegetative', label: 'Vegetative', baseDayStart: 31, baseDayEnd: 50 },
      { key: 'flowering', label: 'Flowering', baseDayStart: 51, baseDayEnd: 65 },
      { key: 'fruiting', label: 'Fruiting', baseDayStart: 66, baseDayEnd: 90 },
      { key: 'harvest', label: 'Harvest', baseDayStart: 91, baseDayEnd: 120 },
    ],
  },
  {
    id: 'builtin-french-beans',
    cropTypeKey: 'french_beans',
    displayName: 'French Beans',
    category: 'horticulture',
    baseCycleDays: 60,
    supportsEnvironment: true,
    environmentModifiers: {
      open_field: { dayAdjustment: 0 },
      greenhouse: { dayAdjustment: -5 },
    },
    stages: [
      { key: 'germination', label: 'Germination', baseDayStart: 0, baseDayEnd: 7 },
      { key: 'vegetative', label: 'Vegetative', baseDayStart: 8, baseDayEnd: 18 },
      { key: 'flowering', label: 'Flowering', baseDayStart: 19, baseDayEnd: 28 },
      { key: 'pod_fill', label: 'Pod Formation', baseDayStart: 29, baseDayEnd: 40 },
      { key: 'harvest', label: 'Harvest', baseDayStart: 41, baseDayEnd: 65 },
    ],
  },
  {
    id: 'builtin-capsicum',
    cropTypeKey: 'capsicum',
    displayName: 'Capsicum',
    category: 'horticulture',
    baseCycleDays: 150,
    supportsEnvironment: true,
    environmentModifiers: {
      open_field: { dayAdjustment: 0 },
      greenhouse: { dayAdjustment: -10 },
    },
    stages: [
      { key: 'nursery', label: 'Nursery/Seedling', baseDayStart: 0, baseDayEnd: 28 },
      { key: 'vegetative', label: 'Vegetative', baseDayStart: 29, baseDayEnd: 55 },
      { key: 'flowering', label: 'Flowering', baseDayStart: 56, baseDayEnd: 75 },
      { key: 'fruiting', label: 'Fruiting', baseDayStart: 76, baseDayEnd: 110 },
      { key: 'harvest', label: 'Harvest', baseDayStart: 111, baseDayEnd: 170 },
    ],
  },
  {
    id: 'builtin-watermelon',
    cropTypeKey: 'watermelon',
    displayName: 'Watermelon',
    category: 'horticulture',
    baseCycleDays: 95,
    supportsEnvironment: true,
    environmentModifiers: {
      open_field: { dayAdjustment: 0 },
      greenhouse: { dayAdjustment: -7 },
    },
    stages: [
      { key: 'germination', label: 'Germination', baseDayStart: 0, baseDayEnd: 9 },
      { key: 'vine_growth', label: 'Vine Growth', baseDayStart: 10, baseDayEnd: 28 },
      { key: 'flowering', label: 'Flowering', baseDayStart: 29, baseDayEnd: 42 },
      { key: 'fruit_set', label: 'Fruit Set', baseDayStart: 43, baseDayEnd: 60 },
      { key: 'maturity_harvest', label: 'Maturity/Harvest', baseDayStart: 61, baseDayEnd: 100 },
    ],
  },
  {
    id: 'builtin-maize',
    cropTypeKey: 'maize',
    displayName: 'Maize',
    category: 'field_crop',
    baseCycleDays: 130,
    supportsEnvironment: false,
    environmentModifiers: {
      open_field: { dayAdjustment: 0 },
    },
    stages: [
      { key: 'emergence', label: 'Emergence', baseDayStart: 0, baseDayEnd: 10 },
      { key: 'vegetative', label: 'Vegetative', baseDayStart: 11, baseDayEnd: 45 },
      { key: 'tasseling', label: 'Tasseling/Silking', baseDayStart: 46, baseDayEnd: 70 },
      { key: 'grain_fill', label: 'Grain Filling', baseDayStart: 71, baseDayEnd: 105 },
      { key: 'harvest', label: 'Harvest', baseDayStart: 106, baseDayEnd: 145 },
    ],
  },
  {
    id: 'builtin-rice',
    cropTypeKey: 'rice',
    displayName: 'Rice',
    category: 'field_crop',
    baseCycleDays: 130,
    supportsEnvironment: false,
    environmentModifiers: {
      open_field: { dayAdjustment: 0 },
    },
    stages: [
      { key: 'nursery', label: 'Nursery/Seedling', baseDayStart: 0, baseDayEnd: 25 },
      { key: 'tillering', label: 'Tillering', baseDayStart: 26, baseDayEnd: 55 },
      { key: 'panicle', label: 'Panicle Initiation', baseDayStart: 56, baseDayEnd: 80 },
      { key: 'flowering', label: 'Flowering', baseDayStart: 81, baseDayEnd: 95 },
      { key: 'maturity', label: 'Maturity/Harvest', baseDayStart: 96, baseDayEnd: 145 },
    ],
  },
];

export function findCropKnowledgeByTypeKey(
  catalog: CropKnowledge[],
  cropTypeKey: string | null | undefined,
): CropKnowledge | null {
  const normalized = normalizeCropTypeKey(cropTypeKey);
  if (!normalized) return null;
  return catalog.find((crop) => normalizeCropTypeKey(crop.cropTypeKey) === normalized) ?? null;
}
