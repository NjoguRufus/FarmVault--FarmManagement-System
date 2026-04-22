import { requireCompanyId } from '@/lib/db';
import { listEmployees as fetchEmployeesFromSupabase } from '@/services/employeesSupabaseService';
import { buildLocalRow, listEntitiesByCompany, shouldApplyRemoteRow, upsertEntityRow } from '@/lib/localData/entityRepository';
import { buildIdempotencyKey, enqueueLocalSync } from '@/lib/localData/localSyncQueue';
import { isClientOnline, scheduleLocalDataSync } from '@/services/localData/shared';
import type { Employee } from '@/types';

export const EmployeeService = {
  async list(companyId: string): Promise<Record<string, unknown>[]> {
    if (!companyId) return [];
    return (await listEntitiesByCompany('employees', requireCompanyId(companyId))).map((r) => r.data);
  },

  /** Local-first; hydrate with {@link pullRemote} when online. */
  async listEmployees(companyId: string | null): Promise<Employee[]> {
    if (!companyId) return [];
    const raw = await this.list(companyId);
    return raw.map((r) => r as unknown as Employee);
  },

  async pullRemote(companyId: string | null): Promise<void> {
    if (!isClientOnline() || !companyId) return;
    const remote: Employee[] = await fetchEmployeesFromSupabase(requireCompanyId(companyId));
    const cid = requireCompanyId(companyId);
    for (const e of remote) {
      const existing = (await listEntitiesByCompany('employees', cid)).find((r) => r.id === e.id);
      const u = e.joinDate
        ? new Date(e.joinDate as string | Date).toISOString()
        : e.createdAt
          ? new Date(e.createdAt as string | Date).toISOString()
          : new Date().toISOString();
      if (!shouldApplyRemoteRow({ local: existing, remoteUpdatedAt: u })) continue;
      await upsertEntityRow(
        'employees',
        buildLocalRow({
          id: e.id,
          companyId: cid,
          data: { ...e, id: e.id, company_id: cid } as unknown as Record<string, unknown>,
          syncStatus: 'synced',
          updatedAt: u,
        }),
      );
    }
  },

  async queueUpsert(companyId: string, row: Record<string, unknown> & { id: string }): Promise<void> {
    const cid = requireCompanyId(companyId);
    const t = new Date().toISOString();
    const isNew = (await listEntitiesByCompany('employees', cid)).every((e) => e.id !== row.id);
    const data = { ...row, company_id: (row as { company_id?: string }).company_id ?? cid };
    await upsertEntityRow(
      'employees',
      buildLocalRow({ id: row.id, companyId: cid, data, syncStatus: 'pending', createdAt: t, updatedAt: t }),
    );
    await enqueueLocalSync({
      id: crypto.randomUUID(),
      action_type: isNew ? 'ADD_EMPLOYEE' : 'UPDATE_EMPLOYEE',
      table_name: 'employees',
      company_id: cid,
      payload: isNew ? { row: data } : { id: row.id, patch: data, company_id: cid },
      idempotency_key: buildIdempotencyKey(
        isNew ? 'ADD_EMPLOYEE' : 'UPDATE_EMPLOYEE',
        'employees',
        row.id,
        isNew ? 'n' : 'u',
      ),
    });
    scheduleLocalDataSync(cid);
  },
};
