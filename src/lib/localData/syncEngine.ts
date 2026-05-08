import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import {
  buildLocalRow,
  deleteEntityLocal,
  getEntityById,
  markEntityStatus,
  upsertEntityRow,
  writeFailedSync,
} from '@/lib/localData/entityRepository';
import {
  getPendingLocalSyncQueue,
  markQueueItemDone,
  markQueueItemFailed,
  markQueueItemProcessing,
} from '@/lib/localData/localSyncQueue';
import { tryGetDataLayerSupabase } from '@/lib/localData/offlineSupabase';
import {
  LOCAL_SYNC_MAX_RETRIES,
  LOCAL_SYNC_STATE_EVENT,
  type LocalActionType,
  type LocalEntityTable,
  type LocalSyncQueueRow,
} from '@/lib/localData/types';
import { getLocalDataDB } from '@/lib/localData/indexedDb';
import { createHarvestCollection } from '@/services/harvestCollectionsService';
import { isHarvestAction, handleHarvestAction } from '@/lib/sync/harvestSyncHandlers';

let running = false;

function isUniqueViolation(err: unknown): boolean {
  const e = err as PostgrestError | undefined;
  return Boolean(e && typeof e === 'object' && 'code' in e && e.code === '23505');
}


function ensureClient(client: SupabaseClient | null): SupabaseClient {
  if (!client) throw new Error('No Supabase client (not signed in or offline without cached session).');
  return client;
}

async function handleExpense(
  action: LocalActionType,
  client: SupabaseClient,
  item: LocalSyncQueueRow,
): Promise<void> {
  const p = item.payload;
  if (action === 'ADD_EXPENSE') {
    const row = p.row as Record<string, unknown>;
    const { data, error } = await client
      .schema('finance')
      .from('expenses')
      .insert(row)
      .select(
        'id,company_id,farm_id,project_id,category,amount,currency,expense_date,note,created_by,created_at,row_version,deleted_at,source,reference_id,auto_generated',
      )
      .single();
    if (error) {
      if (isUniqueViolation(error)) {
        return;
      }
      throw error;
    }
    if (data && row.id) {
      await markEntityStatus('expenses', String(data.id), 'synced', { ...(data as Record<string, unknown>) });
    }
    return;
  }
  if (action === 'UPDATE_EXPENSE') {
    const id = p.id as string;
    const companyId = p.company_id as string;
    const patch = p.patch as Record<string, unknown>;
    const { data, error } = await client
      .schema('finance')
      .from('expenses')
      .update(patch)
      .eq('id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Update lost (conflict or deleted).');
    await markEntityStatus('expenses', id, 'synced', {
      ...patch,
    });
    return;
  }
  if (action === 'DELETE_EXPENSE') {
    const id = p.id as string;
    const companyId = p.company_id as string;
    const { error } = await client
      .schema('finance')
      .from('expenses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return;
  }
  throw new Error(`Unsupported expense action: ${action}`);
}

async function handleFarm(
  action: LocalActionType,
  client: SupabaseClient,
  item: LocalSyncQueueRow,
): Promise<void> {
  const p = item.payload;
  if (action === 'ADD_FARM' || action === 'UPDATE_FARM') {
    const body = p.row as Record<string, unknown>;
    const id = String(body.id ?? '');
    if (action === 'ADD_FARM') {
      const { error } = await client.schema('projects').from('farms').insert(body).select('id').single();
      if (error && !isUniqueViolation(error)) throw error;
    } else {
      const { error, data } = await client
        .schema('projects')
        .from('farms')
        .update(p.patch as Record<string, unknown>)
        .eq('id', id)
        .eq('company_id', p.company_id as string)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error('Farm update lost (row missing or RLS).');
      }
    }
    await markEntityStatus('farms', id, 'synced');
  }
}

async function handleProject(
  action: LocalActionType,
  client: SupabaseClient,
  item: LocalSyncQueueRow,
): Promise<void> {
  const p = item.payload;
  if (action === 'ADD_PROJECT' || action === 'UPDATE_PROJECT') {
    const id = String((p.row as { id?: string } | undefined)?.id ?? p.id);
    if (action === 'ADD_PROJECT') {
      const { error } = await client.schema('projects').from('projects').insert(p.row as Record<string, unknown>);
      if (error && !isUniqueViolation(error)) throw error;
    } else {
      const { error } = await client
        .schema('projects')
        .from('projects')
        .update(p.patch as Record<string, unknown>)
        .eq('id', id);
      if (error) throw error;
    }
    await markEntityStatus('projects', id, 'synced');
  }
}

