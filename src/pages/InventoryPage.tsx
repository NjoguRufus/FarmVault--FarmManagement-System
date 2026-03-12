import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useInventoryStock, useInventoryCategories } from '@/hooks/useInventoryReadModels';
import { useInventoryItems } from '@/hooks/useInventory';
import { listSuppliers } from '@/services/suppliersService';
import type { Supplier } from '@/types';
import { InventoryStatsCards } from '@/components/inventory/InventoryStatsCards';
import { InventoryFilters } from '@/components/inventory/InventoryFilters';
import { InventoryTable } from '@/components/inventory/InventoryTable';
import { AddInventoryItemModal } from '../components/inventory/AddInventoryItemModal';
import { RecordStockInModal } from '@/components/inventory/RecordStockInModal';
import { RecordUsageModal } from '@/components/inventory/RecordUsageModal';
import { useQuery } from '@tanstack/react-query';
import type { InventoryStockRow } from '@/services/inventoryReadModelService';

export default function InventoryPage() {
  const navigate = useNavigate();
  const { activeProject } = useProject();
  const { user } = useAuth();
  const { can } = usePermissions();
  const companyId = user?.companyId ?? null;
  const canAddInventoryItem = can('inventory', 'addItem');
  // Farmers start with "Add Item". Other actions are contextual (row/details).
  const canRestockInventory = can('inventory', 'restock');
  const canDeductInventory = can('inventory', 'deduct');

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [supplierId, setSupplierId] = useState<string | undefined>(undefined);
  const [stockStatus, setStockStatus] = useState<'all' | 'ok' | 'low' | 'out'>('all');

  const { categories, isLoading: categoriesLoading } = useInventoryCategories(companyId);
  const {
    data: suppliers = [],
    isLoading: suppliersLoading,
  } = useQuery<Supplier[]>({
    queryKey: ['suppliers', companyId ?? 'none'],
    queryFn: () => listSuppliers(companyId ?? ''),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const {
    items: stockItems,
    isLoading: stockLoading,
  } = useInventoryStock({
    companyId,
    search,
    categoryId,
    supplierId,
    stockStatus,
  });

  // Legacy items are used only as a fallback for stats until all data is migrated to Supabase.
  const { items: legacyItems } = useInventoryItems(companyId);

  const totalItems = stockItems.length || legacyItems.length;
  const lowStockCount = useMemo(
    () =>
      stockItems.filter(
        (i) =>
          (i.stock_status ?? '').toLowerCase() === 'low' ||
          (i.min_stock_level != null && i.current_stock < i.min_stock_level),
      ).length,
    [stockItems],
  );
  const outOfStockCount = useMemo(
    () =>
      stockItems.filter(
        (i) =>
          (i.stock_status ?? '').toLowerCase() === 'out' ||
          i.current_stock <= 0,
      ).length,
    [stockItems],
  );
  const totalInventoryValue = useMemo(
    () =>
      stockItems.reduce(
        (sum, i) =>
          sum +
          (typeof i.total_value === 'number'
            ? i.total_value
            : (i.current_stock || 0) * (i.average_cost || 0)),
        0,
      ),
    [stockItems],
  );

  const [addOpen, setAddOpen] = useState(false);
  const [stockInOpen, setStockInOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [selectedItemForStock, setSelectedItemForStock] = useState<InventoryStockRow | null>(
    null,
  );
  const [selectedItemForUsage, setSelectedItemForUsage] = useState<InventoryStockRow | null>(
    null,
  );

  const isLoading = stockLoading || categoriesLoading || suppliersLoading;

  const handleViewDetails = (itemId: string) => {
    navigate(`/inventory/item/${itemId}`);
  };

  // IMPORTANT for RLS: use the active auth company id only (no project fallback).
  const effectiveCompanyId = companyId;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track your farm inputs, current stock, and usage across projects.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="fv-btn fv-btn--primary"
            onClick={() => setAddOpen(true)}
            disabled={!canAddInventoryItem}
          >
            <Plus className="h-4 w-4" />
            Add Item
          </button>
        </div>
      </div>

      <InventoryStatsCards
        totalItems={totalItems}
        lowStockCount={lowStockCount}
        outOfStockCount={outOfStockCount}
        totalInventoryValue={totalInventoryValue}
      />

      <InventoryFilters
        search={search}
        onSearchChange={setSearch}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        supplierId={supplierId}
        onSupplierChange={setSupplierId}
        stockStatus={stockStatus}
        onStockStatusChange={setStockStatus}
        categories={categories}
        suppliers={suppliers}
      />

      <InventoryTable
        items={stockItems}
        isLoading={isLoading}
        onViewDetails={handleViewDetails}
        onRecordStockIn={(item) => {
          setSelectedItemForStock(item);
          setStockInOpen(true);
        }}
        onRecordUsage={(item) => {
          setSelectedItemForUsage(item);
          setUsageOpen(true);
        }}
      />

      {canAddInventoryItem && (
        <AddInventoryItemModal
          open={addOpen}
          onOpenChange={setAddOpen}
          companyId={effectiveCompanyId ?? ''}
          categories={categories}
          suppliers={suppliers}
          createdBy={user?.id}
        />
      )}

      <RecordStockInModal
        open={stockInOpen}
        onOpenChange={(open) => {
          if (!open) setSelectedItemForStock(null);
          setStockInOpen(open);
        }}
        companyId={effectiveCompanyId ?? ''}
        item={selectedItemForStock ?? stockItems[0] ?? null}
        suppliers={suppliers}
      />

      <RecordUsageModal
        open={usageOpen}
        onOpenChange={(open) => {
          if (!open) setSelectedItemForUsage(null);
          setUsageOpen(open);
        }}
        companyId={effectiveCompanyId ?? ''}
        item={selectedItemForUsage ?? stockItems[0] ?? null}
        projects={activeProject ? [activeProject] : []}
      />
    </div>
  );
}

