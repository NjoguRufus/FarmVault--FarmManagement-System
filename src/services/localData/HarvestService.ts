import { requireCompanyId } from '@/lib/db';
import { listHarvestCollections as fetchHarvestCollectionsFromSupabase } from '@/services/harvestCollectionsService';
import { buildLocalRow, listEntitiesByCompany, shouldApplyRemoteRow, upsertEntityRow } from '@/lib/localData/entityRepository';
import { buildIdempotencyKey, enqueueLocalSync } from '@/lib/localData/localSyncQueue';
import type { LocalActionType } from '@/lib/localData/types';
import { isClientOnline, scheduleLocalDataSync } from '@/services/localData/shared';
import type { CreateHarvestCollectionParams } from './harvestServiceTypes';

type HarvestCollectionRow = Awaited<ReturnType<typeof fetchHarvestCollectionsFromSupabase>>[number];

export const HarvestService = {
  async list(companyId: string, projectId?: string | null): Promise<Record<string, unknown>[]> {
    if (!companyId) return [];
    const rows = await listEntitiesByCompany('harvests', requireCompanyId(companyId));
    return rows
      .map((r) => r.data)
      .filter((d) => d['pending_rpc'] !== true)
      .filter((d) => {
        if (projectId == null || projectId === '') return true;
        return d['projectId'] === projectId || d['project_id'] === projectId;
      });
  },

  /** Same shape as `listHarvestCollections` from Supabase — served from local store after {@link pullRemote}. */
  async listHarvestCollections(
    companyId: string,
    projectId?: string | null,
  ): Promise<HarvestCollectionRow[]> {
    const rows = await this.list(companyId, projectId);
    return rows as unknown as HarvestCollectionRow[];
  },

  async pullRemote(companyId: string, projectId?: string | null): Promise<void> {
    if (!isClientOnline() || !companyId) return;
    const remote = await fetchHarvestCollectionsFromSupabase(requireCompanyId(companyId), projectId);
    const cid = requireCompanyId(companyId);
    for (const h of remote) {
      const existing = (await listEntitiesByCompany('harvests', cid)).find(
        (e) => e.id === (h as { id: string }).id,
      );
      const created = (h as { createdAt?: string }).createdAt;
      const u =
        created != null
          ? new Date(created as string | Date).toISOString()
          : new Date().toISOString();
      if (!shouldApplyRemoteRow({ local: existing, remoteUpdatedAt: u })) continue;
      const data = { ...(h as object), id: (h as { id: string }).id } as Record<string, unknown>;
      await upsertEntityRow(
        'harvests',
        buildLocalRow({
          id: (h as { id: string }).id,
          companyId: cid,
          data,
          syncStatus: 'synced',
          updatedAt: u,
        }),
      );
    }
  },

  /**
   * Creates a local placeholder + queues RPC `create_collection` for when online; sync replaces temp id.
   */
  async createCollectionOffline(params: CreateHarvestCollectionParams & { id?: string }): Promise<{
    localId: string;
  }> {
    const companyId = requireCompanyId(params.companyId);
    const localId = params.id ?? crypto.randomUUID();
    const t = new Date().toISOString();
    const data: Record<string, unknown> = {
      id: localId,
      company_id: companyId,
      project_id: params.projectId,
      pending_rpc: true,
    };
    await upsertEntityRow(
      'harvests',
      buildLocalRow({ id: localId, companyId, data, syncStatus: 'pending', createdAt: t, updatedAt: t }),
    );
    const qid = crypto.randomUUID();
    const localAction: LocalActionType = 'ADD_HARVEST';
    await enqueueLocalSync({
      id: qid,
      action_type: localAction,
      table_name: 'harvests',
      company_id: companyId,
      payload: {
        rpcParams: {
          companyId: params.companyId,
          projectId: params.projectId,
          harvestedOn: params.harvestedOn,
          harvestDate: params.harvestDate,
          cropType: params.cropType,
          notes: params.notes,
          name: params.name,
          pricePerKg: params.pricePerKg,
          pricePerKgPicker: params.pricePerKgPicker,
        },
        client_local_id: localId,
      },
      idempotency_key: buildIdempotencyKey('ADD_HARVEST', 'harvests', localId),
    });
    scheduleLocalDataSync(companyId);
    return { localId };
  },
};