async function handleHarvest(
  action: LocalActionType,
  client: SupabaseClient,
  item: LocalSyncQueueRow,
): Promise<void> {
  if (action === 'ADD_HARVEST') {
    const params = item.payload.rpcParams as Parameters<typeof createHarvestCollection>[0];
    const newId = await createHarvestCollection(params);
    const localId = item.payload.client_local_id as string | undefined;
    if (localId && newId && localId !== newId) {
      const old = await getEntityById('harvests', localId);
      if (old) {
        await deleteEntityLocal('harvests', localId);
        await upsertEntityRow(
          'harvests',
          buildLocalRow({
            id: newId,
            companyId: old.company_id,
            data: { ...old.data, id: newId },
            syncStatus: 'synced',
            createdAt: old.created_at,
            updatedAt: new Date().toISOString(),
          }),
        );
      }
    } else if (newId) {
      await markEntityStatus('harvests', newId, 'synced');
    }
    return;
  }
  if (action === 'UPDATE_HARVEST') {
    const p = item.payload;
    const { error } = await client
      .schema('harvest')
      .from('harvest_collections')
      .update(p.patch as Record<string, unknown>)
      .eq('id', p.id as string)
      .eq('company_id', p.company_id as string);
    if (error) throw error;
    await markEntityStatus('harvests', p.id as string, 'synced', p.patch as Record<string, unknown>);
    return;
  }
  throw new Error(`Invalid harvest action: ${action}`);
}

async function handleWorkLog(
  action: LocalActionType,
  client: SupabaseClient,
  item: LocalSyncQueueRow,
): Promise<void> {
  const p = item.payload;
  if (action === 'ADD_FARM_WORK_LOG') {
    const body = p.row as Record<string, unknown>;
    const { error } = await client
      .schema('public')
      .from('work_logs')
      .insert(body)
      .select('id')
      .single();
    if (error && !isUniqueViolation(error)) throw error;
    await markEntityStatus('farm_work_logs', String(body.id), 'synced');
  }
  if (action === 'UPDATE_FARM_WORK_LOG') {
    const id = p.id as string;
    const { error } = await client
      .schema('public')
      .from('work_logs')
      .update(p.patch as Record<string, unknown>)
      .eq('id', id);
    if (error) throw error;
    await markEntityStatus('farm_work_logs', id, 'synced');
  }
}

async function handleInventory(
  action: LocalActionType,
  client: SupabaseClient,
  item: LocalSyncQueueRow,
): Promise<void> {
  const p = item.payload;
  if (action === 'ADD_INVENTORY' || action === 'UPDATE_INVENTORY') {
    const id = String((p.row as { id?: string } | undefined)?.id ?? p.id);
    if (action === 'ADD_INVENTORY') {
      const { error } = await client
        .schema('public')
        .from('inventory_items')
        .insert(p.row as Record<string, unknown>);
      if (error && !isUniqueViolation(error)) throw error;
    } else {
      const { error } = await client
        .schema('public')
        .from('inventory_items')
        .update(p.patch as Record<string, unknown>)
        .eq('id', id);
      if (error) throw error;
    }
    await markEntityStatus('inventory', id, 'synced');
  }
}

async function handleEmployee(
  action: LocalActionType,
  client: SupabaseClient,
  item: LocalSyncQueueRow,
): Promise<void> {
  const p = item.payload;
  if (action === 'ADD_EMPLOYEE' || action === 'UPDATE_EMPLOYEE') {
    const id = String((p.row as { id?: string } | undefined)?.id ?? p.id);
    if (action === 'ADD_EMPLOYEE') {
      const { error } = await client
        .schema('public')
        .from('employees')
        .insert(p.row as Record<string, unknown>);
      if (error && !isUniqueViolation(error)) throw error;
    } else {
      const { error } = await client
        .schema('public')
        .from('employees')
        .update(p.patch as Record<string, unknown>)
        .eq('id', id);
      if (error) throw error;
    }
    await markEntityStatus('employees', id, 'synced');
  }
}

async function handleSupplier(
  action: LocalActionType,
  client: SupabaseClient,
  item: LocalSyncQueueRow,
): Promise<void> {
  const p = item.payload;
  if (action === 'ADD_SUPPLIER' || action === 'UPDATE_SUPPLIER') {
    const id = String((p.row as { id?: string } | undefined)?.id ?? p.id);
    if (action === 'ADD_SUPPLIER') {
      const { error } = await client
        .schema('public')
        .from('suppliers')
        .insert(p.row as Record<string, unknown>);
      if (error && !isUniqueViolation(error)) throw error;
    } else {
      const { error } = await client
        .schema('public')
        .from('suppliers')
        .update(p.patch as Record<string, unknown>)
        .eq('id', id)
        .eq('company_id', p.company_id as string);
      if (error) throw error;
    }
    await markEntityStatus('suppliers', id, 'synced');
  }
}

