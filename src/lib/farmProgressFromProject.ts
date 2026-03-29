import { toDate } from '@/lib/dateUtils';
import { getCropTimeline } from '@/config/cropTimelines';
import { calculateDaysSince } from '@/utils/cropStages';
import { getLegacyStartingStageIndex, getStageLabelForKey } from '@/lib/stageDetection';
import { detectStageForCrop } from '@/knowledge/stageDetection';
import { findCropKnowledgeByTypeKey, getEffectiveEnvironmentForCrop, type CropKnowledge } from '@/knowledge/cropCatalog';
import type { CropStage, EnvironmentType, Project } from '@/types';
import {
  computeSeasonProgressPercent,
  resolveCurrentStage,
  type StageLike,
} from '@/lib/cropStageResolve';

/** Aligns with project lifecycle for dashboard filtering (ongoing vs closed farms). */
export type FarmProgressLifecycle = 'ongoing' | 'completed';

export type FarmProgressRow = {
  projectId: string;
  projectName: string;
  stageLabel: string;
  progressPercent: number;
  farmLifecycle: FarmProgressLifecycle;
};

export function projectFarmLifecycle(project: Project): FarmProgressLifecycle {
  const s = String(project.status ?? 'active').toLowerCase().trim();
  if (s === 'completed' || s === 'archived' || s === 'closed') return 'completed';
  return 'ongoing';
}

export type CropStageCardPropsSlice = {
  projectName: string;
  stages: CropStage[];
  activeStageOverride: CropStage | null;
  knowledgeDetection: {
    cropType?: string | null;
    stageLabel: string;
    progressPercent: number;
    totalCycleDays?: number;
    daysSincePlanting?: number;
    stageDurationDays: number;
    daysIntoStage: number;
    daysRemainingToNextStage: number;
    estimatedNextStageDate?: Date | null;
    estimatedHarvestStartDate?: Date | null;
  } | null;
};

export function computedTimelineStagesForProject(project: Project): CropStage[] {
  if (!project.plantingDate) return [];
  const timeline = getCropTimeline(project.cropTypeKey ?? project.cropType);
  if (!timeline?.stages?.length) return [];

  const plantingDate = toDate(project.plantingDate);
  if (!plantingDate) return [];

  const daysSincePlanting = calculateDaysSince(plantingDate);

  return timeline.stages.map((stage, index) => {
    const stageStartDate = new Date(plantingDate);
    stageStartDate.setDate(stageStartDate.getDate() + stage.dayStart);

    const stageEndDate = new Date(plantingDate);
    stageEndDate.setDate(stageEndDate.getDate() + stage.dayEnd);

    let status: CropStage['status'] = 'pending';
    if (daysSincePlanting > stage.dayEnd) {
      status = 'completed';
    } else if (daysSincePlanting >= stage.dayStart && daysSincePlanting <= stage.dayEnd) {
      status = 'in-progress';
    }

    return {
      id: `computed-${project.id}-${stage.key}`,
      name: stage.label,
      stageName: stage.label,
      startDate: stageStartDate,
      endDate: stageEndDate,
      stageIndex: index,
      projectId: project.id,
      companyId: project.companyId,
      cropType: project.cropType,
      status,
    } as CropStage;
  });
}

function effectiveStagesForProject(project: Project, allStages: CropStage[]): CropStage[] {
  const fromDb = allStages.filter(
    (s) => s.companyId === project.companyId && s.projectId === project.id,
  );
  if (fromDb.length > 0) return fromDb;
  return computedTimelineStagesForProject(project);
}

