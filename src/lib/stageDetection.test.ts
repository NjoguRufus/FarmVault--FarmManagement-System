import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { detectStage } from '@/lib/stageDetection';
import { getCropStages } from '@/lib/cropStageConfig';
import type { CropType } from '@/types';

const TEST_NOW = new Date('2024-01-15T00:00:00.000Z');

describe('stage detection from planting date', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TEST_NOW);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  const crops: CropType[] = [
    'tomatoes',
    'french_beans',
    'capsicum',
    'maize',
    'rice',
    'watermelon',
  ] as CropType[];

  it.each(crops)('detects a stable stage for %s from planting date', (cropType) => {
    const stages = getCropStages(cropType);
    expect(stages.length).toBeGreaterThan(0);

    // Use the second stage when available, otherwise the first.
    const targetIndex = stages.length > 1 ? 1 : 0;
    const targetStage = stages[targetIndex];
    const midDay = Math.floor((targetStage.baseDayStart + targetStage.baseDayEnd) / 2);

    const plantingDate = new Date(TEST_NOW);
    plantingDate.setDate(plantingDate.getDate() - midDay);

    const result = detectStage(cropType, plantingDate, 'open_field');
    expect(result).not.toBeNull();
    expect(result?.stageKey).toBe(targetStage.key);
  });
});

