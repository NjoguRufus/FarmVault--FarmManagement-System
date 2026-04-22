import { requireCompanyId } from '@/lib/db';
import { listProjects } from '@/services/projectsService';
import { buildLocalRow, listEntitiesByCompany, shouldApplyRemoteRow, upsertEntityRow } from '@/lib/localData/entityRepository';
import { buildIdempotencyKey, enqueueLocalSync } from '@/lib/localData/localSyncQueue';
import { isClientOnline, scheduleLocalDataSync } from '@/services/localData/shared';
import type { Project } from '@/types';

export const ProjectService = {
  async list(companyId: string): Promise<Record<string, unknown>[]> {
    if (!companyId) return [];
    return (await listEntitiesByCompany('projects', requireCompanyId(companyId))).map((r) => r.data);
  },

  /** Primary read for UI — local IndexedDB (hydrated by {@link pullRemote}). */
  async listProjects(companyId: string | null): Promise<Project[]> {
    if (!companyId) return [];
    const rows = await this.list(companyId);
    return rows.map((r) => r as unknown as Project);
  },

  async pullRemote(companyId: string | null): Promise<void> {
    if (!isClientOnline() || !companyId) return;
    const remote = await listProjects(companyId);
    const cid = requireCompanyId(companyId);
    for (const p of remote) {
      const existing = (await listEntitiesByCompany('projects', cid)).find((e) => e.id === p.id);
      const u = p.createdAt ? new Date(p.createdAt as Date | string).toISOString() : new Date().toISOString();
      if (!shouldApplyRemoteRow({ local: existing, remoteUpdatedAt: u })) continue;
      await upsertEntityRow(
        'projects',
        buildLocalRow({
          id: p.id,
          companyId: cid,
          data: { ...(p as object), id: p.id, company_id: cid } as unknown as Record<string, unknown>,
          syncStatus: 'synced',
          updatedAt: u,
        }),
      );
    }
  },

  async createLocal(
    companyId: string,
    data: Record<string, unknown> & { id: string },
  ): Promise<void> {
    const cid = requireCompanyId(companyId);
    const t = new Date().toISOString();
    const row = { ...data, company_id: cid };
    await upsertEntityRow(
      'projects',
      buildLocalRow({ id: data.id, companyId: cid, data: row, syncStatus: 'pending', createdAt: t, updatedAt: t }),
    );
    await enqueueLocalSync({
      id: crypto.randomUUID(),
      action_type: 'ADD_PROJECT',
      table_name: 'projects',
      company_id: cid,
      payload: { row },
      idempotency_key: buildIdempotencyKey('ADD_PROJECT', 'projects', data.id),
    });
    scheduleLocalDataSync(cid);
  },
};
