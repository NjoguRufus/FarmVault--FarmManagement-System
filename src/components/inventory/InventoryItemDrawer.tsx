import React, { useState, useEffect, useMemo } from 'react';
import { 
  Package, 
  Wheat, 
  Boxes, 
  Wine, 
  PackageOpen,
  Box,
  Plus,
  Minus,
  Save,
  Loader2,
  StickyNote
} from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useInventoryTransactions, useInventoryUsage } from '@/hooks/useInventoryReadModels';
import { InventoryTransactionTimeline } from './InventoryTransactionTimeline';
import { InventoryUsageTable } from './InventoryUsageTable';
import { LowStockBadge } from './LowStockBadge';
import { db } from '@/lib/db';
import { toast } from 'sonner';
import type { InventoryStockRow, PackagingType } from '@/services/inventoryReadModelService';

const BOTTOM_NAV_HEIGHT = 90;

interface InventoryItemDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryStockRow | null;
  onRecordStockIn?: () => void;
  onRecordUsage?: () => void;
  onNotesUpdated?: () => void;
}

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
  const u = (unit || '').toLowerCase();
  if (u.includes('sack') || u.includes('bag')) return 'sack';
  if (u.includes('box') || u.includes('carton')) return 'box';
  if (u.includes('bottle') || u.includes('container') || u.includes('litre') || u.includes('liter') || u === 'ml' || u === 'l') return 'bottle';
  if (u.includes('pack') || u.includes('bundle')) return 'pack';
  if (u === 'pieces' || u === 'piece' || u === 'pcs' || u === 'units' || u === 'items') return 'single';
  return 'other';
}

function formatUnitLabel(unit: string, value: number): string {
  const u = (unit || '').toLowerCase();
  if (u === 'litres' || u === 'litre') return value === 1 ? 'litre' : 'litres';
  if (u === 'pieces' || u === 'piece') return value === 1 ? 'piece' : 'pieces';
  if (u === 'metres' || u === 'meter' || u === 'meters') return value === 1 ? 'meter' : 'meters';
  return unit || 'units';
}

