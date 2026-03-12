import React, { useState } from 'react';
import { 
  MoreHorizontal, 
  LayoutList, 
  LayoutGrid,
  Package, 
  Wheat, 
  Boxes, 
  Wine, 
  PackageOpen,
  Box,
  Plus,
  Minus,
  Eye
} from 'lucide-react';
import type { InventoryStockRow, PackagingType } from '@/services/inventoryReadModelService';
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

function getFarmerFriendlyStock(item: InventoryStockRow): { 
  display: string;
  packagingType: PackagingType;
} {
  const packagingType = item.packaging_type || getPackagingFromUnit(item.unit || 'pieces');
  const config = packagingConfig[packagingType];
  const stock = typeof item.current_stock === 'number' ? item.current_stock : 0;
  const unitSize = item.unit_size || 1;
  const unit = item.unit || 'pieces';

  if (stock <= 0) {
    return { 
      display: '0', 
      packagingType 
    };
  }

  switch (packagingType) {
    case 'single': {
      const unitLabel = formatUnitLabel(unit, stock);
      return { 
        display: `${stock.toLocaleString()} ${unitLabel}`,
        packagingType 
      };
    }
    
    case 'sack':
    case 'bottle': {
      if (unitSize > 1) {
        const containers = stock / unitSize;
        const fullContainers = Math.floor(containers);
        const containerLabel = fullContainers === 1 ? config.singularLabel : config.pluralLabel;
        const unitAbbrev = unit === 'litres' ? 'L' : unit === 'kg' ? 'kg' : unit;
        
        if (containers >= 1) {
          const containerDisplay = containers % 1 === 0 
            ? `${fullContainers}` 
            : containers.toFixed(1).replace(/\.0$/, '');
          return { 
            display: `${containerDisplay} ${containerLabel} (${stock.toLocaleString()}${unitAbbrev})`,
            packagingType 
          };
        }
      }
      const unitLabel = formatUnitLabel(unit, stock);
      return { 
        display: `${stock.toLocaleString()} ${unitLabel}`,
        packagingType 
      };
    }
    
    case 'box':
    case 'pack': {
      if (unitSize > 1) {
        const containers = stock / unitSize;
        const containerLabel = containers === 1 ? config.singularLabel : config.pluralLabel;
        const containerDisplay = containers % 1 === 0 
          ? `${Math.floor(containers)}` 
          : containers.toFixed(1).replace(/\.0$/, '');
        return { 
          display: `${stock.toLocaleString()} items (${containerDisplay} ${containerLabel})`,
          packagingType 
        };
      }
      return { 
        display: `${stock.toLocaleString()} items`,
        packagingType 
      };
    }
    
    default: {
      const unitLabel = formatUnitLabel(unit, stock);
      return { 
        display: `${stock.toLocaleString()} ${unitLabel}`,
        packagingType 
      };
    }
  }
}

function getCategoryEmoji(categoryName?: string | null): string {
  if (!categoryName) return '📦';
  const name = categoryName.toLowerCase();
  
  if (name.includes('fertilizer') || name.includes('fertiliser')) return '🧪';
  if (name.includes('chemical') || name.includes('pesticide') || name.includes('herbicide') || name.includes('fungicide')) return '🧴';
  if (name.includes('seed')) return '🌱';
  if (name.includes('fuel') || name.includes('diesel') || name.includes('petrol')) return '⛽';
  if (name.includes('feed') || name.includes('animal')) return '🐄';
  if (name.includes('tool') || name.includes('equipment')) return '🔧';
  if (name.includes('water') || name.includes('irrigation')) return '💧';
  if (name.includes('medicine') || name.includes('veterinary') || name.includes('vet')) return '💊';
  if (name.includes('harvest') || name.includes('produce')) return '🌾';
  if (name.includes('packaging') || name.includes('bag') || name.includes('sack')) return '🛍️';
  
  return '📦';
}

