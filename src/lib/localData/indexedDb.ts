import Dexie, { type Table } from 'dexie';
import type {
  LocalDraftRow,
  LocalEntityRow,
  LocalEntityTable,
  LocalFailedSyncRow,
  LocalSyncQueueRow,
} from '@/lib/localData/types';
import { LOCAL_DATA_DB_NAME } from '@/lib/localData/types';

/** Base indexes on every entity table. */
const ENTITY_INDEX = 'id, company_id, updated_at, sync_status, deleted_at';

/** Extra compound index for harvest sub-entities that belong to a session. */
const SESSION_ENTITY_INDEX = 'id, company_id, session_id, updated_at, sync_status, deleted_at';

class FarmVaultLocalDataDB extends Dexie {
  // v1 tables
  farms!: Table<LocalEntityRow, string>;
  projects!: Table<LocalEntityRow, string>;
  harvests!: Table<LocalEntityRow, string>;
  farm_work_logs!: Table<LocalEntityRow, string>;
  inventory!: Table<LocalEntityRow, string>;
  employees!: Table<LocalEntityRow, string>;
  suppliers!: Table<LocalEntityRow, string>;
  expenses!: Table<LocalEntityRow, string>;
  notes!: Table<LocalEntityRow, string>;
  sync_queue!: Table<LocalSyncQueueRow, string>;
  session_cache!: Table<{ key: string; value: string; updated_at: string }, string>;

  // v2 tables — harvest sub-entities
  harvest_sessions!: Table<LocalEntityRow, string>;
  harvest_session_pickers!: Table<LocalEntityRow, string>;
  harvest_picker_logs!: Table<LocalEntityRow, string>;
  harvest_dispatches!: Table<LocalEntityRow, string>;
  harvest_sales!: Table<LocalEntityRow, string>;
  harvest_expense_lines!: Table<LocalEntityRow, string>;

  // v2 tables — operational
  failed_syncs!: Table<LocalFailedSyncRow, string>;
  drafts!: Table<LocalDraftRow, string>;

  constructor() {
    super(LOCAL_DATA_DB_NAME);

    this.version(1).stores({
      farms: 'id, company_id, updated_at, sync_status',
      projects: 'id, company_id, updated_at, sync_status',
      harvests: 'id, company_id, updated_at, sync_status',
      farm_work_logs: 'id, company_id, updated_at, sync_status',
      inventory: 'id, company_id, updated_at, sync_status',
      employees: 'id, company_id, updated_at, sync_status',
      suppliers: 'id, company_id, updated_at, sync_status',
      expenses: 'id, company_id, updated_at, sync_status',
      notes: 'id, company_id, updated_at, sync_status',
      sync_queue: 'id, status, table_name, created_at, company_id, idempotency_key',
      session_cache: 'key, updated_at',
    });

    this.version(2).stores({
      // Existing tables — extend indexes (no data migration needed)
      farms: ENTITY_INDEX,
      projects: ENTITY_INDEX,
      harvests: ENTITY_INDEX,
      farm_work_logs: ENTITY_INDEX,
      inventory: ENTITY_INDEX,
      employees: ENTITY_INDEX,
      suppliers: ENTITY_INDEX,
      expenses: ENTITY_INDEX,
      notes: ENTITY_INDEX,
      sync_queue: 'id, status, table_name, created_at, company_id, idempotency_key',
      session_cache: 'key, updated_at',

      // Harvest sub-entities (new in v2)
      harvest_sessions: ENTITY_INDEX,
      harvest_session_pickers: SESSION_ENTITY_INDEX,
      harvest_picker_logs: SESSION_ENTITY_INDEX + ', picker_id',
      harvest_dispatches: ENTITY_INDEX + ', session_id',
      harvest_sales: ENTITY_INDEX + ', dispatch_id',
      harvest_expense_lines: ENTITY_INDEX + ', dispatch_id',

      // Operational tables (new in v2)
      failed_syncs: 'id, company_id, failed_at, table_name',
      drafts: 'id, company_id, draft_type, updated_at',
    });
  }
}

const singleton = new FarmVaultLocalDataDB();

export function getLocalDataDB(): FarmVaultLocalDataDB {
  return singleton;
}

export function tableForEntity(name: LocalEntityTable): Table<LocalEntityRow, string> {
  const db = getLocalDataDB();
  switch (name) {
    case 'farms': return db.farms;
    case 'projects': return db.projects;
    case 'harvests': return db.harvests;
    case 'farm_work_logs': return db.farm_work_logs;
    case 'inventory': return db.inventory;
    case 'employees': return db.employees;
    case 'suppliers': return db.suppliers;
    case 'expenses': return db.expenses;
    case 'notes': return db.notes;
    case 'harvest_sessions': return db.harvest_sessions;
    case 'harvest_session_pickers': return db.harvest_session_pickers;
    case 'harvest_picker_logs': return db.harvest_picker_logs;
    case 'harvest_dispatches': return db.harvest_dispatches;
    case 'harvest_sales': return db.harvest_sales;
    case 'harvest_expense_lines': return db.harvest_expense_lines;
    default: {
      const n: never = name;
      throw new Error(`Unknown local entity: ${n}`);
    }
  }
}
