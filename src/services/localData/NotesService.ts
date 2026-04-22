import { requireCompanyId } from '@/lib/db';
import { buildLocalRow, listEntitiesByCompany, shouldApplyRemoteRow, upsertEntityRow } from '@/lib/localData/entityRepository';
import { buildIdempotencyKey, enqueueLocalSync } from '@/lib/localData/localSyncQueue';
import { tryGetDataLayerSupabase } from '@/lib/localData/offlineSupabase';
import { isClientOnline, scheduleLocalDataSync } from '@/services/localData/shared';

export const NotesService = {
  async list(companyId: string): Promise<Record<string, unknown>[]> {
    if (!companyId) return [];
    return (await listEntitiesByCompany('notes', requireCompanyId(companyId))).map((r) => r.data);
  },

  async pullRemote(companyId: string | null): Promise<void> {
    if (!isClientOnline() || !companyId) return;
    const client = await tryGetDataLayerSupabase();
    if (!client) return;
    const cid = requireCompanyId(companyId);
    const { data, error } = await client
      .schema('public')
      .from('farm_notebook_entries')
      .select('*')
      .eq('company_id', cid)
      .order('created_at', { ascending: false });
    if (error) throw error;
    for (const row of data ?? []) {
      const r = row as { id: string; created_at?: string; company_id: string };
      const existing = (await listEntitiesByCompany('notes', cid)).find((e) => e.id === r.id);
      const u = (r as { updated_at?: string }).updated_at ?? r.created_at ?? new Date().toISOString();
      if (!shouldApplyRemoteRow({ local: existing, remoteUpdatedAt: u })) continue;
      await upsertEntityRow(
        'notes',
        buildLocalRow({
          id: r.id,
          companyId: cid,
          data: { ...r } as Record<string, unknown>,
          syncStatus: 'synced',
          updatedAt: u,
        }),
      );
    }
  },

  async createOffline(companyId: string, data: { title: string; content: string; crop_slug?: string | null } & { id: string; created_by?: string }): Promise<string> {
    const cid = requireCompanyId(companyId);
    const t = new Date().toISOString();
    const row: Record<string, unknown> = {
      id: data.id,
      company_id: cid,
      title: data.title,
      content: data.content,
      crop_slug: data.crop_slug ?? null,
      created_by: data.created_by ?? null,
      created_at: t,
    };
    await upsertEntityRow(
      'notes',
      buildLocalRow({ id: data.id, companyId: cid, data: row, syncStatus: 'pending', createdAt: t, updatedAt: t }),
    );
    await enqueueLocalSync({
      id: crypto.randomUUID(),
      action_type: 'ADD_NOTE',
      table_name: 'notes',
      company_id: cid,
      payload: { row },
      idempotency_key: buildIdempotencyKey('ADD_NOTE', 'notes', data.id),
    });
    scheduleLocalDataSync(cid);
    return data.id;
  },
};
