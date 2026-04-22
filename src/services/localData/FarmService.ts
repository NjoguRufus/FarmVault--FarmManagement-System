import { requireCompanyId } from '@/lib/db';
import { listFarmsByCompany as fetchFarmsFromSupabase, type CreateFarmInput } from '@/services/farmsService';
import { buildLocalRow, listEntitiesByCompany, shouldApplyRemoteRow, upsertEntityRow } from '@/lib/localData/entityRepository';
import { buildIdempotencyKey, enqueueLocalSync } from '@/lib/localData/localSyncQueue';
import type { Farm } from '@/types';
import { isClientOnline, scheduleLocalDataSync } from '@/services/localData/shared';

export const FarmService = {
  /**
   * Local-first replacement for `farmsService.listFarmsByCompany`.
   * Call {@link pullRemote} when online before first read, or use pages that run pull in queryFn.
   */
  async listFarmsByCompany(companyId: string | null): Promise<Farm[]> {
    if (!companyId) return [];
    return this.listAsFarms(companyId);
  },

  async list(companyId: string): Promise<Record<string, unknown>[]> {
    if (!companyId) return [];
    return (await listEntitiesByCompany('farms', requireCompanyId(companyId))).map((r) => r.data);
  },

  async listAsFarms(companyId: string): Promise<Farm[]> {
    const raw = await FarmService.list(companyId);
    return raw.map((r) => ({
      id: String(r['id'] ?? ''),
      companyId: String(r['company_id'] ?? companyId),
      userId: (r['user_id'] as string) ?? null,
      name: String(r['name'] ?? ''),
      location: String(r['location'] ?? ''),
      status: (r['status'] as Farm['status']) ?? 'active',
      ownershipType: (r['ownership_type'] as Farm['ownershipType']) ?? 'owned',
      leaseCost: r['lease_cost'] != null ? Number(r['lease_cost']) : null,
      leaseDuration: r['lease_duration'] != null ? Number(r['lease_duration']) : null,
      leaseDurationType: (r['lease_duration_type'] as Farm['leaseDurationType']) ?? null,
      leaseAmountPaid: r['lease_amount_paid'] != null ? Number(r['lease_amount_paid']) : null,
      leaseExpiresAt: r['lease_expires_at'] ? new Date(String(r['lease_expires_at'])) : null,
      createdAt: r['created_at'] ? new Date(String(r['created_at'])) : new Date(),
    }));
  },

  async pullRemote(companyId: string): Promise<void> {
    if (!isClientOnline() || !companyId) return;
    const remote = await fetchFarmsFromSupabase(requireCompanyId(companyId));
    for (const f of remote) {
      const existing = (await listEntitiesByCompany('farms', f.companyId)).find((e) => e.id === f.id);
      const remoteUp = f.createdAt.toISOString();
      if (!shouldApplyRemoteRow({ local: existing, remoteUpdatedAt: remoteUp })) continue;
      await upsertEntityRow(
        'farms',
        buildLocalRow({
          id: f.id,
          companyId: f.companyId,
          data: { ...f, id: f.id, company_id: f.companyId, created_at: f.createdAt.toISOString() },
          syncStatus: 'synced',
          createdAt: f.createdAt.toISOString(),
          updatedAt: remoteUp,
        }),
      );
    }
  },

  async create(input: CreateFarmInput & { id?: string }): Promise<Record<string, unknown>> {
    const companyId = requireCompanyId(input.companyId);
    const id = input.id ?? crypto.randomUUID();
    const t = new Date().toISOString();
    const row: Record<string, unknown> = {
      id,
      company_id: companyId,
      name: input.name,
      location: input.location,
      status: 'active',
      ownership_type: input.ownershipType,
      lease_cost: input.ownershipType === 'leased' ? input.leaseCost : null,
      lease_duration: input.ownershipType === 'leased' ? input.leaseDuration : null,
      lease_duration_type: input.ownershipType === 'leased' ? input.leaseDurationType : null,
      created_at: t,
    };
    await upsertEntityRow(
      'farms',
      buildLocalRow({ id, companyId, data: row, syncStatus: 'pending', createdAt: t, updatedAt: t }),
    );
    await enqueueLocalSync({
      id: crypto.randomUUID(),
      action_type: 'ADD_FARM',
      table_name: 'farms',
      company_id: companyId,
      payload: { row },
      idempotency_key: buildIdempotencyKey('ADD_FARM', 'farms', id),
    });
    scheduleLocalDataSync(companyId);
    return row;
  },
};
