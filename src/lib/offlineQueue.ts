/**
 * Offline harvest queue: IndexedDB via Dexie.
 * Stores intake, payment, and wallet entries when offline or when Supabase fails;
 * syncQueue() replays to Supabase. Duplicate protection via client_entry_id (local UUID)
 * and created_by in payload; Supabase inserts use client_entry_id where supported.
 */
import Dexie, { type Table } from 'dexie';

export type OfflineQueueType = 'intake' | 'payment' | 'wallet_entry';

export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface OfflineQueueItem {
  id: string;
  type: OfflineQueueType;
  payload: Record<string, unknown>;
  created_at: number;
  created_by?: string | null;
  synced: boolean;
  sync_status?: SyncStatus;
}

const DB_NAME = 'farmvault_offline';
const QUEUE_TABLE = 'offline_queue';
const QUEUE_CHANGE_EVENT = 'farmvault:offline-queue-changed';

let syncing = false;

function notifyChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(QUEUE_CHANGE_EVENT));
  }
}

class FarmVaultOfflineDB extends Dexie {
  offline_queue!: Table<OfflineQueueItem, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      [QUEUE_TABLE]: 'id, type, created_at, synced',
    });
    this.version(2).stores({
      [QUEUE_TABLE]: 'id, type, created_at, synced, sync_status',
    });
  }
}

const db = new FarmVaultOfflineDB();

export function getOfflineDB(): FarmVaultOfflineDB {
  return db;
}

/** Add an item to the queue (offline or after failed write). Includes local UUID and created_by for duplicate protection. */
export async function addToOfflineQueue(
  type: OfflineQueueType,
  payload: Record<string, unknown>,
  options?: { createdBy?: string | null }
): Promise<string> {
  const id = (payload.client_entry_id as string) || crypto.randomUUID();
  const createdBy = options?.createdBy ?? (payload.created_by as string | undefined) ?? null;
  const item: OfflineQueueItem = {
    id,
    type,
    payload: { ...payload, client_entry_id: id, created_by: createdBy },
    created_at: Date.now(),
    created_by: createdBy ?? undefined,
    synced: false,
    sync_status: 'pending',
  };
  await db.offline_queue.add(item);
  notifyChange();
  return id;
}

/** Number of unsynced items. */
export async function getPendingCount(): Promise<number> {
  return db.offline_queue.where('synced').equals(0).count();
}

export function getIsSyncing(): boolean {
  return syncing;
}

/** Mark item synced and remove from queue. */
async function markSyncedAndRemove(id: string): Promise<void> {
  await db.offline_queue.delete(id);
  notifyChange();
}

/** Mark item as failed so UI can show "Sync Failed"; item stays in queue for retry. */
export async function markItemSyncFailed(id: string): Promise<void> {
  await db.offline_queue.update(id, { sync_status: 'failed' });
  notifyChange();
}

/** All unsynced items. */
export async function getUnsyncedItems(): Promise<OfflineQueueItem[]> {
  return db.offline_queue.where('synced').equals(0).sortBy('created_at');
}

export const OFFLINE_QUEUE_CHANGE_EVENT = QUEUE_CHANGE_EVENT;

/**
 * Sync all queued items to Supabase.
 * Trigger on: app load, online event, manual sync.
 * On success: mark synced and remove from queue.
 */
export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  if (syncing) return { synced: 0, failed: 0 };
  syncing = true;
  notifyChange();

  const { processOfflineQueue } = await import('@/services/offlineQueueSync');
  let synced = 0;
  let failed = 0;

  try {
    const items = await getUnsyncedItems();
    for (const item of items) {
      try {
        await processOfflineQueue(item);
        await markSyncedAndRemove(item.id);
        synced++;
      } catch (e) {
        if (import.meta.env.DEV) {
          console.warn('[OfflineQueue] Sync failed for item', item.id, e);
        }
        await markItemSyncFailed(item.id);
        failed++;
      }
    }
  } finally {
    syncing = false;
    notifyChange();
  }

  return { synced, failed };
}
