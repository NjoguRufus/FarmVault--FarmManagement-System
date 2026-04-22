import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getInventoryItemById,
  getInventoryMovementsForItem,
  getInventoryAuditLogs,
  type InventoryMovement,
  type InventoryAuditLog,
} from '@/services/inventoryService';
import { InventoryService } from '@/services/localData/InventoryService';
import type { InventoryItem } from '@/types';

export const INVENTORY_ITEMS_QUERY_KEY = 'inventoryItems:v2';
export const INVENTORY_ITEM_QUERY_KEY = 'inventoryItem:v2';
export const INVENTORY_MOVEMENTS_QUERY_KEY = 'inventoryMovements:v2';
export const INVENTORY_AUDIT_LOGS_QUERY_KEY = 'inventoryAuditLogs:v2';

export function useInventoryItems(companyId: string | null) {
  const queryClient = useQueryClient();
  const key = [INVENTORY_ITEMS_QUERY_KEY, companyId ?? 'none'] as const;

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (!companyId) return [];
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await InventoryService.pullRemote(companyId);
        } catch {
          // ignore
        }
      }
      return InventoryService.getInventoryItems(companyId);
    },
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  return {
    items: (data ?? []) as InventoryItem[],
    isLoading,
    error: error as Error | null,
    refetchAll: () =>
      queryClient.invalidateQueries({
        queryKey: [INVENTORY_ITEMS_QUERY_KEY],
      }),
  };
}

export function useInventoryItem(companyId: string | null, itemId: string | null) {
  const key = [INVENTORY_ITEM_QUERY_KEY, companyId ?? 'none', itemId ?? 'none'] as const;

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => getInventoryItemById(companyId!, itemId!),
    enabled: Boolean(companyId && itemId),
    staleTime: 30_000,
  });

  return {
    item: (data ?? null) as InventoryItem | null,
    isLoading,
    error: error as Error | null,
  };
}

export function useInventoryMovements(
  companyId: string | null,
  itemId: string | null,
  limit: number = 100,
) {
  const key = [
    INVENTORY_MOVEMENTS_QUERY_KEY,
    companyId ?? 'none',
    itemId ?? 'none',
    limit,
  ] as const;

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () =>
      getInventoryMovementsForItem({
        companyId: companyId!,
        itemId: itemId!,
        limit,
      }),
    enabled: Boolean(companyId && itemId),
    staleTime: 30_000,
  });

  return {
    movements: (data ?? []) as InventoryMovement[],
    isLoading,
    error: error as Error | null,
  };
}

export function useInventoryAuditLogs(
  companyId: string | null,
  itemId?: string | null,
  limit: number = 100,
) {
  const key = [
    INVENTORY_AUDIT_LOGS_QUERY_KEY,
    companyId ?? 'none',
    itemId ?? 'all',
    limit,
  ] as const;

  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () =>
      getInventoryAuditLogs({
        companyId: companyId!,
        itemId: itemId ?? undefined,
        limit,
      }),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  return {
    auditLogs: (data ?? []) as InventoryAuditLog[],
    isLoading,
    error: error as Error | null,
  };
}

