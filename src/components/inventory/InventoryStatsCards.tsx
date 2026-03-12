import React from 'react';
import { Package, AlertTriangle, XCircle, Wallet } from 'lucide-react';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';

interface InventoryStatsCardsProps {
  totalItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalInventoryValue: number;
}

const formatCurrency = (amount: number) => `KES ${amount.toLocaleString()}`;

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
      />
      <SimpleStatCard
        title="Low Stock"
        value={lowStockCount}
        icon={AlertTriangle}
        iconVariant="warning"
      />
      <SimpleStatCard
        title="Out of Stock"
        value={outOfStockCount}
        icon={XCircle}
        iconVariant="destructive"
      />
      <SimpleStatCard
        title="Total Inventory Value"
        value={formatCurrency(totalInventoryValue)}
        icon={Wallet}
        iconVariant="info"
      />
    </div>
  );
}

