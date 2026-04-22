import { getLocalDataDB, tableForEntity } from '@/lib/localData/indexedDb';
import type { LocalEntityRow, LocalEntityTable, LocalSyncStatus } from '@/lib/localData/types';

const nowIso = () => new Date().toISOString();

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
}): LocalEntityRow {
  const t = mergeTimestamps(params.createdAt ?? nowIso(), params.updatedAt ?? nowIso());
  return {
    id: params.id,
    company_id: params.companyId,
    created_at: t.created_at,
    updated_at: t.updated_at,
    sync_status: params.syncStatus,
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
  ];
  let n = 0;
  for (const t of tables) {
    n += await tableForEntity(t)
      .filter((r) => r.company_id === companyId && r.sync_status === 'pending')
      .count();
  }
  return n;
}
