import { getLocalDataDB } from '@/lib/localData/indexedDb';
import { LOCAL_SYNC_STATE_EVENT } from '@/lib/localData/types';
import type { LocalActionType, LocalEntityTable, LocalSyncQueueRow, LocalSyncQueueItemStatus } from '@/lib/localData/types';

const nowIso = () => new Date().toISOString();

function notify() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LOCAL_SYNC_STATE_EVENT));
  }
}

export async function enqueueLocalSync(
  item: Omit<LocalSyncQueueRow, 'status' | 'retry_count' | 'last_error' | 'created_at'> & {
    status?: LocalSyncQueueItemStatus;
  },
): Promise<string> {
  const db = getLocalDataDB();
  const id = item.id;
  const existing = await db.sync_queue
    .where('idempotency_key')
    .equals(item.idempotency_key)
    .filter((q) => q.status === 'pending')
    .first();
  if (existing) {
    notify();
    return existing.id;
  }
  const row: LocalSyncQueueRow = {
    id,
    action_type: item.action_type,
    table_name: item.table_name,
    payload: item.payload,
    company_id: item.company_id,
    idempotency_key: item.idempotency_key,
    status: item.status ?? 'pending',
    retry_count: 0,
    last_error: null,
    created_at: nowIso(),
  };
  await db.sync_queue.add(row);
  notify();
  return id;
}

export async function getPendingLocalSyncQueue(companyId?: string | null): Promise<LocalSyncQueueRow[]> {
  const db = getLocalDataDB();
  const all = companyId
    ? await db.sync_queue
        .where('company_id')
        .equals(companyId)
        .filter((q) => q.status === 'pending')
        .toArray()
    : await db.sync_queue.filter((q) => q.status === 'pending').toArray();
  all.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return all;
}

export async function getLocalSyncQueuePendingCount(companyId?: string | null): Promise<number> {
  const items = await getPendingLocalSyncQueue(companyId);
  return items.length;
}

export async function markQueueItemProcessing(id: string): Promise<void> {
  await getLocalDataDB().sync_queue.update(id, { status: 'processing' });
  notify();
}

export async function markQueueItemDone(id: string): Promise<void> {
  await getLocalDataDB().sync_queue.delete(id);
  notify();
}

export async function markQueueItemFailed(id: string, err: string, willRetry: boolean): Promise<void> {
  const row = await getLocalDataDB().sync_queue.get(id);
  if (!row) return;
  const nextCount = (row.retry_count ?? 0) + 1;
  await getLocalDataDB().sync_queue.update(id, {
    status: willRetry ? 'pending' : 'failed',
    retry_count: nextCount,
    last_error: err,
  });
  notify();
}

export async function resetFailedToPending(companyId?: string | null): Promise<void> {
  const db = getLocalDataDB();
  const rows = companyId
    ? await db.sync_queue.where('company_id').equals(companyId).toArray()
    : await db.sync_queue.toArray();
  for (const r of rows) {
    if (r.status === 'failed' || (r.status === 'pending' && (r.last_error != null && r.last_error.length > 0))) {
      await db.sync_queue.update(r.id, { status: 'pending', last_error: null });
    }
  }
  notify();
}

export function buildIdempotencyKey(
  action: LocalActionType,
  table: LocalEntityTable,
  entityId: string,
  suffix?: string,
): string {
  return [action, table, entityId, suffix ?? ''].filter(Boolean).join(':');
}
