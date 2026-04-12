import { db, requireCompanyId } from '@/lib/db';

import type { RecordAuditLogRow } from '@/services/recordAuditLogService';

export type { RecordAuditLogRow as AuditLogRow } from '@/services/recordAuditLogService';

export type AuditEntityCategory = 'all' | 'projects' | 'expenses' | 'harvest' | 'employees' | 'inventory';

const SELECT =
  'id, created_at, schema_name, table_name, record_id, action, old_data, new_data, actor_user_id, company_id';

const DEFAULT_PAGE = 50;
const MAX_PAGE = 100;

/** When callers pass only `tableName`, map to the canonical Postgres schema (matches audit triggers). */
export function inferAuditSchemaForTable(table: string): string {
  const t = table.trim();
  if (t === 'expenses') return 'finance';
  if (t === 'projects') return 'projects';
  if (t === 'harvests' || t === 'harvest_collections') return 'harvest';
  return 'public';
}

/**
 * Paginated company-scoped audit rows from `record_audit_log` (RLS on Supabase).
 * Prefer explicit schema/table/record filters over category when both are set.
 */
export async function listAuditLogsPage(params: {
  companyId: string;
  schemaName?: string | null;
  tableName?: string | null;
  recordId?: string | null;
  category?: AuditEntityCategory;
  limit?: number;
  offset?: number;
}): Promise<{ rows: RecordAuditLogRow[]; hasMore: boolean }> {
  const companyId = requireCompanyId(params.companyId);
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_PAGE, 1), MAX_PAGE);
  const offset = Math.max(params.offset ?? 0, 0);
  const fetchSize = limit + 1;

  let q = db
    .public()
    .from('record_audit_log')
    .select(SELECT)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(offset, offset + fetchSize - 1);

  const schema = params.schemaName?.trim() || null;
  const table = params.tableName?.trim() || null;
  const record = params.recordId?.trim() || null;

  if (schema && table && record) {
    q = q.eq('schema_name', schema).eq('table_name', table).eq('record_id', record);
  } else if (schema && table) {
    q = q.eq('schema_name', schema).eq('table_name', table);
  } else if (table && !schema) {
    q = q.eq('schema_name', inferAuditSchemaForTable(table)).eq('table_name', table);
  } else {
    const cat = params.category ?? 'all';
    if (cat === 'projects') q = q.eq('schema_name', 'projects').eq('table_name', 'projects');
    else if (cat === 'expenses') q = q.eq('schema_name', 'finance').eq('table_name', 'expenses');
    else if (cat === 'harvest') q = q.eq('schema_name', 'harvest').in('table_name', ['harvests', 'harvest_collections']);
    else if (cat === 'employees') q = q.eq('schema_name', 'public').eq('table_name', 'employees');
    else if (cat === 'inventory') q = q.eq('schema_name', 'public').in('table_name', ['inventory_items', 'inventory_purchases']);
  }

  const { data, error } = await q;
  if (error) throw error;
  const raw = (data ?? []) as RecordAuditLogRow[];
  const hasMore = raw.length > limit;
  const rows = hasMore ? raw.slice(0, limit) : raw;
  return { rows, hasMore };
}
