import { BASE_WORK_TYPES } from '@/lib/workTypeConstants';

function storageKey(companyId: string | null) {
  return companyId
    ? `farmvault.customWorkCategories.v1.${companyId}`
    : 'farmvault.customWorkCategories.v1._anonymous';
}

export function loadCustomWorkCategories(companyId: string | null): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function saveCustomWorkCategories(companyId: string | null, list: string[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(companyId), JSON.stringify(list));
}

/** Returns true if a new category was stored. */
export function addCustomWorkCategory(companyId: string | null, name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  const existing = loadCustomWorkCategories(companyId);
  if (existing.some((e) => e.toLowerCase() === t.toLowerCase())) return false;
  if (BASE_WORK_TYPES.some((e) => e.toLowerCase() === t.toLowerCase())) return false;
  saveCustomWorkCategories(companyId, [...existing, t]);
  return true;
}
