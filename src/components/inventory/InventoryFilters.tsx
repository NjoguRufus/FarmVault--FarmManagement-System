import React, { useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import type { InventoryCategoryRow } from '@/services/inventoryReadModelService';
import type { Supplier } from '@/types';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface InventoryFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  categoryId?: string;
  onCategoryChange: (value: string | undefined) => void;
  supplierId?: string;
  onSupplierChange: (value: string | undefined) => void;
  stockStatus: 'all' | 'ok' | 'low' | 'out';
  onStockStatusChange: (value: 'all' | 'ok' | 'low' | 'out') => void;
  categories: InventoryCategoryRow[];
  suppliers: Supplier[];
}

export function InventoryFilters({
  search,
  onSearchChange,
  categoryId,
  onCategoryChange,
  supplierId,
  onSupplierChange,
  stockStatus,
  onStockStatusChange,
  categories,
  suppliers,
}: InventoryFiltersProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  
  const activeFilterCount = [
    categoryId,
    supplierId,
    stockStatus !== 'all' ? stockStatus : undefined,
  ].filter(Boolean).length;

  const clearFilters = () => {
    onCategoryChange(undefined);
    onSupplierChange(undefined);
    onStockStatusChange('all');
  };

  return (
    <div className="flex items-center gap-2">
      {/* Search Input */}
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 h-9 text-sm"
          placeholder="Search items..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {/* Filter Button with Popover */}
      <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`h-9 px-3 rounded-lg border flex items-center gap-1.5 text-sm transition-colors ${
              activeFilterCount > 0
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-background border-border hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && (
              <span className="bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-sm">Filters</span>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="h-3 w-3" />
                Clear all
              </button>
            )}
          </div>
          
          <div className="space-y-3">
            {/* Category Filter */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Category</label>
              <Select
                value={categoryId ?? 'all'}
                onValueChange={(val) => onCategoryChange(val === 'all' ? undefined : val)}
              >
                <SelectTrigger className="w-full h-9 text-sm">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Supplier Filter */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Supplier</label>
              <Select
                value={supplierId ?? 'all'}
                onValueChange={(val) => onSupplierChange(val === 'all' ? undefined : val)}
              >
                <SelectTrigger className="w-full h-9 text-sm">
                  <SelectValue placeholder="All Suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Stock Status Filter */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Stock Status</label>
              <Select
                value={stockStatus}
                onValueChange={(val) => onStockStatusChange(val as 'all' | 'ok' | 'low' | 'out')}
              >
                <SelectTrigger className="w-full h-9 text-sm">
                  <SelectValue placeholder="All Stock" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stock</SelectItem>
                  <SelectItem value="ok">In Stock</SelectItem>
                  <SelectItem value="low">Low Stock</SelectItem>
                  <SelectItem value="out">Out of Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
