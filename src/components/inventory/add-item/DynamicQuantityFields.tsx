import { AnimatePresence, motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  amountPerItemLabel,
  amountPerItemPlaceholder,
  isContinuousUnit,
  totalQuantityLabel,
  type StockUnit,
} from '@/components/inventory/add-item/inventoryAddItemUnits';
import { cn } from '@/lib/utils';

type Props = {
  unit: StockUnit;
  amountPerItem: string;
  numberOfItems: string;
  onAmountPerItemChange: (v: string) => void;
  onNumberOfItemsChange: (v: string) => void;
  totalQuantity: number;
  disabled?: boolean;
  reducedMotion?: boolean | null;
};

export function DynamicQuantityFields({
  unit,
  amountPerItem,
  numberOfItems,
  onAmountPerItemChange,
  onNumberOfItemsChange,
  totalQuantity,
  disabled,
  reducedMotion,
}: Props) {
  const continuous = isContinuousUnit(unit);
  const totalLabel = totalQuantityLabel(unit);
  const showTotal = Number.isFinite(totalQuantity) && totalQuantity > 0;

  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout" initial={false}>
        {continuous ? (
          <motion.div
            key="continuous-row"
            initial={reducedMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reducedMotion ? undefined : { opacity: 0, height: 0 }}
            transition={{ duration: reducedMotion ? 0.1 : 0.2 }}
            className="grid grid-cols-2 gap-3 overflow-hidden"
          >
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="inv-amount-per-item" className="text-sm font-medium">
                {amountPerItemLabel(unit)}
              </Label>
              <Input
                id="inv-amount-per-item"
                inputMode="decimal"
                placeholder={amountPerItemPlaceholder(unit)}
                value={amountPerItem}
                onChange={(e) => onAmountPerItemChange(e.target.value)}
                disabled={disabled}
                min={0}
                className="min-w-0"
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="inv-number-of-items" className="text-sm font-medium">
                Number of items
              </Label>
              <Input
                id="inv-number-of-items"
                inputMode="numeric"
                placeholder="How many?"
                value={numberOfItems}
                onChange={(e) => onNumberOfItemsChange(e.target.value)}
                disabled={disabled}
                min={0}
                className="min-w-0"
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="count-row"
            initial={reducedMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={reducedMotion ? undefined : { opacity: 0, height: 0 }}
            transition={{ duration: reducedMotion ? 0.1 : 0.2 }}
            className="space-y-1.5 overflow-hidden"
          >
            <Label htmlFor="inv-number-of-items-pieces" className="text-sm font-medium">
              How many items?
            </Label>
            <Input
              id="inv-number-of-items-pieces"
              inputMode="numeric"
              placeholder="How many items?"
              value={numberOfItems}
              onChange={(e) => onNumberOfItemsChange(e.target.value)}
              disabled={disabled}
              min={0}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={cn(
          'rounded-lg border border-border/80 bg-muted/30 px-3 py-2 text-sm transition-opacity',
          showTotal ? 'opacity-100' : 'opacity-60',
        )}
      >
        <span className="text-muted-foreground">Total: </span>
        <span className="font-semibold tabular-nums text-foreground">
          {showTotal ? (
            <>
              {totalQuantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} {totalLabel}
            </>
          ) : (
            '—'
          )}
        </span>
      </div>
    </div>
  );
}
