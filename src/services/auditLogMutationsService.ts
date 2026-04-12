import type { QueryClient } from '@tanstack/react-query';

import { db } from '@/lib/db';
import { supabase } from '@/lib/supabase';

import type { RecordAuditLogRow } from '@/services/recordAuditLogService';

/** Tables that have row-level audit triggers + soft delete (must match restore_record RPC allowlist). */
const MUTATION_TARGET_KEYS = new Set([
  'projects:projects',
  'finance:expenses',
  'harvest:harvests',
  'harvest:harvest_collections',
]);

export function isAuditMutationTarget(schema: string, table: string): boolean {
  return MUTATION_TARGET_KEYS.has(`${schema}:${table}`);
}

/** Undo is blocked for these targets (e.g. HR); extend as needed. */
const UNDO_SENSITIVE_KEYS = new Set<string>([]);

export function isSensitiveUndoTarget(schema: string, table: string): boolean {
  return UNDO_SENSITIVE_KEYS.has(`${schema}:${table}`);
}

function assertMutationTarget(schema: string, table: string) {
  if (!isAuditMutationTarget(schema, table)) {
    throw new Error('This record type cannot be changed from audit history.');
  }
}

function schemaClient(schema: string) {
  if (schema === 'projects') return db.projects();
  if (schema === 'finance') return db.finance();
  if (schema === 'harvest') return db.harvest();
  if (schema === 'public') return db.public();
  throw new Error('Invalid schema');
}

/**
 * Build a PostgREST update body from audit `old_data` (never sends primary key).
 * Drops null-only noise keys that Postgres/RLS may reject if sent explicitly.
 */
export function buildUndoUpdatePayload(
  oldData: Record<string, unknown> | null | undefined,
  primaryKey = 'id',
): Record<string, unknown> {
  if (oldData == null || typeof oldData !== 'object' || Array.isArray(oldData)) {
    throw new Error('Nothing to undo');
  }
  const out: Record<string, unknown> = { ...oldData };
  delete out[primaryKey];
  return out;
}

export function parseRestoreRpcError(err: unknown): string {
  const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message?: string }).message) : String(err);
  if (msg.includes('RECORD_ALREADY_ACTIVE')) return 'This record is already active.';
  if (msg.includes('Invalid table for restore')) return 'Restore is not available for this record type.';
  if (msg.includes('Invalid record id')) return 'Invalid record id.';
  if (msg.includes('Not authorized')) return 'You are not allowed to restore this record.';
  return msg || 'Restore failed.';
}

export async function restoreRecordFromAuditLog(row: Pick<RecordAuditLogRow, 'schema_name' | 'table_name' | 'record_id'>) {
  assertMutationTarget(row.schema_name, row.table_name);
  const { error } = await supabase.rpc('restore_record', {
    p_schema_name: row.schema_name,
    p_table_name: row.table_name,
    p_record_id: row.record_id,
  });
  if (error) throw new Error(parseRestoreRpcError(error));
}

export async function undoAuditUpdate(row: Pick<RecordAuditLogRow, 'schema_name' | 'table_name' | 'record_id' | 'old_data'>) {
  assertMutationTarget(row.schema_name, row.table_name);
  const payload = buildUndoUpdatePayload(row.old_data as Record<string, unknown> | null);
  const client = schemaClient(row.schema_name);
  const { error } = await client.from(row.table_name).update(payload).eq('id', row.record_id);
  if (error) throw new Error(error.message || 'Could not revert this change.');
}

/** Best-effort React Query invalidation after restore/undo. */
export async function invalidateCachesAfterAuditMutation(
  qc: QueryClient,
  companyId: string,
  row: Pick<RecordAuditLogRow, 'schema_name' | 'table_name'>,
) {
  await qc.invalidateQueries({ queryKey: ['audit_logs_drawer'], exact: false });
  await qc.invalidateQueries({ queryKey: ['record_audit_log'], exact: false });

  if (row.schema_name === 'finance' && row.table_name === 'expenses') {
    await qc.invalidateQueries({ queryKey: ['financeExpenses', companyId], exact: false });
    return;
  }
  if (row.schema_name === 'projects' && row.table_name === 'projects') {
    await qc.invalidateQueries({ queryKey: ['projects', companyId], exact: false });
    return;
  }
  if (row.schema_name === 'harvest' && row.table_name === 'harvest_collections') {
    await qc.invalidateQueries({ queryKey: ['harvestCollections', companyId], exact: false });
    return;
  }
  if (row.schema_name === 'harvest' && row.table_name === 'harvests') {
    await qc.invalidateQueries({ queryKey: ['harvests'], exact: false });
    await qc.invalidateQueries({ queryKey: ['harvestSalesTotals', companyId], exact: false });
  }
}
