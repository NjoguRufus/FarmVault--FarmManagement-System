import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import {
  listInventoryAuditLogs,
  deductInventoryStock,
  archiveInventoryItem,
  restoreInventoryItem,
  logInventoryAuditEvent,
  type InventoryAuditLogRow,
  type DeductStockInput,
  type ArchiveInventoryItemInput,
  type RestoreInventoryItemInput,
} from '@/services/inventoryReadModelService';
import type { AuditLogEntry, AuditAction } from '@/components/inventory/InventoryAuditModal';

export const INVENTORY_AUDIT_LOGS_QUERY_KEY = 'inventoryAuditLogs:view';

// Map database action_type to UI AuditAction
const actionTypeToAuditAction: Record<string, AuditAction> = {
  'ITEM_CREATED': 'ADD_ITEM',
  'ITEM_EDITED': 'EDIT_ITEM',
  'STOCK_IN': 'STOCK_IN',
  'STOCK_DEDUCTED': 'DEDUCT',
  'USAGE_RECORDED': 'USAGE',
  'ITEM_ARCHIVED': 'ARCHIVE',
  'ITEM_RESTORED': 'RESTORE',
  'ITEM_DELETED': 'DELETE',
  // Legacy mappings (in case old data exists)
  'ADD_ITEM': 'ADD_ITEM',
  'EDIT_ITEM': 'EDIT_ITEM',
  'RESTOCK': 'RESTOCK',
  'DEDUCT': 'DEDUCT',
  'USAGE': 'USAGE',
  'ARCHIVE': 'ARCHIVE',
  'RESTORE': 'RESTORE',
  'DELETE': 'DELETE',
};

function mapAuditLogRowToEntry(row: InventoryAuditLogRow): AuditLogEntry {
  // Map action_type from new schema to AuditAction for UI
  const actionType = row.action_type || (row as any).action || 'STATUS_CHANGE';
  const action = actionTypeToAuditAction[actionType] || (actionType as AuditAction);
  const metadata = row.metadata || {};
  
  return {
    id: row.id,
    action,
    itemId: row.inventory_item_id ?? undefined,
    itemName: row.item_name ?? (metadata.name as string) ?? (metadata.itemName as string) ?? undefined,
    quantity: row.quantity != null ? Number(row.quantity) : (metadata.quantity as number) ?? undefined,
    actorId: row.actor_user_id ?? (row as any).created_by ?? undefined,
    actorName: row.actor_name ?? (row as any).created_by_name ?? (metadata.actorName as string) ?? undefined,
    timestamp: row.created_at,
    notes: row.notes ?? (metadata.reason as string) ?? (metadata.notes as string) ?? undefined,
    metadata,
    isArchived: action === 'ARCHIVE' || action === 'DELETE',
  };
}

export function useInventoryAuditLogs(
  companyId: string | null,
  itemId?: string | null,
  limit: number = 100
) {
  const queryClient = useQueryClient();
  const key = [
    INVENTORY_AUDIT_LOGS_QUERY_KEY,
    companyId ?? 'none',
    itemId ?? 'all',
    limit,
  ] as const;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: key,
    queryFn: () =>
      listInventoryAuditLogs({
        companyId: companyId!,
        itemId: itemId ?? undefined,
        limit,
      }),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  const auditLogs: AuditLogEntry[] = (data ?? []).map(mapAuditLogRowToEntry);

  return {
    auditLogs,
    rawLogs: (data ?? []) as InventoryAuditLogRow[],
    isLoading,
    error: error as Error | null,
    refetch,
    invalidateAll: () =>
      queryClient.invalidateQueries({
        queryKey: [INVENTORY_AUDIT_LOGS_QUERY_KEY],
      }),
  };
}

interface UseInventoryActionsOptions {
  companyId: string | null;
  onSuccess?: () => void;
}

