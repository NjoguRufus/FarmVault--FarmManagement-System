import Dexie, { type Table } from 'dexie';
import type {
  LocalEntityRow,
  LocalEntityTable,
  LocalSyncQueueRow,
} from '@/lib/localData/types';
import { LOCAL_DATA_DB_NAME } from '@/lib/localData/types';

const ENTITY_INDEX = 'id, company_id, updated_at, sync_status';

class FarmVaultLocalDataDB extends Dexie {
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

  constructor() {
    super(LOCAL_DATA_DB_NAME);
    this.version(1).stores({
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
    case 'farms':
      return db.farms;
    case 'projects':
      return db.projects;
    case 'harvests':
      return db.harvests;
    case 'farm_work_logs':
      return db.farm_work_logs;
    case 'inventory':
      return db.inventory;
    case 'employees':
      return db.employees;
    case 'suppliers':
      return db.suppliers;
    case 'expenses':
      return db.expenses;
    case 'notes':
      return db.notes;
    default: {
      const n: never = name;
      throw new Error(`Unknown local entity: ${n}`);
    }
  }
}
