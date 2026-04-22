/**
 * When an expense category matches farm inputs, offer to add the purchase to inventory
 * (expense already recorded — inventory modal should not double-book to finance).
 */

/** Core expense slugs that map to inventory inputs (see COMPANY_EXPENSE_CATEGORY_CORE_ORDER). */
const INVENTORY_EXPENSE_SLUGS = new Set([
  'fertilizer',
  'fertiliser',
  'chemical',
  'fuel',
  'inventory_purchase',
]);

export function shouldPromptAddInventoryAfterExpense(category: string): boolean {
  const s = category.trim().toLowerCase();
  if (INVENTORY_EXPENSE_SLUGS.has(s)) return true;
  // Custom labels often used for inputs
  if (
    /\b(fertil|pesticid|herbicid|fungicid|insecticid|nematicid)\b/.test(s) ||
    /\b(diesel|petrol|kerosene)\b/.test(s)
  ) {
    return true;
  }
  return false;
}

/**
 * Maps saved expense category to Add Item category template id, when applicable.
 * Returns undefined when the user should pick category manually.
 */
export function expenseCategoryToInventoryTemplate(category: string): string | undefined {
  const s = category.trim().toLowerCase();
  if (s === 'fertilizer' || s === 'fertiliser' || /\bfertil/.test(s)) return 'template:fertilizer';
  if (s === 'fuel' || /\bdiesel\b|\bpetrol\b|\bkerosene\b/.test(s)) return 'template:fuel';
  if (
    s === 'chemical' ||
    s === 'inventory_purchase' ||
    /\bpesticid|\bherbicid|\bfungicid|\binsecticid|\bnematicid\b/.test(s)
  ) {
    return 'template:chemical';
  }
  if (/\btying\b|\brope\b|\bsack\b/.test(s)) return 'template:tying-ropes-sacks';
  return undefined;
}
