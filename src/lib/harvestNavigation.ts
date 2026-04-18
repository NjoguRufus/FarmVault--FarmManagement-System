import type { Project } from '@/types';
import { hasFallbackHarvestModule, hasHarvestCollectionsModule, hasTomatoHarvestModule } from '@/lib/cropModules';

/** Prefix for harvest module routes when rendered inside the staff shell (`/staff/...`). */
export type HarvestRouteBasePrefix = '' | '/staff';

export const HARVEST_ENTRY_PATH = '/harvest';
export const HARVEST_SALES_PATH = '/harvest-sales';
export const HARVEST_COLLECTIONS_BASE_PATH = '/harvest-collections';
export const TOMATO_HARVEST_BASE_PATH = '/tomato-harvest';
export const FALLBACK_HARVEST_BASE_PATH = '/harvest-sessions';

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

export function resolveHarvestEntryPath(
  activeProject: Project | null | undefined,
  basePrefix: HarvestRouteBasePrefix = '',
): string {
  const p = basePrefix;
  const cropType = normalizeCropType(activeProject?.cropType);
  const projectId = activeProject?.id;

  if (cropType && hasTomatoHarvestModule(cropType)) {
    return projectId ? `${p}${TOMATO_HARVEST_BASE_PATH}/${projectId}` : `${p}${TOMATO_HARVEST_BASE_PATH}`;
  }

  const canUseCollections = cropType ? hasHarvestCollectionsModule(cropType) : false;
  if (canUseCollections) {
    return projectId
      ? `${p}${HARVEST_COLLECTIONS_BASE_PATH}/${projectId}`
      : `${p}${HARVEST_COLLECTIONS_BASE_PATH}`;
  }

  const canUseFallback = cropType ? hasFallbackHarvestModule(cropType) : true;
  if (canUseFallback) {
    return projectId
      ? `${p}${FALLBACK_HARVEST_BASE_PATH}/${projectId}`
      : `${p}${FALLBACK_HARVEST_BASE_PATH}`;
  }

  // Harvest & Sales lives only on the main app shell today.
  return HARVEST_SALES_PATH;
}

/** Whether the current URL is under staff harvest modules (for correct in-flow navigation). */
export function harvestRouteBaseFromPath(pathname: string): HarvestRouteBasePrefix {
  const n = (pathname || '').replace(/\/+/g, '/');
  if (
    n === '/staff/harvest' ||
    n.startsWith('/staff/harvest-collections') ||
    n.startsWith('/staff/tomato-harvest') ||
    n.startsWith('/staff/harvest-sessions')
  ) {
    return '/staff';
  }
  return '';
}

