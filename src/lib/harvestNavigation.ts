import type { Project } from '@/types';
import { hasHarvestCollectionsModule, hasTomatoHarvestModule } from '@/lib/cropModules';

export const HARVEST_ENTRY_PATH = '/harvest';
export const HARVEST_SALES_PATH = '/harvest-sales';
export const HARVEST_COLLECTIONS_BASE_PATH = '/harvest-collections';
export const TOMATO_HARVEST_BASE_PATH = '/tomato-harvest';

function normalizeCropType(cropType: unknown): string {
  return String(cropType ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

export function isFrenchBeansCrop(cropType: unknown): boolean {
  const normalized = normalizeCropType(cropType);
  // Keep backward compatible aliases
  return normalized === 'french-beans' || normalized === 'frenchbeans' || normalized === 'french beans';
}

export function resolveHarvestEntryPath(activeProject: Project | null | undefined): string {
  const cropType = normalizeCropType(activeProject?.cropType);
  const projectId = activeProject?.id;

  if (cropType && hasTomatoHarvestModule(cropType)) {
    return projectId ? `${TOMATO_HARVEST_BASE_PATH}/${projectId}` : TOMATO_HARVEST_BASE_PATH;
  }

  const canUseCollections = cropType ? hasHarvestCollectionsModule(cropType) : false;
  if (!canUseCollections) return HARVEST_SALES_PATH;

  return projectId ? `${HARVEST_COLLECTIONS_BASE_PATH}/${projectId}` : HARVEST_COLLECTIONS_BASE_PATH;
}

