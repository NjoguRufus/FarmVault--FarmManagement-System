import { BaseRepository } from './BaseRepository';
import type { FallbackPickerRow } from '@/services/fallbackHarvestService';
import type { LocalEntityRow } from '@/lib/localData/types';

function toPicker(row: LocalEntityRow): FallbackPickerRow {
  const d = row.data as Record<string, unknown>;
  return {
    id: String(d.id),
    company_id: String(d.company_id),
    harvest_session_id: String(d.harvest_session_id ?? d.session_id),
    picker_number: Number(d.picker_number ?? 0),
    name: String(d.name ?? ''),
    sort_order: Number(d.sort_order ?? 0),
    created_at: String(d.created_at ?? ''),
  };
}

export type CreatePickerParams = {
  session_id: string;
  name: string;
  picker_number?: number;
  sort_order?: number;
};

export class HarvestPickerRepository extends BaseRepository {
  constructor(companyId: string) {
    super('harvest_session_pickers', companyId);
  }

  async listForSession(sessionId: string): Promise<FallbackPickerRow[]> {
    const rows = await this.localList((r) => r.data['session_id'] === sessionId || r.data['harvest_session_id'] === sessionId);
    return rows.map(toPicker).sort((a, b) => a.sort_order - b.sort_order);
  }

  async create(params: CreatePickerParams): Promise<FallbackPickerRow> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Assign next picker_number from local store
    const existing = await this.listForSession(params.session_id);
    const maxNum = existing.reduce((m, p) => Math.max(m, p.picker_number), 0);
    const pickerNum = params.picker_number ?? maxNum + 1;

    const data: Record<string, unknown> = {
      id,
      company_id: this.companyId,
      harvest_session_id: params.session_id,
      session_id: params.session_id,
      picker_number: pickerNum,
      name: params.name,
      sort_order: params.sort_order ?? pickerNum,
      created_at: now,
    };

    const row = await this.localWrite(id, data, 'ADD_HARVEST_SESSION_PICKER', {
      row: data,
    });
    return toPicker(row);
  }

  async remove(id: string, sessionId: string): Promise<void> {
    await this.localSoftDelete(id, 'REMOVE_HARVEST_SESSION_PICKER', {
      id,
      company_id: this.companyId,
      session_id: sessionId,
    });
  }

  async pullRemote(
    fetchFn: (params: { companyId: string; sessionId: string }) => Promise<FallbackPickerRow[]>,
    sessionId: string,
  ): Promise<void> {
    const {
      buildLocalRow,
      shouldApplyRemoteRow,
      upsertEntityRow,
    } = await import('@/lib/localData/entityRepository');

    const remote = await fetchFn({ companyId: this.companyId, sessionId });
    for (const p of remote) {
      const existing = await this.localGet(p.id);
      if (!shouldApplyRemoteRow({ local: existing, remoteUpdatedAt: p.created_at })) continue;
      const data: Record<string, unknown> = {
        ...p,
        session_id: p.harvest_session_id,
      };
      await upsertEntityRow(
        'harvest_session_pickers',
        buildLocalRow({
          id: p.id,
          companyId: this.companyId,
          data,
          syncStatus: 'synced',
          createdAt: p.created_at,
          updatedAt: p.created_at,
          offlineCreated: false,
        }),
      );
    }
  }
}
