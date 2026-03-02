import { addDays } from 'date-fns';
import { toDate } from '@/lib/dateUtils';
import { getCropTimeline } from '@/config/cropTimelines';
import type { Project } from '@/types';
import type { ProjectBlock } from '@/types';

/**
 * Total days from planting to end of harvest for a crop (from crop timeline config).
 */
export function getCropDaysToHarvest(cropType: string | null | undefined): number | null {
  const timeline = getCropTimeline(cropType);
  return timeline?.totalDaysToHarvest ?? null;
}

/**
 * Expected harvest date for display on project cards/list.
 * - With blocks: soonest of (block.expectedEndDate or block.plantingDate + crop days) across blocks.
 * - Without blocks: project.endDate or project.plantingDate + crop days.
 * Company-scoped: project and blocks are already company-scoped.
 */
export function getExpectedHarvestDate(
  project: Project | null | undefined,
  blocks?: ProjectBlock[] | null
): Date | null {
  if (!project) return null;
  const cropDays = getCropDaysToHarvest(project.cropType);
  const planting = toDate(project.plantingDate);
  const endDate = toDate(project.endDate);

  if (blocks && blocks.length > 0) {
    let soonest: Date | null = null;
    for (const b of blocks) {
      const blockEnd = toDate(b.expectedEndDate);
      const blockPlant = toDate(b.plantingDate);
      const candidate = blockEnd ?? (blockPlant && cropDays != null ? addDays(blockPlant, cropDays) : null);
      if (candidate && (!soonest || candidate.getTime() < soonest.getTime())) {
        soonest = candidate;
      }
    }
    return soonest;
  }

  if (endDate) return endDate;
  if (planting && cropDays != null) return addDays(planting, cropDays);
  return null;
}
