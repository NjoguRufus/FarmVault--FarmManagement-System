import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, 
  Plus, 
  Minus,
  Package, 
  Wheat, 
  Boxes, 
  Wine, 
  PackageOpen,
  Box
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { useInventoryItemStock, useInventoryTransactions, useInventoryUsage } from '@/hooks/useInventoryReadModels';
import { InventoryTransactionTimeline } from '@/components/inventory/InventoryTransactionTimeline';
import { InventoryUsageTable } from '@/components/inventory/InventoryUsageTable';
import { LowStockBadge } from '@/components/inventory/LowStockBadge';
import { RecordStockInModal } from '@/components/inventory/RecordStockInModal';
import { RecordUsageModal } from '@/components/inventory/RecordUsageModal';
import { SupplierService } from '@/services/localData/SupplierService';
import type { Supplier } from '@/types';
import type { PackagingType } from '@/services/inventoryReadModelService';

const formatCurrency = (amount: number | null | undefined) =>
  amount != null ? `KES ${amount.toLocaleString()}` : 'KES 0';

const packagingConfig: Record<PackagingType, { 
  icon: React.ElementType; 
  label: string; 
  singularLabel: string;
  pluralLabel: string;
  color: string;
  bgColor: string;
}> = {
  single: { 
    icon: Box, 
    label: 'Single Item', 
    singularLabel: 'item',
    pluralLabel: 'items',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  sack: { 
    icon: Wheat, 
    label: 'Sack / Bag', 
    singularLabel: 'sack',
    pluralLabel: 'sacks',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
  },
  box: { 
    icon: Boxes, 
    label: 'Box / Carton', 
    singularLabel: 'box',
    pluralLabel: 'boxes',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
  bottle: { 
    icon: Wine, 
    label: 'Bottle / Container', 
    singularLabel: 'bottle',
    pluralLabel: 'bottles',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
  },
  pack: { 
    icon: PackageOpen, 
    label: 'Pack / Bundle', 
    singularLabel: 'pack',
    pluralLabel: 'packs',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  other: { 
    icon: Package, 
    label: 'Other', 
    singularLabel: 'unit',
    pluralLabel: 'units',
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
  },
};

function getPackagingFromUnit(unit: string): PackagingType {
  const u = unit.toLowerCase();
  if (u.includes('sack') || u.includes('bag')) return 'sack';
  if (u.includes('box') || u.includes('carton')) return 'box';
  if (u.includes('bottle') || u.includes('container') || u.includes('litre') || u.includes('liter') || u === 'ml' || u === 'l') return 'bottle';
  if (u.includes('pack') || u.includes('bundle')) return 'pack';
  if (u === 'pieces' || u === 'piece' || u === 'pcs' || u === 'units' || u === 'items') return 'single';
  return 'other';
}

function formatUnitLabel(unit: string, value: number): string {
  const u = unit.toLowerCase();
  if (u === 'litres' || u === 'litre') return value === 1 ? 'litre' : 'litres';
  if (u === 'pieces' || u === 'piece') return value === 1 ? 'piece' : 'pieces';
  if (u === 'metres' || u === 'meter' || u === 'meters') return value === 1 ? 'meter' : 'meters';
  return unit;
}

export default function InventoryItemDetailsPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeProject } = useProject();
  const companyId = user?.companyId ?? activeProject?.companyId ?? null;

  const { item, isLoading: itemLoading, refetch: refetchItem } = useInventoryItemStock(companyId, itemId ?? null);
  const { transactions, isLoading: txLoading } = useInventoryTransactions(companyId, itemId ?? null, 30);
  const { usage, isLoading: usageLoading } = useInventoryUsage(companyId, itemId ?? null, 30);

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers', companyId ?? 'none'],
    queryFn: async () => {
      if (!companyId) return [];
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await SupplierService.pullRemote(companyId);
        } catch {
          // ignore
        }
      }
      return SupplierService.listSuppliers(companyId);
    },
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const [stockInOpen, setStockInOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [historyView, setHistoryView] = useState<'usage' | 'transactions'>('usage');

  const handleRecorded = () => {
    refetchItem();
  };

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

  const packagingType = item.packaging_type || getPackagingFromUnit(item.unit);
  const config = packagingConfig[packagingType];
  const Icon = config.icon;
  const unitSize = item.unit_size || 1;
  const stock = item.current_stock;

  const getFarmerFriendlyStock = (): string => {
    if (stock <= 0) return 'Out of stock';

    switch (packagingType) {
      case 'single': {
        const unitLabel = formatUnitLabel(item.unit, stock);
        return `${stock.toLocaleString()} ${unitLabel}`;
      }
      
      case 'sack':
      case 'bottle': {
        if (unitSize > 1) {
          const containers = stock / unitSize;
          const containerLabel = containers === 1 ? config.singularLabel : config.pluralLabel;
          const unitAbbrev = item.unit === 'litres' ? 'L' : item.unit === 'kg' ? 'kg' : item.unit;
          
          if (containers >= 1) {
            const containerDisplay = containers % 1 === 0 
              ? `${Math.floor(containers)}` 
              : containers.toFixed(1).replace(/\.0$/, '');
            return `${containerDisplay} ${containerLabel} (${stock.toLocaleString()}${unitAbbrev})`;
          }
        }
        const unitLabel = formatUnitLabel(item.unit, stock);
        return `${stock.toLocaleString()} ${unitLabel}`;
      }
      
      case 'box':
      case 'pack': {
        if (unitSize > 1) {
          const containers = stock / unitSize;
          const containerLabel = containers === 1 ? config.singularLabel : config.pluralLabel;
          const containerDisplay = containers % 1 === 0 
            ? `${Math.floor(containers)}` 
            : containers.toFixed(1).replace(/\.0$/, '');
          return `${stock.toLocaleString()} items (${containerDisplay} ${containerLabel})`;
        }
        return `${stock.toLocaleString()} items`;
      }
      
      default: {
        const unitLabel = formatUnitLabel(item.unit, stock);
        return `${stock.toLocaleString()} ${unitLabel}`;
      }
    }
  };

  const stockValue =
    typeof item.total_value === 'number'
      ? item.total_value
      : (item.current_stock || 0) * (item.average_cost || 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="fv-btn fv-btn--secondary flex items-center gap-2"
          onClick={() => navigate('/inventory')}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Inventory
        </button>
        
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="fv-btn fv-btn--primary flex items-center gap-2"
            onClick={() => setStockInOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Stock In
          </button>
          <button
            type="button"
            className="fv-btn fv-btn--secondary flex items-center gap-2"
            onClick={() => setUsageOpen(true)}
          >
            <Minus className="h-4 w-4" />
            Record Usage
          </button>
        </div>
      </div>

      <div className="fv-card p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className={`w-16 h-16 rounded-xl ${config.bgColor} flex items-center justify-center shrink-0`}>
            <Icon className={`w-8 h-8 ${config.color}`} strokeWidth={1.5} />
          </div>
          
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-foreground">{item.name}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {item.category_name ?? item.category} • {config.label}
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
                {item.min_stock_level != null && (
                  <p className="text-xs text-muted-foreground">
                    Min stock: {item.min_stock_level.toLocaleString()} {item.unit}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
          <div className={`rounded-xl ${config.bgColor} p-4`}>
            <p className="text-xs text-muted-foreground">Remaining Stock</p>
            <p className={`text-xl font-bold mt-1 ${stock <= 0 ? 'text-red-600' : config.color}`}>
              {getFarmerFriendlyStock()}
            </p>
          </div>
          <div className="rounded-xl bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">Unit Cost</p>
            <p className="text-xl font-bold mt-1 text-foreground">
              {formatCurrency(item.average_cost ?? null)}
            </p>
            <p className="text-xs text-muted-foreground">per {item.unit}</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">Stock Value</p>
            <p className="text-xl font-bold mt-1 text-foreground">
              {formatCurrency(stockValue)}
            </p>
          </div>
        </div>

        {unitSize > 1 && (
          <div className="mt-4 p-3 rounded-lg bg-muted/20 border border-border/50">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Packaging:</span>{' '}
              Each {config.singularLabel} contains {unitSize} {item.unit}
            </p>
          </div>
        )}
      </div>

      <div className="fv-card p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setHistoryView('usage')}
            className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              historyView === 'usage'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
            }`}
          >
            Usage
          </button>
          <button
            type="button"
            onClick={() => setHistoryView('transactions')}
            className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              historyView === 'transactions'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
            }`}
          >
            Transactions
          </button>
        </div>

        <div className="max-h-[340px] overflow-auto rounded-lg border border-border/60 bg-background p-2 sm:p-3">
          {historyView === 'usage' ? (
            <InventoryUsageTable usage={usage} isLoading={usageLoading} />
          ) : (
            <InventoryTransactionTimeline transactions={transactions} isLoading={txLoading} />
          )}
        </div>
      </div>

      <RecordStockInModal
        open={stockInOpen}
        onOpenChange={setStockInOpen}
        companyId={companyId ?? ''}
        item={item}
        suppliers={suppliers}
        onRecorded={handleRecorded}
      />

      <RecordUsageModal
        open={usageOpen}
        onOpenChange={setUsageOpen}
        companyId={companyId ?? ''}
        item={item}
        projects={activeProject ? [activeProject] : []}
        onRecorded={handleRecorded}
      />
    </div>
  );
}
