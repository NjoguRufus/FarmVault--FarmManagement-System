/**
 * Crop emoji mapping — single source of truth for projects list, nav, and records notebook cards.
 * Matches `ProjectsPage` / `ProjectsTable` keys (e.g. `watermelons` plural).
 */

const EXACT: Record<string, string> = {
  tomatoes: '🍅',
  'french-beans': '🫛',
  /** Bell pepper (U+1FAD1); not hot pepper 🌶️ */
  capsicum: '🫑',
  maize: '🌽',
  watermelons: '🍉',
  watermelon: '🍉',
  rice: '🌾',
};

function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * @param typeKey crop type / slug / crop_id (e.g. `tomatoes`, `custom:french-beans`)
 */
export function cropTypeKeyEmoji(typeKey: string | null | undefined): string {
  const key = normalizeKey(typeKey ?? '');
  if (!key) return '🌱';
  if (EXACT[key]) return EXACT[key];

  const withoutCustom = key.startsWith('custom:') ? key.slice('custom:'.length) : key;
  if (EXACT[withoutCustom]) return EXACT[withoutCustom];

  if (withoutCustom.includes('tomat')) return '🍅';
  if (withoutCustom.includes('bean') || withoutCustom.includes('french')) return '🫛';
  if (withoutCustom.includes('capsic')) return '🫑';
  if (withoutCustom.includes('bell') && withoutCustom.includes('pepper')) return '🫑';
  if (withoutCustom.includes('pepper')) return '🌶️';
  if (withoutCustom.includes('maize') || withoutCustom.includes('corn')) return '🌽';
  if (withoutCustom.includes('melon') || withoutCustom.includes('water')) return '🍉';
  if (withoutCustom.includes('rice')) return '🌾';

  return '🌱';
}
