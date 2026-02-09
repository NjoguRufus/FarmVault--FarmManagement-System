/**
 * Crop-specific feature modules for FarmVault.
 * Use for feature toggles and navigation (e.g. Harvest Collections for French Beans).
 */

export type CropModuleId = 'harvest-collections' | 'picker-payments' | 'grading' | 'sorting';

/**
 * Returns the list of module IDs enabled for a given crop type.
 * Use for conditional UI (e.g. showing "Harvest Collections" only for French Beans).
 */
export function getCropModules(cropType: string): CropModuleId[] {
  switch (cropType?.toLowerCase()) {
    case 'french-beans':
      return ['harvest-collections', 'picker-payments'];
    case 'tomatoes':
      return ['grading', 'sorting'];
    default:
      return [];
  }
}

/** Type-safe check: does this crop have the Harvest Collections module? */
export function hasHarvestCollectionsModule(cropType: string): boolean {
  return getCropModules(cropType).includes('harvest-collections');
}
