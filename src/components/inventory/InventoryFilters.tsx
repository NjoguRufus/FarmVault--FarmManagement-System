import React from 'react';
import { Search } from 'lucide-react';
import type { InventoryCategoryRow } from '@/services/inventoryReadModelService';
import type { Supplier } from '@/types';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

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
  return (
    <div className="fv-card p-3 sm:p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
      <div className="w-full md:max-w-sm relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9 fv-input"
          placeholder="Search by name, SKU, item code, supplier…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        <Select
          value={categoryId ?? 'all'}
          onValueChange={(val) => onCategoryChange(val === 'all' ? undefined : val)}
        >
          <SelectTrigger className="w-32 sm:w-40">
            <SelectValue placeholder="Category" />
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

        <Select
          value={supplierId ?? 'all'}
          onValueChange={(val) => onSupplierChange(val === 'all' ? undefined : val)}
        >
          <SelectTrigger className="w-32 sm:w-40">
            <SelectValue placeholder="Supplier" />
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

        <Select
          value={stockStatus}
          onValueChange={(val) => onStockStatusChange(val as 'all' | 'ok' | 'low' | 'out')}
        >
          <SelectTrigger className="w-28 sm:w-32">
            <SelectValue placeholder="Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stock</SelectItem>
            <SelectItem value="ok">In Stock</SelectItem>
            <SelectItem value="low">Low Stock</SelectItem>
            <SelectItem value="out">Out</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