export function InventoryItemDrawer({
  open,
  onOpenChange,
  item,
  onRecordStockIn,
  onRecordUsage,
  onNotesUpdated,
}: InventoryItemDrawerProps) {
  const { user } = useAuth();
  const companyId = user?.companyId ?? null;
  
  const { transactions, isLoading: txLoading } = useInventoryTransactions(
    companyId, 
    item?.id ?? null, 
    30
  );
  const { usage, isLoading: usageLoading } = useInventoryUsage(
    companyId, 
    item?.id ?? null, 
    30
  );

  const [farmNotes, setFarmNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesChanged, setNotesChanged] = useState(false);

  useEffect(() => {
    if (item) {
      const notes = item.farm_usage_notes || item.description || '';
      setFarmNotes(notes);
      setNotesChanged(false);
    }
  }, [item]);

  const handleNotesChange = (value: string) => {
    setFarmNotes(value);
    setNotesChanged(value !== (item?.farm_usage_notes || item?.description || ''));
  };

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const drawerStyle = useMemo(() => {
    if (!isMobile) return undefined;
    return {
      bottom: `${BOTTOM_NAV_HEIGHT}px`,
      maxHeight: `calc(100vh - ${BOTTOM_NAV_HEIGHT + 30}px)`,
    };
  }, [isMobile]);

  const handleSaveNotes = async () => {
    if (!item || !companyId) return;
    
    setSavingNotes(true);
    try {
      const { error } = await db.public()
        .from('inventory_item_master')
        .update({ description: farmNotes })
        .eq('id', item.id);

      if (error) throw error;

      toast.success('Notes saved');
      setNotesChanged(false);
      onNotesUpdated?.();
    } catch (err: any) {
      console.error('[InventoryItemDrawer] Save notes error', err);
      toast.error(err?.message || 'Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  if (!item) return null;

  const packagingType = item.packaging_type || getPackagingFromUnit(item.unit);
  const config = packagingConfig[packagingType];
  const Icon = config.icon;
  const unitSize = item.unit_size || 1;
  const stock = typeof item.current_stock === 'number' ? item.current_stock : 0;

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
      : stock * (item.average_cost || 0);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent 
        className="max-h-[85vh]"
        style={drawerStyle}
      >
        <DrawerHeader className="border-b border-border pb-4">
          <div className="flex items-start gap-3">
            <div className={`w-12 h-12 rounded-xl ${config.bgColor} flex items-center justify-center shrink-0`}>
              <Icon className={`w-6 h-6 ${config.color}`} strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <DrawerTitle className="text-left text-lg">{item.name}</DrawerTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {item.category_name ?? item.category} • {config.label}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <LowStockBadge
                  status={item.stock_status ?? undefined}
                  current={stock}
                  min={item.min_stock_level ?? undefined}
                  size="sm"
                />
                <span className={`text-sm font-semibold ${stock <= 0 ? 'text-red-600' : 'text-foreground'}`}>
                  {getFarmerFriendlyStock()}
                </span>
              </div>
            </div>
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <Tabs defaultValue="summary" className="w-full">
            <TabsList className="w-full grid grid-cols-3 mb-4">
              <TabsTrigger value="summary" className="text-xs sm:text-sm">Summary</TabsTrigger>
              <TabsTrigger value="history" className="text-xs sm:text-sm">History</TabsTrigger>
              <TabsTrigger value="notes" className="text-xs sm:text-sm">Notes</TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="space-y-4 mt-0">
              {/* Stock Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-xl ${config.bgColor} p-3`}>
                  <p className="text-xs text-muted-foreground">Remaining Stock</p>
                  <p className={`text-lg font-bold mt-1 ${stock <= 0 ? 'text-red-600' : config.color}`}>
                    {getFarmerFriendlyStock()}
                  </p>
                </div>
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Unit Cost</p>
                  <p className="text-lg font-bold mt-1 text-foreground">
                    {formatCurrency(item.average_cost ?? null)}
                  </p>
                  <p className="text-xs text-muted-foreground">per {item.unit}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-muted/40 p-3">
                  <p className="text-xs text-muted-foreground">Total Value</p>
                  <p className="text-lg font-bold mt-1 text-foreground">
                    {formatCurrency(stockValue)}
                  </p>
                </div>
                {item.min_stock_level != null && (
                  <div className="rounded-xl bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Min Stock Level</p>
                    <p className="text-lg font-bold mt-1 text-foreground">
                      {item.min_stock_level.toLocaleString()} {item.unit}
                    </p>
                  </div>
                )}
              </div>

              {unitSize > 1 && (
                <div className="p-3 rounded-lg bg-muted/20 border border-border/50">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Packaging:</span>{' '}
                    Each {config.singularLabel} contains {unitSize} {item.unit}
                  </p>
                </div>
              )}

              {item.supplier_name && (
                <div className="p-3 rounded-lg bg-muted/20 border border-border/50">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Supplier:</span>{' '}
                    {item.supplier_name}
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-4 mt-0">
              {/* Transaction Timeline */}
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  Transaction Timeline
                </h4>
                <div className="max-h-[200px] overflow-y-auto border border-border/50 rounded-lg p-2">
                  <InventoryTransactionTimeline
                    transactions={transactions}
                    isLoading={txLoading}
                  />
                </div>
              </div>

              {/* Usage History */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Usage History</h4>
                <div className="max-h-[200px] overflow-y-auto border border-border/50 rounded-lg p-2">
                  <InventoryUsageTable usage={usage} isLoading={usageLoading} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="notes" className="space-y-4 mt-0">
              {/* Farm Usage Notes */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <StickyNote className="h-4 w-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">What this item is used for</h4>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Add notes about how you use this item on your farm. Examples: "used to treat fungal infection", "basal fertilizer for planting", "tractor fuel"
                </p>
                <Textarea
                  value={farmNotes}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  placeholder="e.g., Used during flowering stage for pest control..."
                  className="min-h-[120px] resize-none"
                />
                {notesChanged && (
                  <button
                    type="button"
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="mt-3 fv-btn fv-btn--primary w-full flex items-center justify-center gap-2"
                  >
                    {savingNotes ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Save Notes
                      </>
                    )}
                  </button>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DrawerFooter className="border-t border-border pt-4">
          <div className="flex gap-2 w-full">
            {onRecordStockIn && (
              <button
                type="button"
                className="flex-1 fv-btn fv-btn--primary flex items-center justify-center gap-2"
                onClick={() => {
                  onOpenChange(false);
                  onRecordStockIn();
                }}
              >
                <Plus className="h-4 w-4" />
                Stock In
              </button>
            )}
            {onRecordUsage && (
              <button
                type="button"
                className="flex-1 fv-btn fv-btn--secondary flex items-center justify-center gap-2"
                onClick={() => {
                  onOpenChange(false);
                  onRecordUsage();
                }}
              >
                <Minus className="h-4 w-4" />
                Record Usage
              </button>
            )}
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
