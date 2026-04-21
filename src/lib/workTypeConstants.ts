/** Canonical work categories for plan / record modals (stored on work cards as `workCategory`). */
export const BASE_WORK_TYPES = [
  'Spraying',
  'Fertilizer Application',
  'Watering',
  'Weeding',
  'Tying',
  'Harvesting',
  'Planting',
  'Land Preparation',
  'Pruning',
  'Pest Control',
  'General Maintenance',
  'Quick',
] as const;

export type BaseWorkType = (typeof BASE_WORK_TYPES)[number];

export function mergeWorkTypesWithCustom(custom: string[]): string[] {
  const base = [...BASE_WORK_TYPES];
  const seen = new Set(base.map((s) => s.toLowerCase()));
  for (const c of custom) {
    const t = c.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    base.push(t);
  }
  return base;
}

/** Short labels on Farm Work → Record Work quick picker (category = value saved). */
export const DEFAULT_QUICK_FARM_WORK_CHIPS: { label: string; category: string }[] = [
  { label: 'Spraying', category: 'Spraying' },
  { label: 'Fertilizer', category: 'Fertilizer Application' },
  { label: 'Irrigation', category: 'Watering' },
  { label: 'Weeding', category: 'Weeding' },
  { label: 'Planting', category: 'Planting' },
  { label: 'Pest control', category: 'Pest Control' },
];
