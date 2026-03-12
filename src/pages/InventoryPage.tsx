import React, { useMemo, useState } from 'react';
import { Plus, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useProject } from '@/contexts/ProjectContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useInventoryStock, useInventoryCategories } from '@/hooks/useInventoryReadModels';
import { useInventoryItems } from '@/hooks/useInventory';
import { useInventoryAuditLogs, useInventoryActions, useInventoryNotifications } from '@/hooks/useInventoryAudit';
import { listSuppliers } from '@/services/suppliersService';
import type { Supplier } from '@/types';
import { InventoryStatsCards } from '@/components/inventory/InventoryStatsCards';
import { InventoryFilters } from '@/components/inventory/InventoryFilters';
import { InventoryTable } from '@/components/inventory/InventoryTable';
import { AddInventoryItemModal } from '../components/inventory/AddInventoryItemModal';
import { RecordStockInModal } from '@/components/inventory/RecordStockInModal';
import { RecordUsageModal } from '@/components/inventory/RecordUsageModal';
import { InventoryAuditDrawer } from '@/components/inventory/InventoryAuditDrawer';
import { DeductStockModal } from '@/components/inventory/DeductStockModal';
import { ArchiveConfirmDialog } from '@/components/inventory/ArchiveConfirmDialog';
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

  const { categories: allCategories, isLoading: categoriesLoading } = useInventoryCategories(companyId);
  const {
    data: allSuppliers = [],
    isLoading: suppliersLoading,
  } = useQuery<Supplier[]>({
    queryKey: ['suppliers', companyId ?? 'none'],
    queryFn: () => listSuppliers(companyId ?? ''),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  // Get ALL items (unfiltered) to derive available filter options
  const {
    items: allStockItems,
    isLoading: allStockLoading,
  } = useInventoryStock({
    companyId,
  });

  // Get filtered items based on current filter selections
  const {
    items: stockItems,
    isLoading: stockLoading,
    refetch: refetchStock,
    invalidateAll: invalidateStockQueries,
  } = useInventoryStock({
    companyId,
    search,
    categoryId,
    supplierId,
    stockStatus,
  });

  // Derive categories that actually have items
  const categoriesWithItems = useMemo(() => {
    const categoryIds = new Set(allStockItems.map(item => item.category).filter(Boolean));
    return allCategories.filter(cat => categoryIds.has(cat.id));
  }, [allStockItems, allCategories]);

  // Derive suppliers that actually have items
  const suppliersWithItems = useMemo(() => {
    const supplierIds = new Set(allStockItems.map(item => item.supplier_id).filter(Boolean));
    return allSuppliers.filter(s => supplierIds.has(s.id));
  }, [allStockItems, allSuppliers]);

  const handleInventoryChange = () => {
    refetchStock();
    invalidateStockQueries();
    refetchAudit();
  };

  const handleDeductStock = async (params: {
    companyId: string;
    itemId: string;
    quantity: number;
    reason?: string;
  }) => {
    const item = stockItems.find(i => i.id === params.itemId);
    await deductStock({
      itemId: params.itemId,
      quantity: params.quantity,
      reason: params.reason,
      itemName: item?.name,
    });
  };

  const handleArchiveItem = async (params: {
    companyId: string;
    itemId: string;
  }) => {
    const item = stockItems.find(i => i.id === params.itemId);
    await archiveItem({
      itemId: params.itemId,
      itemName: item?.name,
    });
  };

  const handleRestoreItem = async (itemId: string, itemName: string) => {
    try {
      await restoreItem({ itemId, itemName });
      toast.success(`${itemName} has been restored`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore item';
      toast.error(message);
    }
  };

  // Legacy items are used only as a fallback for stats until all data is migrated to Supabase.
  const { items: legacyItems } = useInventoryItems(companyId);

  const totalItems = stockItems.length || legacyItems.length;

  const parseNumeric = (value: unknown): number => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : NaN;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return NaN;
      const normalized = trimmed.replace(/,/g, '');
      const num = Number(normalized);
      return Number.isFinite(num) ? num : NaN;
    }
    return NaN;
  };
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
      stockItems.reduce((sum, i) => {
        const unitCost = parseNumeric(i.average_cost as any);
        if (!Number.isFinite(unitCost)) {
          return sum;
        }
        return sum + unitCost;
      }, 0),
    [stockItems],
  );

  const [addOpen, setAddOpen] = useState(false);
  const [stockInOpen, setStockInOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [deductOpen, setDeductOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [selectedItemForStock, setSelectedItemForStock] = useState<InventoryStockRow | null>(
    null,
  );
  const [selectedItemForUsage, setSelectedItemForUsage] = useState<InventoryStockRow | null>(
    null,
  );
  const [selectedItemForDeduct, setSelectedItemForDeduct] = useState<InventoryStockRow | null>(
    null,
  );
  const [selectedItemForArchive, setSelectedItemForArchive] = useState<InventoryStockRow | null>(
    null,
  );

  const { auditLogs, isLoading: auditLoading, refetch: refetchAudit } = useInventoryAuditLogs(companyId, null, 100);
  const { deductStock, archiveItem, restoreItem } = useInventoryActions({
    companyId,
    onSuccess: handleInventoryChange,
  });
  const { notifyUsageRecorded } = useInventoryNotifications();

  const isLoading = stockLoading || categoriesLoading || suppliersLoading || allStockLoading;

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
        <div className="flex flex-wrap items-center justify-between w-full sm:w-auto sm:justify-end gap-2">
          <button
            type="button"
            className="fv-btn fv-btn--primary"
            onClick={() => setAddOpen(true)}
            disabled={!canAddInventoryItem}
          >
            <Plus className="h-4 w-4" />
            Add Item
          </button>
          <button
            type="button"
            className="fv-btn fv-btn--outline"
            onClick={() => setAuditOpen(true)}
          >
            <FileText className="h-4 w-4" />
            Inventory Audit
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
        categories={categoriesWithItems}
        suppliers={suppliersWithItems}
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
        onEditItem={(item) => {
          navigate(`/inventory/item/${item.id}`);
        }}
        onDeductStock={(item) => {
          setSelectedItemForDeduct(item);
          setDeductOpen(true);
        }}
        onArchiveItem={(item) => {
          setSelectedItemForArchive(item);
          setArchiveOpen(true);
        }}
      />

      {canAddInventoryItem && (
        <AddInventoryItemModal
          open={addOpen}
          onOpenChange={setAddOpen}
          companyId={effectiveCompanyId ?? ''}
          categories={allCategories}
          suppliers={allSuppliers}
          createdBy={user?.id}
          onCreated={handleInventoryChange}
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
        suppliers={allSuppliers}
        onRecorded={handleInventoryChange}
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
        onRecorded={() => {
          handleInventoryChange();
          if (selectedItemForUsage) {
            notifyUsageRecorded(selectedItemForUsage.name, 0);
          }
        }}
      />

      <InventoryAuditDrawer
        open={auditOpen}
        onOpenChange={setAuditOpen}
        auditLogs={auditLogs}
        isLoading={auditLoading}
        onRestoreItem={handleRestoreItem}
        canRestore={can('inventory', 'addItem')}
      />

      <DeductStockModal
        open={deductOpen}
        onOpenChange={(open) => {
          if (!open) setSelectedItemForDeduct(null);
          setDeductOpen(open);
        }}
        item={selectedItemForDeduct}
        companyId={effectiveCompanyId ?? ''}
        onDeducted={handleInventoryChange}
        onDeduct={handleDeductStock}
      />

      <ArchiveConfirmDialog
        open={archiveOpen}
        onOpenChange={(open) => {
          if (!open) setSelectedItemForArchive(null);
          setArchiveOpen(open);
        }}
        item={selectedItemForArchive}
        companyId={effectiveCompanyId ?? ''}
        onArchived={handleInventoryChange}
        onArchive={handleArchiveItem}
      />
    </div>
  );
}