function getCategoryBgColor(categoryName?: string | null): string {
  if (!categoryName) return 'bg-gray-100';
  const name = categoryName.toLowerCase();
  
  if (name.includes('fertilizer') || name.includes('fertiliser')) return 'bg-emerald-50';
  if (name.includes('chemical') || name.includes('pesticide') || name.includes('herbicide') || name.includes('fungicide')) return 'bg-purple-50';
  if (name.includes('seed')) return 'bg-green-50';
  if (name.includes('fuel') || name.includes('diesel') || name.includes('petrol')) return 'bg-amber-50';
  if (name.includes('feed') || name.includes('animal')) return 'bg-orange-50';
  if (name.includes('tool') || name.includes('equipment')) return 'bg-slate-100';
  if (name.includes('water') || name.includes('irrigation')) return 'bg-blue-50';
  if (name.includes('medicine') || name.includes('veterinary') || name.includes('vet')) return 'bg-red-50';
  if (name.includes('harvest') || name.includes('produce')) return 'bg-yellow-50';
  if (name.includes('packaging') || name.includes('bag') || name.includes('sack')) return 'bg-stone-100';
  
  return 'bg-gray-100';
}

function ItemIcon({ item, size = 'md' }: { item: InventoryStockRow; size?: 'sm' | 'md' }) {
  const categoryName = item.category_name || item.category;
  const emoji = getCategoryEmoji(categoryName);
  const bgColor = getCategoryBgColor(categoryName);
  
  const sizeClasses = {
    sm: 'w-8 h-8 text-base',
    md: 'w-10 h-10 text-xl',
  };
  
  return (
    <div className={`${sizeClasses[size]} rounded-lg ${bgColor} flex items-center justify-center shrink-0`}>
      <span aria-hidden>{emoji}</span>
    </div>
  );
}