async function handleNote(
  action: LocalActionType,
  client: SupabaseClient,
  item: LocalSyncQueueRow,
): Promise<void> {
  const p = item.payload;
  if (action === 'ADD_NOTE' || action === 'UPDATE_NOTE') {
    const id = String((p.row as { id?: string } | undefined)?.id ?? p.id);
    if (action === 'ADD_NOTE') {
      const { error } = await client
        .schema('public')
        .from('farm_notebook_entries')
        .insert(p.row as Record<string, unknown>)
        .select('id')
        .single();
      if (error && !isUniqueViolation(error)) throw error;
    } else {
      const { error } = await client
        .schema('public')
        .from('farm_notebook_entries')
        .update(p.patch as Record<string, unknown>)
        .eq('id', id);
      if (error) throw error;
    }
    await markEntityStatus('notes', id, 'synced');
  }
}

async function processOne(
  client: SupabaseClient,
  item: LocalSyncQueueRow,
): Promise<void> {
  const a = item.action_type;
  const t = item.table_name;

  if (t === 'expenses' && (a === 'ADD_EXPENSE' || a === 'UPDATE_EXPENSE' || a === 'DELETE_EXPENSE')) {
    await handleExpense(a, client, item);
    return;
  }
  if (t === 'farms' && (a === 'ADD_FARM' || a === 'UPDATE_FARM')) {
    await handleFarm(a, client, item);
    return;
  }
  if (t === 'projects' && (a === 'ADD_PROJECT' || a === 'UPDATE_PROJECT')) {
    await handleProject(a, client, item);
    return;
  }
  if (t === 'harvests' && (a === 'ADD_HARVEST' || a === 'UPDATE_HARVEST')) {
    await handleHarvest(a, client, item);
    return;
  }
  if (t === 'farm_work_logs' && (a === 'ADD_FARM_WORK_LOG' || a === 'UPDATE_FARM_WORK_LOG')) {
    await handleWorkLog(a, client, item);
    return;
  }
  if (t === 'inventory' && (a === 'ADD_INVENTORY' || a === 'UPDATE_INVENTORY')) {
    await handleInventory(a, client, item);
    return;
  }
  if (t === 'employees' && (a === 'ADD_EMPLOYEE' || a === 'UPDATE_EMPLOYEE')) {
    await handleEmployee(a, client, item);
    return;
  }
  if (t === 'suppliers' && (a === 'ADD_SUPPLIER' || a === 'UPDATE_SUPPLIER')) {
    await handleSupplier(a, client, item);
    return;
  }
  if (t === 'notes' && (a === 'ADD_NOTE' || a === 'UPDATE_NOTE')) {
    await handleNote(a, client, item);
    return;
  }

  // Harvest sub-operations (sessions, pickers, picker logs, dispatches, sales, expense lines)
  if (isHarvestAction(a)) {
    await handleHarvestAction(a, client, item);
    return;
  }

  throw new Error(`No handler: ${a} on ${t}`);
}

async function releaseStuckProcessing(): Promise<void> {
  const db = getLocalDataDB();
  const stuck = await db.sync_queue.filter((q) => q.status === 'processing').toArray();
  for (const s of stuck) {
    await db.sync_queue.update(s.id, { status: 'pending' });
  }
}

/**
 * Replays the durable queue to Supabase. Safe to call on interval / online / app start.
 */
export async function runLocalDataSyncEngine(companyId?: string | null): Promise<{
  processed: number;
  failed: number;
}> {
  if (running) return { processed: 0, failed: 0 };
  running = true;
  await releaseStuckProcessing();
  let processed = 0;
  let failed = 0;

  try {
    const client = await tryGetDataLayerSupabase();
    if (!client) {
      return { processed: 0, failed: 0 };
    }
    ensureClient(client);

    const pending = await getPendingLocalSyncQueue(companyId);
    for (const item of pending) {
      await markQueueItemProcessing(item.id);
      try {
        await processOne(client, item);
        await markQueueItemDone(item.id);
        processed += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const nextCount = (item.retry_count ?? 0) + 1;
        const willRetry = nextCount < LOCAL_SYNC_MAX_RETRIES;
        await markQueueItemFailed(item.id, msg, willRetry);
        if (!willRetry) {
          const tb = item.table_name as LocalEntityTable;
          const rid = (item.payload.id as string) ?? (item.payload.row as { id?: string } | undefined)?.id;
          if (rid) {
            try {
              await markEntityStatus(tb, String(rid), 'failed');
            } catch {
              // best-effort
            }
          }
          // Write to permanent failed_syncs log for user visibility
          try {
            await writeFailedSync({
              action_type: item.action_type,
              table_name: item.table_name,
              payload: item.payload,
              error_message: msg,
              company_id: item.company_id,
            });
          } catch {
            // best-effort
          }
        }
        failed += 1;
      }
    }
  } finally {
    running = false;
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(LOCAL_SYNC_STATE_EVENT));
  }
  return { processed, failed };
}

export function getIsLocalDataSyncRunning(): boolean {
  return running;
}
