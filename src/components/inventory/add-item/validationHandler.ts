import { isContinuousUnit, type StockUnit } from '@/components/inventory/add-item/inventoryAddItemUnits';
import { isValidPositive, parsePositiveNumber } from '@/components/inventory/add-item/validation';

/** Step 2: quantity fields — returns a user-facing message or null if OK. */
export function validateQuantityStep(unit: StockUnit, amountPerItem: string, numberOfItems: string): string | null {
  if (!isValidPositive(numberOfItems)) {
    return 'Enter how many items you have (greater than zero).';
  }
  if (isContinuousUnit(unit)) {
    if (!isValidPositive(amountPerItem)) {
      return 'Enter amount per item (greater than zero).';
    }
  }
  return null;
}

/** Parsed quantities for submit; call only after validateQuantityStep passes. */
export function parseQuantityForSubmit(
  unit: StockUnit,
  amountPerItem: string,
  numberOfItems: string,
): { unitSize: number; stockQuantity: number } {
  const n = parsePositiveNumber(numberOfItems);
  if (isContinuousUnit(unit)) {
    const per = parsePositiveNumber(amountPerItem);
    return { unitSize: per, stockQuantity: per * n };
  }
  return { unitSize: 1, stockQuantity: n };
}
