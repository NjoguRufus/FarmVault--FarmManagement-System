/**
 * Normalize finance.expenses category values for reporting (labour vs inputs).
 */

export function normalizeExpenseCategoryKey(category: string): string {
  return String(category || '')
    .toLowerCase()
    .trim()
    .replace(/_/g, '-');
}

export function isLabourExpenseCategory(category: string): boolean {
  const k = normalizeExpenseCategoryKey(category);
  if (!k) return false;
  if (k === 'labour' || k === 'labor') return true;
  if (k === 'picker-payout' || k === 'pickerpayout') return true;
  if (k.includes('picker') && k.includes('payout')) return true;
  if (k.includes('wage') || k.includes('salary')) return true;
  return false;
}

export function isInputExpenseCategory(category: string): boolean {
  const k = normalizeExpenseCategoryKey(category);
  if (!k) return false;
  const direct = new Set([
    'fertilizer',
    'fertiliser',
    'chemical',
    'chemicals',
    'fuel',
    'seeds',
    'seed',
    'inputs',
    'input',
    'pesticide',
    'herbicide',
    'transport',
    'machinery',
    'equipment',
    'irrigation',
  ]);
  if (direct.has(k)) return true;
  if (k.includes('fertil')) return true;
  if (k.includes('chemical')) return true;
  return false;
}
