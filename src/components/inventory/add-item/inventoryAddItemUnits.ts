/** Units shown in Add Item — drives form layout and stock math. */
export const STOCK_UNITS = ['ml', 'litres', 'kg', 'grams', 'pieces', 'meters'] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];

const CONTINUOUS = new Set<StockUnit>(['ml', 'litres', 'kg', 'grams']);

export function isContinuousUnit(unit: StockUnit): boolean {
  return CONTINUOUS.has(unit);
}

/** Label fragment for "amount per item" row, e.g. "litres per item". */
export function amountPerItemLabel(unit: StockUnit): string {
  switch (unit) {
    case 'litres':
      return 'Litres per item';
    case 'ml':
      return 'ml per item';
    case 'kg':
      return 'kg per item';
    case 'grams':
      return 'grams per item';
    default:
      return 'Amount per item';
  }
}

export function amountPerItemPlaceholder(unit: StockUnit): string {
  switch (unit) {
    case 'litres':
      return 'Enter litres per item';
    case 'ml':
      return 'Enter ml per item';
    case 'kg':
      return 'Enter kg per item';
    case 'grams':
      return 'Enter grams per item';
    default:
      return 'Amount per item';
  }
}

export function totalQuantityLabel(unit: StockUnit): string {
  switch (unit) {
    case 'litres':
      return 'litres';
    case 'ml':
      return 'ml';
    case 'kg':
      return 'kg';
    case 'grams':
      return 'grams';
    case 'pieces':
      return 'pieces';
    case 'meters':
      return 'meters';
    default:
      return '';
  }
}
