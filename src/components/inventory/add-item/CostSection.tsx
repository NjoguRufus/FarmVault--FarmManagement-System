import { forwardRef } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Props = {
  pricePerItem: string;
  onPricePerItemChange: (v: string) => void;
  totalCost: string;
  onTotalCostChange: (v: string) => void;
  autoTotalHint?: string;
  disabled?: boolean;
  currencyPrefix?: string;
};

export const CostSection = forwardRef<HTMLInputElement, Props>(function CostSection(
  {
    pricePerItem,
    onPricePerItemChange,
    totalCost,
    onTotalCostChange,
    autoTotalHint,
    disabled,
    currencyPrefix,
  },
  priceInputRef,
) {
  const pad = currencyPrefix ? 'pl-12' : '';

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card/50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cost (optional)</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="inv-price-per-item" className="text-sm font-medium">
            Price per item
          </Label>
          <div className="relative">
            {currencyPrefix ? (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {currencyPrefix}
              </span>
            ) : null}
            <Input
              ref={priceInputRef}
              id="inv-price-per-item"
              inputMode="decimal"
              placeholder="e.g. 2500"
              value={pricePerItem}
              onChange={(e) => onPricePerItemChange(e.target.value)}
              disabled={disabled}
              min={0}
              className={cn('fv-input', pad)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-total-cost" className="text-sm font-medium">
            Auto total <span className="font-normal text-muted-foreground">(editable)</span>
          </Label>
          <div className="relative">
            {currencyPrefix ? (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {currencyPrefix}
              </span>
            ) : null}
            <Input
              id="inv-total-cost"
              inputMode="decimal"
              placeholder={autoTotalHint ?? 'Total'}
              value={totalCost}
              onChange={(e) => onTotalCostChange(e.target.value)}
              disabled={disabled}
              min={0}
              className={cn('fv-input', pad)}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">Fills from price × items; edit anytime.</p>
        </div>
      </div>
    </div>
  );
});
