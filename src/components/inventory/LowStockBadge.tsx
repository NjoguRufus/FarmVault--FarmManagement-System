import React from 'react';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import type { InventoryStockStatus } from '@/services/inventoryReadModelService';
import { cn } from '@/lib/utils';

interface LowStockBadgeProps {
  status?: InventoryStockStatus | null;
  current?: number | null;
  min?: number | null;
  size?: 'sm' | 'md';
}

export function LowStockBadge({ status, current, min, size = 'md' }: LowStockBadgeProps) {
  const effectiveStatus: InventoryStockStatus =
    status ??
    (typeof current === 'number' && typeof min === 'number'
      ? current <= 0
        ? 'out'
        : current < min
          ? 'low'
          : 'ok'
      : 'ok');

  const isSmall = size === 'sm';
  const baseClasses = isSmall
    ? 'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap'
    : 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap';
  const iconClasses = isSmall ? 'h-2.5 w-2.5 shrink-0' : 'h-3 w-3 shrink-0';

  if (effectiveStatus === 'ok') {
    return (
      <span className={cn(baseClasses, 'bg-emerald-50 text-emerald-700')}>
        <CheckCircle className={iconClasses} />
        In Stock
      </span>
    );
  }

  if (effectiveStatus === 'out') {
    return (
      <span className={cn(baseClasses, 'bg-destructive/10 text-destructive')}>
        <XCircle className={iconClasses} />
        Out of Stock
      </span>
    );
  }

  return (
    <span className={cn(baseClasses, 'bg-amber-50 text-amber-800')}>
      <AlertTriangle className={iconClasses} />
      Low Stock
    </span>
  );
}