function ListView({ 
  items, 
  onViewDetails, 
  onRecordStockIn, 
  onRecordUsage 
}: Omit<InventoryTableProps, 'isLoading'>) {
  return (
    <div className="w-full bg-card rounded-xl border border-border/50 overflow-hidden">
      {/* Table Header */}
      <div className="grid grid-cols-[40px_1fr_80px_auto_36px] gap-2 px-3 py-2.5 bg-muted/40 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        <div></div>
        <div className="-ml-12">Name</div>
        <div className="-ml-12">Stock</div>
        <div>Status</div>
        <div></div>
      </div>
      
      {/* Table Rows */}
      <div>
        {items.map((item, index) => {
          const stockDisplay = getFarmerFriendlyStock(item);
          const stock = typeof item.current_stock === 'number' ? item.current_stock : 0;
          const isEven = index % 2 === 0;
          
          return (
            <div
              key={item.id}
              className={`grid grid-cols-[40px_1fr_80px_auto_36px] gap-2 items-center px-3 py-2.5 cursor-pointer hover:bg-primary/5 transition-colors border-b border-border/40 last:border-b-0 ${
                isEven ? 'bg-background' : 'bg-muted/20'
              }`}
              onClick={() => onViewDetails?.(item.id)}
            >
              {/* Icon - far left */}
              <div>
                <ItemIcon item={item} size="sm" />
              </div>
              
              {/* Name + Category stacked */}
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate text-sm leading-tight">{item.name}</p>
                <p className="text-[11px] text-muted-foreground truncate leading-tight">
                  {item.category_name || item.category}
                </p>
              </div>
              
              {/* Stock (no "remaining" text) */}
              <div>
                <p className={`text-sm font-medium ${stock <= 0 ? 'text-red-600' : 'text-foreground'}`}>
                  {stockDisplay.display}
                </p>
              </div>
              
              {/* Status - smaller badge */}
              <div>
                <LowStockBadge
                  status={item.stock_status ?? undefined}
                  current={stock}
                  min={item.min_stock_level ?? undefined}
                  size="sm"
                />
              </div>
              
              {/* Actions Menu */}
              <div onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger className="p-1 rounded-md hover:bg-muted focus:outline-none">
                    <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onViewDetails && (
                      <DropdownMenuItem onClick={() => onViewDetails(item.id)}>
                        <Eye className="h-4 w-4 mr-2" />
                        View details
                      </DropdownMenuItem>
                    )}
                    {onRecordStockIn && (
                      <DropdownMenuItem onClick={() => onRecordStockIn(item)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Stock in
                      </DropdownMenuItem>
                    )}
                    {onRecordUsage && (
                      <DropdownMenuItem onClick={() => onRecordUsage(item)}>
                        <Minus className="h-4 w-4 mr-2" />
                        Record usage
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardView({ 
  items, 
  onViewDetails, 
  onRecordStockIn, 
  onRecordUsage 
}: Omit<InventoryTableProps, 'isLoading'>) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {items.map((item) => {
        const stockDisplay = getFarmerFriendlyStock(item);
        const stock = typeof item.current_stock === 'number' ? item.current_stock : 0;
        
        return (
          <div
            key={item.id}
            className="bg-card rounded-xl border border-border/50 p-3 cursor-pointer hover:shadow-md hover:border-primary/20 transition-all"
            onClick={() => onViewDetails?.(item.id)}
          >
            {/* Row 1: Icon + Name + Category */}
            <div className="flex items-start gap-3 mb-3">
              <ItemIcon item={item} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate leading-tight" title={item.name}>
                  {item.name}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {item.category_name || item.category}
                </p>
              </div>
            </div>
            
            {/* Row 2: Stock + Status */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className={`text-sm font-medium ${stock <= 0 ? 'text-red-600' : 'text-foreground'}`}>
                {stockDisplay.display}
              </p>
              <LowStockBadge
                status={item.stock_status ?? undefined}
                current={stock}
                min={item.min_stock_level ?? undefined}
              />
            </div>
            
            {/* Row 3: Action Buttons */}
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              {onRecordStockIn && (
                <button
                  type="button"
                  className="flex-1 text-xs font-medium py-2 px-3 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 active:bg-green-200 transition-colors flex items-center justify-center gap-1.5"
                  onClick={() => onRecordStockIn(item)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Stock In
                </button>
              )}
              {onRecordUsage && (
                <button
                  type="button"
                  className="flex-1 text-xs font-medium py-2 px-3 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 active:bg-orange-200 transition-colors flex items-center justify-center gap-1.5"
                  onClick={() => onRecordUsage(item)}
                >
                  <Minus className="h-3.5 w-3.5" />
                  Use
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function InventoryTable({
  items,
  isLoading,
  onViewDetails,
  onRecordStockIn,
  onRecordUsage,
}: InventoryTableProps) {
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');

  if (isLoading) {
    return (
      <div className="p-8 text-sm text-muted-foreground text-center">
        Loading inventory…
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
          <Package className="w-7 h-7 text-muted-foreground" />
        </div>
        <p className="text-base font-medium text-foreground">No inventory items found</p>
        <p className="text-sm text-muted-foreground">
          Add your first item to start tracking stock.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </p>
        
        <div className="flex items-center gap-0.5 p-0.5 bg-muted/60 rounded-lg">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'list' 
                ? 'bg-background shadow-sm text-foreground' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="List view"
          >
            <LayoutList className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('card')}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === 'card' 
                ? 'bg-background shadow-sm text-foreground' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Card view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <ListView
          items={items}
          onViewDetails={onViewDetails}
          onRecordStockIn={onRecordStockIn}
          onRecordUsage={onRecordUsage}
        />
      ) : (
        <CardView
          items={items}
          onViewDetails={onViewDetails}
          onRecordStockIn={onRecordStockIn}
          onRecordUsage={onRecordUsage}
        />
      )}
    </div>
  );
}
