import { requireCompanyId } from '@/lib/db';
import { getInventoryItems as fetchInventoryItemsFromSupabase, type InventoryItem } from '@/services/inventoryService';
import { buildLocalRow, listEntitiesByCompany, shouldApplyRemoteRow, upsertEntityRow } from '@/lib/localData/entityRepository';
import { buildIdempotencyKey, enqueueLocalSync } from '@/lib/localData/localSyncQueue';
import { isClientOnline, scheduleLocalDataSync } from '@/services/localData/shared';

export const InventoryService = {
  async list(companyId: string): Promise<Record<string, unknown>[]> {
    if (!companyId) return [];
    return (await listEntitiesByCompany('inventory', requireCompanyId(companyId))).map((r) => r.data);
  },

  async getInventoryItems(companyId: string | null): Promise<InventoryItem[]> {
    if (!companyId) return [];
    const raw = await this.list(companyId);
    return raw.map((r) => r as unknown as InventoryItem);
  },

  async getInventoryItemById(companyId: string | null, itemId: string): Promise<InventoryItem | null> {
    if (!companyId) return null;
    const rows = await listEntitiesByCompany('inventory', requireCompanyId(companyId));
    const row = rows.find((r) => r.id === itemId);
    if (!row) return null;
    return row.data as unknown as InventoryItem;
  },

  async pullRemote(companyId: string | null, _opts?: { farmId?: string | null }): Promise<void> {
    if (!isClientOnline() || !companyId) return;
    const cid = requireCompanyId(companyId);
    const remote: InventoryItem[] = await fetchInventoryItemsFromSupabase(cid);
    for (const it of remote) {
      const id = (it as { id: string }).id;
      if (!id) continue;
      const existing = (await listEntitiesByCompany('inventory', cid)).find((e) => e.id === id);
      const u = it.lastUpdated
        ? new Date(it.lastUpdated).toISOString()
        : it.createdAt
          ? new Date(it.createdAt).toISOString()
          : new Date().toISOString();
      if (!shouldApplyRemoteRow({ local: existing, remoteUpdatedAt: u })) continue;
      await upsertEntityRow(
        'inventory',
        buildLocalRow({
          id,
          companyId: cid,
          data: { ...(it as object) } as Record<string, unknown>,
          syncStatus: 'synced',
          updatedAt: u,
        }),
      );
    }
  },

  async upsertOffline(companyId: string, row: Record<string, unknown> & { id: string }): Promise<void> {
    const cid = requireCompanyId(companyId);
    const t = new Date().toISOString();
    const data = { ...row, company_id: (row as { company_id?: string }).company_id ?? cid };
    const isNew = (await listEntitiesByCompany('inventory', cid)).every((e) => e.id !== row.id);
    await upsertEntityRow(
      'inventory',
      buildLocalRow({ id: row.id, companyId: cid, data, syncStatus: 'pending', createdAt: t, updatedAt: t }),
    );
    await enqueueLocalSync({
      id: crypto.randomUUID(),
      action_type: isNew ? 'ADD_INVENTORY' : 'UPDATE_INVENTORY',
      table_name: 'inventory',
      company_id: cid,
      payload: isNew ? { row: data } : { id: row.id, patch: data, company_id: cid },
      idempotency_key: buildIdempotencyKey(
        isNew ? 'ADD_INVENTORY' : 'UPDATE_INVENTORY',
        'inventory',
        row.id,
        isNew ? 'add' : 'up',
      ),
    });
    scheduleLocalDataSync(cid);
  },
};
