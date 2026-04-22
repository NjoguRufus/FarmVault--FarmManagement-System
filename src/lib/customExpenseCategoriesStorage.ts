import { BROKER_EXPENSE_CATEGORIES } from '@/types';

/** Default farm expense categories shown first (filter + add modal), in display order. */
export const COMPANY_EXPENSE_CATEGORY_CORE_ORDER = [
  'tools',
  'fertilizer',
  'chemical',
  'fuel',
  'labour',
  'other',
] as const;

const CORE_LOWER = new Set(
  COMPANY_EXPENSE_CATEGORY_CORE_ORDER.map((v) => v.toLowerCase()),
);

const BROKER_LOWER = new Set(
  BROKER_EXPENSE_CATEGORIES.map((x) => String(x.value).toLowerCase()),
);

export const CUSTOM_EXPENSE_CATEGORIES_CHANGED = 'farmvault-custom-expense-categories-changed';

function storageKey(companyId: string | null) {
  return companyId
    ? `farmvault.customExpenseCategories.v1.${companyId}`
    : 'farmvault.customExpenseCategories.v1._anonymous';
}

/** Broker market slugs (excludes `other`, which is shared with farm categories). */
export function isBrokerExpenseCategorySlug(name: string): boolean {
  const t = name.trim().toLowerCase();
  if (!t || t === 'other') return false;
  return BROKER_LOWER.has(t);
}

/** Built-in or broker slug — not stored as a “custom” company category. */
export function isReservedExpenseCategoryName(name: string): boolean {
  const t = name.trim().toLowerCase();
  if (!t) return true;
  if (CORE_LOWER.has(t)) return true;
  if (BROKER_LOWER.has(t)) return true;
  return false;
}

export function loadCustomExpenseCategories(companyId: string | null): string[] {
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

export function saveCustomExpenseCategories(companyId: string | null, list: string[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(companyId), JSON.stringify(list));
}

function notifyCustomExpenseCategoriesChanged(companyId: string | null) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(CUSTOM_EXPENSE_CATEGORIES_CHANGED, { detail: { companyId } }),
  );
}

/**
 * Persist a user-added category as soon as they choose it (Add modal combobox).
 * Returns true when a new name was stored.
 */
export function addCustomExpenseCategory(companyId: string | null, name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  if (isReservedExpenseCategoryName(t)) return false;
  const existing = loadCustomExpenseCategories(companyId);
  if (existing.some((e) => e.toLowerCase() === t.toLowerCase())) return false;
  saveCustomExpenseCategories(companyId, [...existing, t]);
  notifyCustomExpenseCategoriesChanged(companyId);
  return true;
}
