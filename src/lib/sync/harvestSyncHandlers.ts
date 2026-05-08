/**
 * Sync handlers for harvest sub-operations (fallback system).
 * Called by the sync engine when replaying queued actions to Supabase.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LocalActionType, LocalSyncQueueRow } from '@/lib/localData/types';
import { markEntitySynced } from '@/lib/localData/entityRepository';

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string } | undefined;
  return Boolean(e && typeof e === 'object' && 'code' in e && e.code === '23505');
}

type HarvestActionType = Extract<
  LocalActionType,
  | 'ADD_HARVEST_SESSION'
  | 'UPDATE_HARVEST_SESSION'
  | 'ADD_HARVEST_SESSION_PICKER'
  | 'REMOVE_HARVEST_SESSION_PICKER'
  | 'ADD_HARVEST_PICKER_LOG'
  | 'ADD_HARVEST_DISPATCH'
  | 'UPDATE_HARVEST_DISPATCH'
  | 'ADD_HARVEST_SALE'
  | 'UPDATE_HARVEST_SALE'
  | 'ADD_HARVEST_EXPENSE_LINE'
  | 'DELETE_HARVEST_EXPENSE_LINE'
>;

const HARVEST_ACTION_TYPES: ReadonlySet<string> = new Set<HarvestActionType>([
  'ADD_HARVEST_SESSION',
  'UPDATE_HARVEST_SESSION',
  'ADD_HARVEST_SESSION_PICKER',
  'REMOVE_HARVEST_SESSION_PICKER',
  'ADD_HARVEST_PICKER_LOG',
  'ADD_HARVEST_DISPATCH',
  'UPDATE_HARVEST_DISPATCH',
  'ADD_HARVEST_SALE',
  'UPDATE_HARVEST_SALE',
  'ADD_HARVEST_EXPENSE_LINE',
  'DELETE_HARVEST_EXPENSE_LINE',
]);

export function isHarvestAction(action: LocalActionType): action is HarvestActionType {
  return HARVEST_ACTION_TYPES.has(action);
}

// Strip internal-only fields before sending to Supabase
function cleanRow(row: Record<string, unknown>): Record<string, unknown> {
  const { session_id: _s, client_entry_id: _c, ...rest } = row;
  void _s; void _c;
  return rest;
}

export async function handleHarvestAction(
  action: HarvestActionType,
  client: SupabaseClient,
  item: LocalSyncQueueRow,
): Promise<void> {
  const harvest = () => client.schema('harvest');
  const p = item.payload;

  // ─── Sessions ─────────────────────────────────────────────────────────────

  if (action === 'ADD_HARVEST_SESSION') {
    const row = cleanRow(p.row as Record<string, unknown>);
    const { data, error } = await harvest()
      .from('fallback_harvest_sessions')
      .insert(row as any)
      .select('id, updated_at')
      .single();
    if (error && !isUniqueViolation(error)) throw error;
    if (data) {
      await markEntitySynced('harvest_sessions', String(row.id), { id: String(row.id) });
    }
    return;
  }

  if (action === 'UPDATE_HARVEST_SESSION') {
    const { id, company_id, patch } = p as { id: string; company_id: string; patch: Record<string, unknown> };
    const { error } = await harvest()
      .from('fallback_harvest_sessions')
      .update(patch as any)
      .eq('id', id)
      .eq('company_id', company_id);
    if (error) throw error;
    await markEntitySynced('harvest_sessions', id);
    return;
  }

  // ─── Pickers ──────────────────────────────────────────────────────────────

  if (action === 'ADD_HARVEST_SESSION_PICKER') {
    const row = cleanRow(p.row as Record<string, unknown>);
    const { error } = await harvest()
      .from('fallback_session_pickers')
      .insert(row as any)
      .select('id')
      .single();
    if (error && !isUniqueViolation(error)) throw error;
    await markEntitySynced('harvest_session_pickers', String(row.id));
    return;
  }

  if (action === 'REMOVE_HARVEST_SESSION_PICKER') {
    const { id, company_id } = p as { id: string; company_id: string };
    const { error } = await harvest()
      .from('fallback_session_pickers')
      .delete()
      .eq('id', id)
      .eq('company_id', company_id);
    if (error) throw error;
    return;
  }

  // ─── Picker logs ──────────────────────────────────────────────────────────

  if (action === 'ADD_HARVEST_PICKER_LOG') {
    const row = cleanRow(p.row as Record<string, unknown>);
    // Use client_entry_id for server-side dedup if the column exists
    const insertRow = p.client_entry_id
      ? { ...row, client_entry_id: p.client_entry_id }
      : row;
    const { error } = await harvest()
      .from('fallback_session_picker_logs')
      .insert(insertRow as any);
    if (error && !isUniqueViolation(error)) throw error;
    await markEntitySynced('harvest_picker_logs', String(row.id));
    return;
  }

  // ─── Dispatches ───────────────────────────────────────────────────────────

  if (action === 'ADD_HARVEST_DISPATCH') {
    const row = cleanRow(p.row as Record<string, unknown>);
    const { error } = await harvest()
      .from('fallback_market_dispatches')
      .insert(row as any);
    if (error && !isUniqueViolation(error)) throw error;
    await markEntitySynced('harvest_dispatches', String(row.id));
    return;
  }

  if (action === 'UPDATE_HARVEST_DISPATCH') {
    const { id, company_id, patch } = p as { id: string; company_id: string; patch: Record<string, unknown> };
    const { error } = await harvest()
      .from('fallback_market_dispatches')
      .update(patch as any)
      .eq('id', id)
      .eq('company_id', company_id);
    if (error) throw error;
    await markEntitySynced('harvest_dispatches', id);
    return;
  }

  // ─── Sales ────────────────────────────────────────────────────────────────

  if (action === 'ADD_HARVEST_SALE') {
    const row = cleanRow(p.row as Record<string, unknown>);
    const { error } = await harvest()
      .from('fallback_market_sales_entries')
      .insert(row as any);
    if (error && !isUniqueViolation(error)) throw error;
    await markEntitySynced('harvest_sales', String(row.id));
    return;
  }

  if (action === 'UPDATE_HARVEST_SALE') {
    const { id, company_id, patch } = p as { id: string; company_id: string; patch: Record<string, unknown> };
    const { error } = await harvest()
      .from('fallback_market_sales_entries')
      .update(patch as any)
      .eq('id', id)
      .eq('company_id', company_id);
    if (error) throw error;
    await markEntitySynced('harvest_sales', id);
    return;
  }

  // ─── Expense lines ────────────────────────────────────────────────────────

  if (action === 'ADD_HARVEST_EXPENSE_LINE') {
    const row = cleanRow(p.row as Record<string, unknown>);
    const { error } = await harvest()
      .from('fallback_market_expense_lines')
      .insert(row as any);
    if (error && !isUniqueViolation(error)) throw error;
    await markEntitySynced('harvest_expense_lines', String(row.id));
    return;
  }

  if (action === 'DELETE_HARVEST_EXPENSE_LINE') {
    const { id, company_id } = p as { id: string; company_id: string };
    const { error } = await harvest()
      .from('fallback_market_expense_lines')
      .delete()
      .eq('id', id)
      .eq('company_id', company_id);
    if (error) throw error;
    return;
  }

  throw new Error(`No harvest handler for action: ${action}`);
}
