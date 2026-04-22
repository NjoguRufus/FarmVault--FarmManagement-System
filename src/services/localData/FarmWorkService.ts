import { requireCompanyId } from '@/lib/db';
import { buildLocalRow, listEntitiesByCompany, upsertEntityRow } from '@/lib/localData/entityRepository';
import { buildIdempotencyKey, enqueueLocalSync } from '@/lib/localData/localSyncQueue';
import { scheduleLocalDataSync } from '@/services/localData/shared';

/**
 * Maps to `public.work_logs` on sync. Payload keys must match your live DB (company id type may be uuid/text per migration).
 */
export const FarmWorkService = {
  async list(companyId: string): Promise<Record<string, unknown>[]> {
    if (!companyId) return [];
    return (await listEntitiesByCompany('farm_work_logs', requireCompanyId(companyId))).map((r) => r.data);
  },

  async createOffline(companyId: string, row: Record<string, unknown> & { id: string }): Promise<string> {
    const cid = requireCompanyId(companyId);
    const t = new Date().toISOString();
    const data = { ...row, company_id: row['company_id'] ?? cid } as Record<string, unknown>;
    await upsertEntityRow(
      'farm_work_logs',
      buildLocalRow({ id: row.id, companyId: cid, data, syncStatus: 'pending', createdAt: t, updatedAt: t }),
    );
    await enqueueLocalSync({
      id: crypto.randomUUID(),
      action_type: 'ADD_FARM_WORK_LOG',
      table_name: 'farm_work_logs',
      company_id: cid,
      payload: { row: data },
      idempotency_key: buildIdempotencyKey('ADD_FARM_WORK_LOG', 'farm_work_logs', row.id),
    });
    scheduleLocalDataSync(cid);
    return row.id;
  },
};
