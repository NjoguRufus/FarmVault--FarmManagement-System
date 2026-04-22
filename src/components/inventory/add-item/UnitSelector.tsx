import { forwardRef } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STOCK_UNITS, type StockUnit } from '@/components/inventory/add-item/inventoryAddItemUnits';

type Props = {
  value: StockUnit;
  onChange: (unit: StockUnit) => void;
  id?: string;
  disabled?: boolean;
  triggerClassName?: string;
};

const LABELS: Record<StockUnit, string> = {
  ml: 'ml',
  litres: 'Litres',
  kg: 'kg',
  grams: 'Grams',
  pieces: 'Pieces',
  meters: 'Meters',
};

export const UnitSelector = forwardRef<HTMLButtonElement, Props>(function UnitSelector(
  { value, onChange, id = 'inv-stock-unit', disabled, triggerClassName },
  ref,
) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        Unit *
      </Label>
      <Select value={value} onValueChange={(v) => onChange(v as StockUnit)} disabled={disabled}>
        <SelectTrigger ref={ref} id={id} className={triggerClassName ?? 'w-full'}>
          <SelectValue placeholder="Choose unit" />
        </SelectTrigger>
        <SelectContent>
          {STOCK_UNITS.map((u) => (
            <SelectItem key={u} value={u}>
              {LABELS[u]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">This controls how quantities and stock are counted.</p>
    </div>
  );
});
