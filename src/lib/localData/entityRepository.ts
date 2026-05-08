import { getLocalDataDB, tableForEntity } from '@/lib/localData/indexedDb';
import type {
  LocalDraftRow,
  LocalEntityRow,
  LocalEntityTable,
  LocalFailedSyncRow,
  LocalSyncStatus,
  LocalActionType,
} from '@/lib/localData/types';

const nowIso = () => new Date().toISOString();

let _deviceId: string | null = null;

function getDeviceId(): string {
  if (_deviceId) return _deviceId;
  const stored = localStorage.getItem('fv_device_id');
  if (stored) { _deviceId = stored; return stored; }
  const id = crypto.randomUUID();
  localStorage.setItem('fv_device_id', id);
  _deviceId = id;
  return id;
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

export function mergeTimestamps(created: string, updated: string): { created_at: string; updated_at: string } {
  return {
    created_at: created || nowIso(),
    updated_at: updated || nowIso(),
  };
}

export async function getEntityById(
  table: LocalEntityTable,
  id: string,
): Promise<LocalEntityRow | undefined> {
  return tableForEntity(table).get(id);
}

export async function listEntitiesByCompany(
  table: LocalEntityTable,
  companyId: string,
): Promise<LocalEntityRow[]> {
  return tableForEntity(table)
    .where('company_id')
    .equals(companyId)
    .toArray();
}

/**
 * Last-write-wins: remote must have newer `updated_at` to replace local (unless local is pending and unsynced user edits need preservation — we keep local if sync_status is pending and local updated_at > remote).
 */
export function shouldApplyRemoteRow(params: {
  local?: LocalEntityRow;
  remoteUpdatedAt: string;
}): boolean {
  const { local, remoteUpdatedAt } = params;
  if (!local) return true;
  const l = new Date(local.updated_at).getTime();
  const r = new Date(remoteUpdatedAt).getTime();
  if (local.sync_status === 'pending' && l > r) {
    return false;
  }
  return r >= l;
}

export async function upsertEntityRow(
  table: LocalEntityTable,
  row: LocalEntityRow,
): Promise<void> {
  await tableForEntity(table).put(row);
}

export function buildLocalRow(params: {
  id: string;
  companyId: string;
  data: Record<string, unknown>;
  syncStatus: LocalSyncStatus;
  createdAt?: string;
  updatedAt?: string;
  offlineCreated?: boolean;
  deletedAt?: string | null;
}): LocalEntityRow {
  const t = mergeTimestamps(params.createdAt ?? nowIso(), params.updatedAt ?? nowIso());
  return {
    id: params.id,
    company_id: params.companyId,
    created_at: t.created_at,
    updated_at: t.updated_at,
    sync_status: params.syncStatus,
    offline_created: params.offlineCreated ?? isOffline(),
    device_id: getDeviceId(),
    deleted_at: params.deletedAt ?? null,
    data: params.data,
  };
}

export async function patchEntityData(
  table: LocalEntityTable,
  id: string,
  patch: Partial<LocalEntityRow> & { data?: Record<string, unknown> },
): Promise<void> {
  const existing = await getEntityById(table, id);
  if (!existing) return;
  const next: LocalEntityRow = {
    ...existing,
    ...patch,
    data: patch.data != null ? { ...existing.data, ...patch.data } : existing.data,
    updated_at: nowIso(),
  };
  await upsertEntityRow(table, next);
}

export async function markEntityStatus(
  table: LocalEntityTable,
  id: string,
  syncStatus: LocalSyncStatus,
  dataPatch?: Record<string, unknown>,
): Promise<void> {
  const tableHandle = tableForEntity(table);
  const existing = await tableHandle.get(id);
  if (!existing) return;
  const data = dataPatch ? { ...existing.data, ...dataPatch } : existing.data;
  await tableHandle.put({
    ...existing,
    data,
    updated_at: nowIso(),
    sync_status: syncStatus,
  });
}

export async function deleteEntityLocal(table: LocalEntityTable, id: string): Promise<void> {
  await tableForEntity(table).delete(id);
}

export async function countPendingForCompany(companyId: string): Promise<number> {
  const db = getLocalDataDB();
  const tables: LocalEntityTable[] = [
    'farms',
    'projects',
    'harvests',
    'farm_work_logs',
    'inventory',
    'employees',
    'suppliers',
    'expenses',
    'notes',
    'harvest_sessions',
    'harvest_session_pickers',
    'harvest_picker_logs',
    'harvest_dispatches',
    'harvest_sales',
    'harvest_expense_lines',
  ];
  let n = 0;
  for (const t of tables) {
    n += await tableForEntity(t)
      .filter((r) => r.company_id === companyId && r.sync_status === 'pending')
      .count();
  }
  return n;
}

// ─── Session-scoped entity queries ───────────────────────────────────────────

export async function listEntitiesBySession(
  table: LocalEntityTable,
  sessionId: string,
): Promise<LocalEntityRow[]> {
  return tableForEntity(table)
    .filter((r) => r.data['session_id'] === sessionId && !r.deleted_at)
    .toArray();
}

export async function listEntitiesByDispatch(
  table: LocalEntityTable,
  dispatchId: string,
): Promise<LocalEntityRow[]> {
  return tableForEntity(table)
    .filter((r) => r.data['dispatch_id'] === dispatchId && !r.deleted_at)
    .toArray();
}

export async function softDeleteEntity(
  table: LocalEntityTable,
  id: string,
): Promise<void> {
  const row = await tableForEntity(table).get(id);
  if (!row) return;
  await tableForEntity(table).put({ ...row, deleted_at: nowIso(), updated_at: nowIso() });
}

// ─── Failed sync log ──────────────────────────────────────────────────────────

export async function writeFailedSync(
  item: Omit<LocalFailedSyncRow, 'id' | 'failed_at'> & { id?: string },
): Promise<void> {
  const db = getLocalDataDB();
  await db.failed_syncs.put({
    ...item,
    id: item.id ?? crypto.randomUUID(),
    failed_at: nowIso(),
  });
}

export async function listFailedSyncs(companyId: string): Promise<LocalFailedSyncRow[]> {
  return getLocalDataDB().failed_syncs
    .where('company_id').equals(companyId).toArray();
}

export async function clearFailedSync(id: string): Promise<void> {
  await getLocalDataDB().failed_syncs.delete(id);
}

// ─── Draft helpers ────────────────────────────────────────────────────────────

export async function saveDraft(
  draft: Omit<LocalDraftRow, 'created_at' | 'updated_at'> & { id?: string },
): Promise<string> {
  const db = getLocalDataDB();
  const id = draft.id ?? crypto.randomUUID();
  const now = nowIso();
  const existing = await db.drafts.get(id);
  await db.drafts.put({
    ...draft,
    id,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });
  return id;
}

export async function getDraft(id: string): Promise<LocalDraftRow | undefined> {
  return getLocalDataDB().drafts.get(id);
}

export async function deleteDraft(id: string): Promise<void> {
  await getLocalDataDB().drafts.delete(id);
}

export async function markEntitySynced(
  table: LocalEntityTable,
  id: string,
  serverData?: Record<string, unknown>,
): Promise<void> {
  const row = await tableForEntity(table).get(id);
  if (!row) return;
  await tableForEntity(table).put({
    ...row,
    sync_status: 'synced',
    last_synced_at: nowIso(),
    data: serverData ? { ...row.data, ...serverData } : row.data,
  });
}
