import type { Project } from '@/types';
import { hasHarvestCollectionsModule } from '@/lib/cropModules';

export const HARVEST_ENTRY_PATH = '/harvest';
export const HARVEST_SALES_PATH = '/harvest-sales';
export const HARVEST_COLLECTIONS_BASE_PATH = '/harvest-collections';

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
  const canUseCollections = cropType ? hasHarvestCollectionsModule(cropType) : false;
  if (!canUseCollections) return HARVEST_SALES_PATH;

  const projectId = activeProject?.id;
  return projectId ? `${HARVEST_COLLECTIONS_BASE_PATH}/${projectId}` : HARVEST_COLLECTIONS_BASE_PATH;
}

