/**
 * Local-first / offline data layer types.
 * Local IndexedDB is the primary runtime source; Supabase is the sync target.
 */

export type LocalSyncStatus = 'pending' | 'synced' | 'failed' | 'conflict';

export type LocalSyncQueueItemStatus = 'pending' | 'processing' | 'failed';

/** Logical tables in Dexie (mirrors app domains). */
export const LOCAL_ENTITY_TABLES = [
  'farms',
  'projects',
  'harvests',
  'farm_work_logs',
  'inventory',
  'employees',
  'suppliers',
  'expenses',
  'notes',
  // Harvest sub-entities (v2)
  'harvest_sessions',
  'harvest_session_pickers',
  'harvest_picker_logs',
  'harvest_dispatches',
  'harvest_sales',
  'harvest_expense_lines',
] as const;

export type LocalEntityTable = (typeof LOCAL_ENTITY_TABLES)[number];

/**
 * All mutating operations that the sync engine replays to Supabase.
 * Naming: SCREAMING_SNAKE for queue persistence stability.
 */
export type LocalActionType =
  // General entities
  | 'ADD_EXPENSE'
  | 'UPDATE_EXPENSE'
  | 'DELETE_EXPENSE'
  | 'ADD_FARM'
  | 'UPDATE_FARM'
  | 'ADD_PROJECT'
  | 'UPDATE_PROJECT'
  | 'ADD_HARVEST'
  | 'UPDATE_HARVEST'
  | 'ADD_FARM_WORK_LOG'
  | 'UPDATE_FARM_WORK_LOG'
  | 'ADD_INVENTORY'
  | 'UPDATE_INVENTORY'
  | 'ADD_EMPLOYEE'
  | 'UPDATE_EMPLOYEE'
  | 'ADD_SUPPLIER'
  | 'UPDATE_SUPPLIER'
  | 'ADD_NOTE'
  | 'UPDATE_NOTE'
  // Harvest sub-operations (v2 — fallback harvest system)
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
  | 'DELETE_HARVEST_EXPENSE_LINE';

export interface LocalEntityRow {
  id: string;
  company_id: string;
  created_at: string;
  updated_at: string;
  sync_status: LocalSyncStatus;
  /** ISO timestamp of the last successful Supabase confirmation. */
  last_synced_at?: string;
  /** True when the row was first written while the device was offline. */
  offline_created?: boolean;
  /** Device/tab fingerprint for conflict tracing. */
  device_id?: string;
  /** ISO timestamp for soft-delete. Null = not deleted. */
  deleted_at?: string | null;
  /** Canonical row body (snake_case keys aligned with Supabase where applicable). */
  data: Record<string, unknown>;
}

export interface LocalSyncQueueRow {
  id: string;
  action_type: LocalActionType;
  table_name: LocalEntityTable;
  /** Full entity payload and operation hints (e.g. expected_row_version). */
  payload: Record<string, unknown>;
  status: LocalSyncQueueItemStatus;
  retry_count: number;
  last_error: string | null;
  created_at: string;
  company_id: string;
  /**
   * Prevents double-submit on sync replay: stable per logical write (e.g. `ADD_EXPENSE:<uuid>`).
   * Not a substitute for server-side idempotency keys when available.
   */
  idempotency_key: string;
}

/** Permanent failures written here for user visibility (never auto-retried). */
export interface LocalFailedSyncRow {
  id: string;
  action_type: LocalActionType;
  table_name: LocalEntityTable;
  payload: Record<string, unknown>;
  error_message: string;
  company_id: string;
  failed_at: string;
}

/** Multi-step form drafts that survive page refreshes. */
export interface LocalDraftRow {
  id: string;
  draft_type: string;
  company_id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export const LOCAL_SYNC_MAX_RETRIES = 8;

export const LOCAL_DATA_DB_NAME = 'farmvault_local_data';

export const LOCAL_SYNC_STATE_EVENT = 'farmvault:local-sync-state';

export const CONNECTIVITY_CHANGED_EVENT = 'farmvault:connectivity-changed';
