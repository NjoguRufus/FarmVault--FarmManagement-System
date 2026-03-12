import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { InventoryStockRow } from '@/services/inventoryReadModelService';
import { LowStockBadge } from './LowStockBadge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

interface InventoryTableProps {
  items: InventoryStockRow[];
  isLoading?: boolean;
  onViewDetails?: (itemId: string) => void;
  onRecordStockIn?: (item: InventoryStockRow) => void;
  onRecordUsage?: (item: InventoryStockRow) => void;
}

const formatCurrency = (amount: number | null | undefined) =>
  amount != null ? `KES ${amount.toLocaleString()}` : '—';

export function InventoryTable({
  items,
  isLoading,
  onViewDetails,
  onRecordStockIn,
  onRecordUsage,
}: InventoryTableProps) {
  if (isLoading) {
    return (
      <div className="fv-card p-6 text-sm text-muted-foreground text-center">
        Loading inventory…
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="fv-card p-8 text-center space-y-2">
        <p className="text-base font-medium text-foreground">No inventory items found</p>
        <p className="text-sm text-muted-foreground">
          Add your first item to start tracking stock across your farm inputs.
        </p>
      </div>
    );
  }

  return (
    <div className="fv-card overflow-x-auto">
      <table className="fv-table min-w-full">
        <thead>
          <tr>
            <th className="text-left">Item</th>
            <th className="text-left hidden sm:table-cell">Category</th>
            <th className="text-left hidden md:table-cell">Supplier</th>
            <th className="text-right">Current Stock</th>
            <th className="text-right hidden md:table-cell">Min Level</th>
            <th className="text-right hidden lg:table-cell">Avg Cost</th>
            <th className="text-right hidden lg:table-cell">Stock Value</th>
            <th className="text-left">Status</th>
            <th className="w-0" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => onViewDetails?.(item.id)}
            >
              <td>
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">{item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.unit}
                    {item.category_name ? ` • ${item.category_name}` : ''}
                  </span>
                </div>
              </td>
              <td className="hidden sm:table-cell">
                <span className="text-sm text-muted-foreground">
                  {item.category_name ?? item.category}
                </span>
              </td>
              <td className="hidden md:table-cell">
                <span className="text-sm text-muted-foreground">
                  {item.supplier_name ?? '—'}
                </span>
              </td>
              <td className="text-right whitespace-nowrap">
                <span className="font-semibold">
                  {item.current_stock.toLocaleString()} {item.unit}
                </span>
              </td>
              <td className="text-right hidden md:table-cell">
                {item.min_stock_level != null ? item.min_stock_level.toLocaleString() : '—'}
              </td>
              <td className="text-right hidden lg:table-cell">
                {formatCurrency(item.average_cost ?? null)}
              </td>
              <td className="text-right hidden lg:table-cell">
                {formatCurrency(item.total_value ?? null)}
              </td>
              <td>
                <LowStockBadge
                  status={item.stock_status ?? undefined}
                  current={item.current_stock}
                  min={item.min_stock_level ?? undefined}
                />
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                {(onRecordStockIn || onRecordUsage || onViewDetails) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger className="p-1 rounded-lg hover:bg-muted focus:outline-none">
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onViewDetails && (
                        <DropdownMenuItem onClick={() => onViewDetails(item.id)}>
                          View details
                        </DropdownMenuItem>
                      )}
                      {onRecordStockIn && (
                        <DropdownMenuItem onClick={() => onRecordStockIn(item)}>
                          Record stock in
                        </DropdownMenuItem>
                      )}
                      {onRecordUsage && (
                        <DropdownMenuItem onClick={() => onRecordUsage(item)}>
                          Record usage
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

