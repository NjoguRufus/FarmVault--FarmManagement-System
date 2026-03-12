import React from 'react';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import type { InventoryStockStatus } from '@/services/inventoryReadModelService';
import { cn } from '@/lib/utils';

interface LowStockBadgeProps {
  status?: InventoryStockStatus | null;
  current?: number | null;
  min?: number | null;
}

export function LowStockBadge({ status, current, min }: LowStockBadgeProps) {
  const effectiveStatus: InventoryStockStatus =
    status ??
    (typeof current === 'number' && typeof min === 'number'
      ? current <= 0
        ? 'out'
        : current < min
          ? 'low'
          : 'ok'
      : 'ok');

  if (effectiveStatus === 'ok') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs font-medium">
        <CheckCircle className="h-3 w-3" />
        In Stock
      </span>
    );
  }

  if (effectiveStatus === 'out') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-medium">
        <XCircle className="h-3 w-3" />
        Out of Stock
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        'bg-amber-50 text-amber-800',
      )}
    >
      <AlertTriangle className="h-3 w-3" />
      Low Stock
    </span>
  );
}

