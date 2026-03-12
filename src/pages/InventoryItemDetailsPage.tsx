import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { useInventoryItemStock, useInventoryTransactions, useInventoryUsage } from '@/hooks/useInventoryReadModels';
import { InventoryTransactionTimeline } from '@/components/inventory/InventoryTransactionTimeline';
import { InventoryUsageTable } from '@/components/inventory/InventoryUsageTable';
import { LowStockBadge } from '@/components/inventory/LowStockBadge';

const formatCurrency = (amount: number | null | undefined) =>
  amount != null ? `KES ${amount.toLocaleString()}` : 'KES 0';

export default function InventoryItemDetailsPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeProject } = useProject();
  const companyId = user?.companyId ?? activeProject?.companyId ?? null;

  const { item, isLoading: itemLoading } = useInventoryItemStock(companyId, itemId ?? null);
  const { transactions, isLoading: txLoading } = useInventoryTransactions(companyId, itemId ?? null, 50);
  const { usage, isLoading: usageLoading } = useInventoryUsage(companyId, itemId ?? null, 50);

  if (!itemId || (!item && !itemLoading)) {
    return (
      <div className="space-y-6 animate-fade-in">
        <button
          type="button"
          className="fv-btn fv-btn--secondary flex items-center gap-2"
          onClick={() => navigate('/inventory')}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Inventory
        </button>
        <p className="text-sm text-muted-foreground">Inventory item not found.</p>
      </div>
    );
  }

  if (!item) {
    return <p className="text-sm text-muted-foreground">Loading item…</p>;
  }

  const stockValue =
    typeof item.total_value === 'number'
      ? item.total_value
      : (item.current_stock || 0) * (item.average_cost || 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <button
        type="button"
        className="fv-btn fv-btn--secondary flex items-center gap-2"
        onClick={() => navigate('/inventory')}
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Inventory
      </button>

      <div className="fv-card p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{item.name}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {item.category_name ?? item.category} • {item.unit}
            </p>
            {item.supplier_name && (
              <p className="text-xs text-muted-foreground mt-1">
                Supplier: <span className="font-medium">{item.supplier_name}</span>
              </p>
            )}
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <LowStockBadge
              status={item.stock_status ?? undefined}
              current={item.current_stock}
              min={item.min_stock_level ?? undefined}
            />
            <p className="text-sm text-muted-foreground">
              Min stock: {item.min_stock_level != null ? item.min_stock_level.toLocaleString() : '—'}
              {item.reorder_quantity != null && (
                <> • Reorder: {item.reorder_quantity.toLocaleString()}</>
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Current Stock</p>
            <p className="text-lg font-semibold mt-1">
              {item.current_stock.toLocaleString()} {item.unit}
            </p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Average Cost</p>
            <p className="text-lg font-semibold mt-1">
              {formatCurrency(item.average_cost ?? null)} / {item.unit}
            </p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Stock Value</p>
            <p className="text-lg font-semibold mt-1">
              {formatCurrency(stockValue)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        <div className="fv-card p-4 sm:p-5">
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2">
            Transaction Timeline
          </h3>
          <InventoryTransactionTimeline
            transactions={transactions}
            isLoading={txLoading}
          />
        </div>
        <div className="fv-card p-4 sm:p-5">
          <h3 className="text-base font-semibold mb-3">Usage History</h3>
          <InventoryUsageTable usage={usage} isLoading={usageLoading} />
        </div>
      </div>
    </div>
  );
}

