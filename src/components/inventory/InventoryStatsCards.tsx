import React from 'react';
import { Package, AlertTriangle, XCircle, Wallet } from 'lucide-react';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';

interface InventoryStatsCardsProps {
  totalItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalInventoryValue: number;
}

export function InventoryStatsCards({
  totalItems,
  lowStockCount,
  outOfStockCount,
  totalInventoryValue,
}: InventoryStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
      <SimpleStatCard
        title="Total Items"
        value={totalItems}
        icon={Package}
        iconVariant="default"
        layout="mobile-compact"
      />
      <SimpleStatCard
        title="Low Stock"
        value={lowStockCount}
        icon={AlertTriangle}
        iconVariant="warning"
        layout="mobile-compact"
      />
      <SimpleStatCard
        title="Out of Stock"
        value={outOfStockCount}
        icon={XCircle}
        iconVariant="destructive"
        layout="mobile-compact"
      />
      <SimpleStatCard
        title="Total Value"
        value={`KES ${totalInventoryValue.toLocaleString()}`}
        icon={Wallet}
        iconVariant="info"
        layout="mobile-compact"
      />
    </div>
  );
}

