import { requireCompanyId } from '@/lib/db';
import { listSuppliers as fetchSuppliersFromSupabase } from '@/services/suppliersService';
import { buildLocalRow, listEntitiesByCompany, shouldApplyRemoteRow, upsertEntityRow } from '@/lib/localData/entityRepository';
import { buildIdempotencyKey, enqueueLocalSync } from '@/lib/localData/localSyncQueue';
import { isClientOnline, scheduleLocalDataSync } from '@/services/localData/shared';
import type { Supplier } from '@/types';

export const SupplierService = {
  async list(companyId: string): Promise<Record<string, unknown>[]> {
    if (!companyId) return [];
    return (await listEntitiesByCompany('suppliers', requireCompanyId(companyId))).map((r) => r.data);
  },

  async listSuppliers(companyId: string | null): Promise<Supplier[]> {
    if (!companyId) return [];
    const raw = await this.list(companyId);
    return raw.map((r) => r as unknown as Supplier);
  },

  async pullRemote(companyId: string | null): Promise<void> {
    if (!isClientOnline() || !companyId) return;
    const remote: Supplier[] = await fetchSuppliersFromSupabase(requireCompanyId(companyId));
    const cid = requireCompanyId(companyId);
    for (const s of remote) {
      const existing = (await listEntitiesByCompany('suppliers', cid)).find((e) => e.id === s.id);
      const u = s.updatedAt
        ? new Date(s.updatedAt as string | Date).toISOString()
        : s.createdAt
          ? new Date(s.createdAt as string | Date).toISOString()
          : new Date().toISOString();
      if (!shouldApplyRemoteRow({ local: existing, remoteUpdatedAt: u })) continue;
      await upsertEntityRow(
        'suppliers',
        buildLocalRow({
          id: s.id,
          companyId: cid,
          data: { ...s, id: s.id, company_id: s.companyId } as unknown as Record<string, unknown>,
          syncStatus: 'synced',
          updatedAt: u,
        }),
      );
    }
  },

  async createLocal(input: {
    companyId: string;
    name: string;
    contact?: string;
    email?: string | null;
    id?: string;
  }): Promise<string> {
    const cid = requireCompanyId(input.companyId);
    const id = input.id ?? crypto.randomUUID();
    const t = new Date().toISOString();
    const row: Record<string, unknown> = {
      id,
      company_id: cid,
      name: input.name,
      contact: input.contact,
      email: input.email ?? null,
    };
    await upsertEntityRow(
      'suppliers',
      buildLocalRow({ id, companyId: cid, data: row, syncStatus: 'pending', createdAt: t, updatedAt: t }),
    );
    await enqueueLocalSync({
      id: crypto.randomUUID(),
      action_type: 'ADD_SUPPLIER',
      table_name: 'suppliers',
      company_id: cid,
      payload: { row },
      idempotency_key: buildIdempotencyKey('ADD_SUPPLIER', 'suppliers', id),
    });
    scheduleLocalDataSync(cid);
    return id;
  },
};
