import { db, requireCompanyId } from '@/lib/db';

export type RecordAuditLogRow = {
  id: string;
  created_at: string;
  schema_name: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  actor_user_id: string | null;
  company_id: string | null;
};

export async function listRecordAuditLogForCompany(params: {
  companyId: string;
  limit?: number;
}): Promise<RecordAuditLogRow[]> {
  const companyId = requireCompanyId(params.companyId);
  const limit = Math.min(Math.max(params.limit ?? 80, 1), 200);

  const { data, error } = await db
    .public()
    .from('record_audit_log')
    .select('id, created_at, schema_name, table_name, record_id, action, old_data, new_data, actor_user_id, company_id')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as RecordAuditLogRow[];
}