function knowledgeDetectionForProject(
  project: Project,
  catalog: CropKnowledge[],
): CropStageCardPropsSlice['knowledgeDetection'] {
  const activeProjectKnowledge = findCropKnowledgeByTypeKey(
    catalog,
    project.cropTypeKey || project.cropType,
  );
  const activeProjectEnvironment = getEffectiveEnvironmentForCrop(
    activeProjectKnowledge,
    (project.environmentType as EnvironmentType | undefined) ?? 'open_field',
  );
  const detected = detectStageForCrop(
    activeProjectKnowledge,
    project.plantingDate,
    activeProjectEnvironment,
  );
  if (!detected) return null;

  const stageDurationDays = Math.max(
    1,
    detected.stage.baseDayEnd - detected.stage.baseDayStart + 1,
  );
  const daysRemainingToNextStage = Math.max(0, detected.daysRemainingToNextStage);

  const estimatedNextStageDate = (() => {
    const d = detected.daysRemainingToNextStage;
    if (d == null || d < 0) return null;
    const next = new Date();
    next.setDate(next.getDate() + d);
    return next;
  })();

  let estimatedHarvestStartDate: Date | null = null;
  if (activeProjectKnowledge) {
    const plantingDate = toDate(project.plantingDate);
    if (plantingDate) {
      const harvestStage = activeProjectKnowledge.stages.find(
        (stage) =>
          String(stage.key || '').toLowerCase().includes('harvest') ||
          String(stage.label || '').toLowerCase().includes('harvest'),
      );
      if (harvestStage) {
        const environmentAdjustment = detected.environmentDayAdjustment ?? 0;
        const harvestStartOffset = Math.max(0, harvestStage.baseDayStart + environmentAdjustment);
        const harvestStart = new Date(plantingDate);
        harvestStart.setDate(harvestStart.getDate() + harvestStartOffset);
        estimatedHarvestStartDate = harvestStart;
      }
    }
  }

  return {
    cropType: project.cropType,
    stageLabel: detected.stage.label,
    progressPercent: detected.seasonProgressPercent,
    totalCycleDays: activeProjectKnowledge?.baseCycleDays ?? stageDurationDays,
    daysSincePlanting: detected.daysSincePlanting,
    stageDurationDays,
    daysIntoStage: detected.daysIntoStage,
    daysRemainingToNextStage,
    estimatedNextStageDate,
    estimatedHarvestStartDate,
  };
}

function legacyOverrideForProject(project: Project, catalog: CropKnowledge[]): CropStage | null {
  const knowledge = findCropKnowledgeByTypeKey(catalog, project.cropTypeKey || project.cropType);
  const env = getEffectiveEnvironmentForCrop(
    knowledge,
    (project.environmentType as EnvironmentType | undefined) ?? 'open_field',
  );
  const detected = detectStageForCrop(knowledge, project.plantingDate, env);
  if (detected) return null;

  const label =
    getStageLabelForKey(project.cropType, project.currentStage || project.stageSelected) ?? null;
  if (!label) return null;

  return {
    id: `project-stage-override-${project.id}`,
    projectId: project.id,
    companyId: project.companyId,
    cropType: project.cropType,
    stageName: label,
    stageIndex: getLegacyStartingStageIndex(
      project.cropType,
      project.currentStage || project.stageSelected,
      project.startingStageIndex ?? 0,
    ),
    status: 'in-progress',
  };
}

/** Single-project card props when context is one project (e.g. “All Projects” with only one farm project). */
export function buildCropStageCardPropsForProject(
  project: Project,
  allStages: CropStage[],
  catalog: CropKnowledge[],
): CropStageCardPropsSlice {
  const stages = effectiveStagesForProject(project, allStages);
  const kd = knowledgeDetectionForProject(project, catalog);
  if (kd) {
    return {
      projectName: project.name,
      stages,
      activeStageOverride: null,
      knowledgeDetection: kd,
    };
  }

  const activeStageOverride = legacyOverrideForProject(project, catalog);

  return {
    projectName: project.name,
    stages,
    activeStageOverride,
    knowledgeDetection: null,
  };
}

/** Compact row for “Your Farm Progress” (All Projects, 2+ projects). */
export function buildFarmProgressRowForProject(
  project: Project,
  allStages: CropStage[],
  catalog: CropKnowledge[],
): FarmProgressRow {
  const slice = buildCropStageCardPropsForProject(project, allStages, catalog);

  const life = projectFarmLifecycle(project);

  if (slice.knowledgeDetection) {
    return {
      projectId: project.id,
      projectName: project.name,
      stageLabel: slice.knowledgeDetection.stageLabel,
      progressPercent: Math.round(
        Math.min(100, Math.max(0, slice.knowledgeDetection.progressPercent || 0)),
      ),
      farmLifecycle: life,
    };
  }

  const stages = slice.stages as StageLike[];
  const details = resolveCurrentStage(stages, slice.activeStageOverride as StageLike | null);
  const pct = computeSeasonProgressPercent(stages, slice.activeStageOverride as StageLike | null);

  return {
    projectId: project.id,
    projectName: project.name,
    stageLabel: details?.stageName ?? slice.activeStageOverride?.stageName ?? '—',
    progressPercent: pct,
    farmLifecycle: life,
  };
}
