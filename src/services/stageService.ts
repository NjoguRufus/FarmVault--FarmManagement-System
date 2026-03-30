import { CropStage, CropType } from '@/types';
import { safeToDate } from '@/lib/safeTime';
import { listProjectStages } from '@/services/projectsService';

/** Derive display status: respect stored status first, then dates (aligned with CropStagesPage). */
function getDerivedStatus(
  stage: CropStage,
  today: Date,
): 'pending' | 'in-progress' | 'completed' {
  if (stage.status === 'completed') return 'completed';
  const start = safeToDate(stage.startDate) ?? undefined;
  const end = safeToDate(stage.endDate) ?? undefined;
  if (!start || !end) return 'pending';
  if (today < start) return 'pending';
  if (today > end) return 'completed';
  return 'in-progress';
}

/** Returns the current crop stage for the project (first non-completed), aligned with CropStagesPage. */
export function getCurrentStageForProject(
  stages: CropStage[],
): { stageIndex: number; stageName: string } | null {
  if (!stages.length) return null;

  const today = new Date();
  const sorted = [...stages].sort((a, b) => (a.stageIndex ?? 0) - (b.stageIndex ?? 0));

  const firstNonCompleted = sorted.find(
    (s) => getDerivedStatus(s, today) !== 'completed',
  );
  if (firstNonCompleted) {
    return {
      stageIndex: firstNonCompleted.stageIndex ?? 0,
      stageName: firstNonCompleted.stageName ?? `Stage ${firstNonCompleted.stageIndex}`,
    };
  }

  const last = sorted[sorted.length - 1];
  return last
    ? { stageIndex: last.stageIndex ?? 0, stageName: last.stageName ?? `Stage ${last.stageIndex}` }
    : null;
}

export async function fetchProjectStages(
  companyId: string,
  projectId: string,
  cropType: CropType,
): Promise<CropStage[]> {
  void companyId;
  return listProjectStages(projectId, { cropType: String(cropType) });
}
