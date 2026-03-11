import { AlertTriangle, Package } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { InventoryItem } from '@/types';
import { cn } from '@/lib/utils';

export type InventoryItemCardProps = {
  item: InventoryItem;
  isLowStock: boolean;
  onSelect?: () => void;
  onRestock?: () => void;
  onDeduct?: () => void;
};

export function InventoryItemCard(props: InventoryItemCardProps) {
  const { item, isLowStock, onSelect, onRestock, onDeduct } = props;

  const quantityDisplay = `${item.quantity} ${item.unit}`;

  return (
    <Card
      className={cn(
        'group cursor-pointer transition hover:border-primary/60 hover:shadow-sm',
        isLowStock && 'border-amber-400 bg-amber-50/40',
      )}
      onClick={onSelect}
    >
      <CardContent className="flex items-start gap-3 p-3 md:p-4">
        <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Package className="h-5 w-5" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium">{item.name}</div>
              <div className="text-xs text-muted-foreground">
                {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
              </div>
            </div>
            <div className="text-right text-sm font-semibold tabular-nums">{quantityDisplay}</div>
          </div>

          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            {isLowStock ? (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                Low stock
              </span>
            ) : (
              <span>Healthy stock</span>
            )}
            <div className="flex items-center gap-2">
              {onRestock && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestock();
                  }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Restock
                </button>
              )}
              {onDeduct && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeduct();
                  }}
                  className="text-xs font-medium text-destructive hover:underline"
                >
                  Deduct
                </button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

