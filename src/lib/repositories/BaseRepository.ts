/**
 * BaseRepository — shared primitives for all local-first repositories.
 *
 * Rules:
 * - Reads ALWAYS come from Dexie (never Supabase).
 * - Writes go to Dexie first, then enqueue a sync action.
 * - Components never see Supabase — they call repositories.
 */
import {
  buildLocalRow,
  getEntityById,
  listEntitiesByCompany,
  markEntityStatus,
  softDeleteEntity,
  upsertEntityRow,
} from '@/lib/localData/entityRepository';
import { buildIdempotencyKey, enqueueLocalSync } from '@/lib/localData/localSyncQueue';
import type { LocalActionType, LocalEntityRow, LocalEntityTable } from '@/lib/localData/types';
import { runLocalDataSyncEngine } from '@/lib/localData/syncEngine';

export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function flushSync(companyId: string): void {
  if (!isOnline()) return;
  void runLocalDataSyncEngine(companyId);
}

export interface BaseWriteOptions {
  id?: string;
  offlineCreated?: boolean;
}

export class BaseRepository {
  protected readonly table: LocalEntityTable;
  protected readonly companyId: string;

  constructor(table: LocalEntityTable, companyId: string) {
    this.table = table;
    this.companyId = companyId;
  }

  // ─── Reads (local only) ───────────────────────────────────────────────────

  protected async localGet(id: string): Promise<LocalEntityRow | undefined> {
    return getEntityById(this.table, id);
  }

  protected async localList(
    filter?: (row: LocalEntityRow) => boolean,
  ): Promise<LocalEntityRow[]> {
    const rows = await listEntitiesByCompany(this.table, this.companyId);
    const active = rows.filter((r) => !r.deleted_at);
    return filter ? active.filter(filter) : active;
  }

  // ─── Writes (local first) ─────────────────────────────────────────────────

  protected async localWrite(
    id: string,
    data: Record<string, unknown>,
    actionType: LocalActionType,
    queuePayload: Record<string, unknown>,
    opts?: BaseWriteOptions,
  ): Promise<LocalEntityRow> {
    const now = new Date().toISOString();
    const existing = await getEntityById(this.table, id);
    const row = buildLocalRow({
      id,
      companyId: this.companyId,
      data,
      syncStatus: 'pending',
      createdAt: existing?.created_at ?? now,
      updatedAt: now,
      offlineCreated: opts?.offlineCreated ?? !isOnline(),
    });
    await upsertEntityRow(this.table, row);

    await enqueueLocalSync({
      id: crypto.randomUUID(),
      action_type: actionType,
      table_name: this.table,
      company_id: this.companyId,
      payload: queuePayload,
      idempotency_key: buildIdempotencyKey(actionType, this.table, id),
    });

    flushSync(this.companyId);
    return row;
  }

  protected async localSoftDelete(
    id: string,
    actionType: LocalActionType,
    queuePayload: Record<string, unknown>,
  ): Promise<void> {
    await softDeleteEntity(this.table, id);
    await enqueueLocalSync({
      id: crypto.randomUUID(),
      action_type: actionType,
      table_name: this.table,
      company_id: this.companyId,
      payload: queuePayload,
      idempotency_key: buildIdempotencyKey(actionType, this.table, id),
    });
    flushSync(this.companyId);
  }

  protected async localMarkSynced(id: string, serverData?: Record<string, unknown>): Promise<void> {
    await markEntityStatus(this.table, id, 'synced', serverData);
  }
}