export function useInventoryActions({ companyId, onSuccess }: UseInventoryActionsOptions) {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const queryClient = useQueryClient();

  const invalidateQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['inventoryStock:view'] });
    queryClient.invalidateQueries({ queryKey: [INVENTORY_AUDIT_LOGS_QUERY_KEY] });
    onSuccess?.();
  };

  const deductMutation = useMutation({
    mutationFn: async (params: Omit<DeductStockInput, 'companyId' | 'actorUserId' | 'actorName'> & { itemName?: string; unit?: string }) => {
      if (!companyId) throw new Error('Company ID is required');
      
      await deductInventoryStock({
        ...params,
        companyId,
        actorUserId: user?.id,
        actorName: user?.name ?? user?.email,
      });

      await logInventoryAuditEvent({
        companyId,
        action: 'STOCK_DEDUCTED',
        inventoryItemId: params.itemId,
        itemName: params.itemName,
        quantity: params.quantity,
        unit: params.unit,
        actorUserId: user?.id,
        actorName: user?.name ?? user?.email,
        actorRole: user?.role,
        notes: params.reason,
        metadata: { reason: params.reason },
      });

      addNotification({
        title: 'Stock Deducted',
        message: `${user?.name ?? 'User'} deducted ${params.quantity} units from ${params.itemName ?? 'item'}`,
        type: 'warning',
      });
    },
    onSuccess: invalidateQueries,
  });

  const archiveMutation = useMutation({
    mutationFn: async (params: Omit<ArchiveInventoryItemInput, 'companyId' | 'actorUserId' | 'actorName'> & { itemName?: string }) => {
      if (!companyId) throw new Error('Company ID is required');
      
      await archiveInventoryItem({
        ...params,
        companyId,
        actorUserId: user?.id,
        actorName: user?.name ?? user?.email,
      });

      await logInventoryAuditEvent({
        companyId,
        action: 'ITEM_ARCHIVED',
        inventoryItemId: params.itemId,
        itemName: params.itemName,
        actorUserId: user?.id,
        actorName: user?.name ?? user?.email,
        actorRole: user?.role,
        notes: 'Item archived (soft delete)',
        metadata: { archived: true },
      });

      addNotification({
        title: 'Item Archived',
        message: `${user?.name ?? 'User'} archived ${params.itemName ?? 'inventory item'}`,
        type: 'error',
      });
    },
    onSuccess: invalidateQueries,
  });

  const restoreMutation = useMutation({
    mutationFn: async (params: Omit<RestoreInventoryItemInput, 'companyId' | 'actorUserId' | 'actorName'> & { itemName?: string }) => {
      if (!companyId) throw new Error('Company ID is required');
      
      await restoreInventoryItem({
        ...params,
        companyId,
        actorUserId: user?.id,
        actorName: user?.name ?? user?.email,
      });

      await logInventoryAuditEvent({
        companyId,
        action: 'ITEM_RESTORED',
        inventoryItemId: params.itemId,
        itemName: params.itemName,
        actorUserId: user?.id,
        actorName: user?.name ?? user?.email,
        actorRole: user?.role,
        notes: 'Item restored from archive',
        metadata: { restored: true },
      });

      addNotification({
        title: 'Item Restored',
        message: `${user?.name ?? 'User'} restored ${params.itemName ?? 'inventory item'}`,
        type: 'success',
      });
    },
    onSuccess: invalidateQueries,
  });

  return {
    deductStock: deductMutation.mutateAsync,
    isDeducting: deductMutation.isPending,
    
    archiveItem: archiveMutation.mutateAsync,
    isArchiving: archiveMutation.isPending,
    
    restoreItem: restoreMutation.mutateAsync,
    isRestoring: restoreMutation.isPending,
  };
}

export function useInventoryNotifications() {
  const { user } = useAuth();
  const { addNotification } = useNotifications();

  const notifyStockAdded = (itemName: string, quantity: number) => {
    addNotification({
      title: 'Stock Added',
      message: `${user?.name ?? 'User'} added ${quantity} units to ${itemName}`,
      type: 'success',
    });
  };

  const notifyItemCreated = (itemName: string) => {
    addNotification({
      title: 'Item Created',
      message: `${user?.name ?? 'User'} created new inventory item: ${itemName}`,
      type: 'success',
    });
  };

  const notifyItemUpdated = (itemName: string) => {
    addNotification({
      title: 'Item Updated',
      message: `${user?.name ?? 'User'} updated ${itemName}`,
      type: 'info',
    });
  };

  const notifyUsageRecorded = (itemName: string, quantity: number) => {
    addNotification({
      title: 'Usage Recorded',
      message: `${user?.name ?? 'User'} recorded usage of ${quantity} units from ${itemName}`,
      type: 'warning',
    });
  };

  return {
    notifyStockAdded,
    notifyItemCreated,
    notifyItemUpdated,
    notifyUsageRecorded,
  };
}
