import type { NoteCategory } from '@/types';

export const NOTE_CATEGORIES: { value: NoteCategory; label: string }[] = [
  { value: 'timing', label: 'Timing' },
  { value: 'fertilizer', label: 'Fertilizer' },
  { value: 'pests-diseases', label: 'Pests & Diseases' },
  { value: 'sprays', label: 'Sprays' },
  { value: 'yield', label: 'Yield' },
  { value: 'general', label: 'General' },
];

/** Crop ids used in notes (match Firestore crops collection). */
export const CROP_IDS = [
  'tomatoes',
  'capsicum',
  'watermelons',
  'french-beans',
  'maize',
  'rice',
] as const;

export const CROP_DISPLAY_NAMES: Record<string, string> = {
  tomatoes: 'Tomatoes',
  capsicum: 'Capsicum',
  watermelons: 'Watermelon',
  'french-beans': 'French Beans',
  maize: 'Maize',
  rice: 'Rice',
};

export function getCropDisplayName(cropId: string): string {
  return CROP_DISPLAY_NAMES[cropId] ?? cropId;
}

export function getCategoryLabel(category: NoteCategory): string {
  return NOTE_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}
