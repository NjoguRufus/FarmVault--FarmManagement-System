import React from 'react';
import { Package, AlertTriangle, XCircle, Wallet, FileText } from 'lucide-react';
import { SimpleStatCard } from '@/components/dashboard/SimpleStatCard';
import { Button } from '@/components/ui/button';

interface InventoryStatsCardsProps {
  totalItems: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalInventoryValue: number;
  onOpenAudit?: () => void;
}

export function InventoryStatsCards({
  totalItems,
  lowStockCount,
  outOfStockCount,
  totalInventoryValue,
  onOpenAudit,
}: InventoryStatsCardsProps) {
  return (
    <div className="space-y-3">
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
      
      {onOpenAudit && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenAudit}
            className="text-muted-foreground hover:text-foreground"
          >
            <FileText className="h-4 w-4 mr-2" />
            Inventory Audit
          </Button>
        </div>
      )}
    </div>
  );
}

