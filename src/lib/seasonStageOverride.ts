import type { StageForDayResult, StageRule } from '@/utils/cropStages';
import { getStageForDay } from '@/utils/cropStages';

export function resolveManualStageIndex(
  templateStages: Pick<StageRule, 'key'>[],
  manualStageKey: string | null | undefined,
): number | null {
  if (!manualStageKey?.trim() || !templateStages.length) return null;
  const i = templateStages.findIndex((s) => s.key === manualStageKey.trim());
  return i >= 0 ? i : null;
}

/**
 * Current stage for display: manual override wins; otherwise calendar from days since planting.
 */
export function effectiveCurrentStage(
  templateStages: StageRule[],
  daysSincePlanting: number | null | undefined,
  manualStageKey: string | null | undefined,
): StageForDayResult | null {
  if (!templateStages.length) return null;
  const manualIdx = resolveManualStageIndex(templateStages, manualStageKey);
  if (manualIdx != null) {
    return { stage: templateStages[manualIdx], index: manualIdx };
  }
  if (daysSincePlanting == null) return null;
  if (daysSincePlanting < 0) return { stage: templateStages[0], index: 0 };
  return getStageForDay(templateStages, daysSincePlanting);
}
