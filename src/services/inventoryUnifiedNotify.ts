import { enqueueUnifiedNotification } from '@/services/unifiedNotificationPipeline';
import type { InventoryItem } from '@/types';

/** Activity + optional low-stock insight (debounced with other unified notifications). */
export function notifyInventoryChangeUnified(item: InventoryItem): void {
  if (typeof window === 'undefined') return;

  enqueueUnifiedNotification({
    tier: 'activity',
    kind: 'activity_inventory_updated',
    title: 'Inventory updated',
    body: `${item.name} is now ${item.quantity} ${item.unit}.`,
    path: `/inventory/item/${item.id}`,
    toastType: 'success',
  });

  const q = item.quantity;
  const th = item.minThreshold ?? 10;
  if (q <= 0) {
    enqueueUnifiedNotification({
      tier: 'insights',
      kind: 'insight_low_inventory',
      title: 'Out of stock',
      body: `${item.name} needs restocking.`,
      path: '/inventory',
      toastType: 'warning',
    });
  } else if (q <= th) {
    enqueueUnifiedNotification({
      tier: 'insights',
      kind: 'insight_low_inventory',
      title: 'Low stock',
      body: `${item.name} is at ${q} ${item.unit} (threshold ${th}).`,
      path: '/inventory',
      toastType: 'warning',
    });
  }
}
