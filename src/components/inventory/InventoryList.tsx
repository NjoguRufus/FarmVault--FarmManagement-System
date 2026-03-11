import type { InventoryItem } from '@/types';
import { InventoryItemCard } from './InventoryItemCard';

export type InventoryListProps = {
  items: InventoryItem[];
  lowStockIds?: Set<string>;
  onSelectItem?: (item: InventoryItem) => void;
  onRestockItem?: (item: InventoryItem) => void;
  onDeductItem?: (item: InventoryItem) => void;
};

export function InventoryList(props: InventoryListProps) {
  const { items, lowStockIds, onSelectItem, onRestockItem, onDeductItem } = props;

  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No inventory items yet. Add your first item to start tracking stock.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <InventoryItemCard
          key={item.id}
          item={item}
          isLowStock={lowStockIds?.has(item.id) ?? false}
          onSelect={onSelectItem ? () => onSelectItem(item) : undefined}
          onRestock={onRestockItem ? () => onRestockItem(item) : undefined}
          onDeduct={onDeductItem ? () => onDeductItem(item) : undefined}
        />
      ))}
    </div>
  );
}

