/**
 * Local-first / offline data layer types.
 * Local IndexedDB is the primary runtime source; Supabase is the sync target.
 */

export type LocalSyncStatus = 'pending' | 'synced' | 'failed';

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
] as const;

export type LocalEntityTable = (typeof LOCAL_ENTITY_TABLES)[number];

/**
 * All mutating operations that the sync engine replays to Supabase.
 * Naming: SCREAMING_SNAKE for queue persistence stability.
 */
export type LocalActionType =
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
  | 'UPDATE_NOTE';

export interface LocalEntityRow {
  id: string;
  company_id: string;
  created_at: string;
  updated_at: string;
  sync_status: LocalSyncStatus;
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

export const LOCAL_SYNC_MAX_RETRIES = 8;

export const LOCAL_DATA_DB_NAME = 'farmvault_local_data';

export const LOCAL_SYNC_STATE_EVENT = 'farmvault:local-sync-state';
