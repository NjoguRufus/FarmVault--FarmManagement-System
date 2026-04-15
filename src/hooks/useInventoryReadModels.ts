import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listInventoryStock,
  listLowStockItems,
  listInventoryTransactions,
  listInventoryUsage,
  listInventoryCategories,
  getInventoryItemStock,
  type InventoryStockRow,
  type InventoryTransactionRow,
  type InventoryUsageRow,
  type InventoryCategoryRow,
} from '@/services/inventoryReadModelService';
import { logger } from "@/lib/logger";

export const INVENTORY_STOCK_QUERY_KEY = 'inventoryStock:view';
export const INVENTORY_ITEM_STOCK_QUERY_KEY = 'inventoryItemStock:view';
export const INVENTORY_LOW_STOCK_QUERY_KEY = 'inventoryLowStock:view';
export const INVENTORY_TRANSACTIONS_QUERY_KEY = 'inventoryTransactions:view';
export const INVENTORY_USAGE_QUERY_KEY = 'inventoryUsage:view';
export const INVENTORY_CATEGORIES_QUERY_KEY = 'inventoryCategories:view';

export function useInventoryStock(params: {
  companyId: string | null;
  search?: string;
  categoryId?: string;
  supplierId?: string;
  stockStatus?: string;
}) {
  const queryClient = useQueryClient();
  const key = [
    INVENTORY_STOCK_QUERY_KEY,
    params.companyId ?? 'none',
    params.search ?? '',
    params.categoryId ?? 'all',
    params.supplierId ?? 'all',
    params.stockStatus ?? 'all',
  ] as const;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const result = await listInventoryStock({
        companyId: params.companyId!,
        search: params.search,
        categoryId: params.categoryId,
        supplierId: params.supplierId,
        stockStatus: (params.stockStatus as any) ?? 'all',
      });
      
      // DEBUG: Log raw stock data from view
      if (import.meta.env.DEV && result.length > 0) {
        // eslint-disable-next-line no-console
        logger.log('[useInventoryStock] Raw data from inventory_stock_view:', {
          itemCount: result.length,
          firstItem: result[0],
          stockFields: result.slice(0, 3).map(item => ({
            id: item.id,
            name: item.name,
            current_stock: item.current_stock,
            stock_status: item.stock_status,
            min_stock_level: item.min_stock_level,
            unit: item.unit,
          })),
        });
      }
      
      return result;
    },
    enabled: Boolean(params.companyId),
    staleTime: 30_000,
  });

  // DEBUG: Log when items change
  if (import.meta.env.DEV && data && data.length > 0) {
    // eslint-disable-next-line no-console
    logger.log('[useInventoryStock] Returning items:', {
      count: data.length,
      hasZeroStock: data.filter(i => i.current_stock === 0).length,
      hasOutStatus: data.filter(i => i.stock_status === 'out').length,
    });
  }

  return {
    items: (data ?? []) as InventoryStockRow[],
    isLoading,
    error: error as Error | null,
    refetch,
    invalidateAll: () =>
      queryClient.invalidateQueries({
        queryKey: [INVENTORY_STOCK_QUERY_KEY],
      }),
  };
}

export function useInventoryItemStock(companyId: string | null, itemId: string | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [INVENTORY_ITEM_STOCK_QUERY_KEY, companyId ?? 'none', itemId ?? 'none'],
    queryFn: () => getInventoryItemStock({ companyId: companyId!, itemId: itemId! }),
    enabled: Boolean(companyId && itemId),
    staleTime: 30_000,
  });

  return {
    item: (data ?? null) as InventoryStockRow | null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}

export function useLowStockInventory(companyId: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: [INVENTORY_LOW_STOCK_QUERY_KEY, companyId ?? 'none'],
    queryFn: () => listLowStockItems(companyId!),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });

  return {
    items: (data ?? []) as InventoryStockRow[],
    isLoading,
    error: error as Error | null,
  };
}

export function useInventoryTransactions(companyId: string | null, itemId: string | null, limit: number = 100) {
  const { data, isLoading, error } = useQuery({
    queryKey: [INVENTORY_TRANSACTIONS_QUERY_KEY, companyId ?? 'none', itemId ?? 'none', limit],
    queryFn: () =>
      listInventoryTransactions({
        companyId: companyId!,
        itemId: itemId!,
        limit,
      }),
    enabled: Boolean(companyId && itemId),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });

  return {
    transactions: (data ?? []) as InventoryTransactionRow[],
    isLoading,
    error: error as Error | null,
  };
}

export function useInventoryUsage(companyId: string | null, itemId: string | null, limit: number = 100) {
  const { data, isLoading, error } = useQuery({
    queryKey: [INVENTORY_USAGE_QUERY_KEY, companyId ?? 'none', itemId ?? 'none', limit],
    queryFn: () =>
      listInventoryUsage({
        companyId: companyId!,
        itemId: itemId!,
        limit,
      }),
    enabled: Boolean(companyId && itemId),
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });

  return {
    usage: (data ?? []) as InventoryUsageRow[],
    isLoading,
    error: error as Error | null,
  };
}

export function useInventoryCategories(companyId: string | null) {
  const { data, isLoading, error } = useQuery({
    queryKey: [INVENTORY_CATEGORIES_QUERY_KEY, companyId ?? 'none'],
    queryFn: () => listInventoryCategories(companyId!),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  return {
    categories: (data ?? []) as InventoryCategoryRow[],
    isLoading,
    error: error as Error | null,
  };
}

