import { BaseRepository } from './BaseRepository';
import type { FallbackPickerLogRow } from '@/services/fallbackHarvestService';
import type { LocalEntityRow } from '@/lib/localData/types';

function toLog(row: LocalEntityRow): FallbackPickerLogRow {
  const d = row.data as Record<string, unknown>;
  return {
    id: String(d.id),
    company_id: String(d.company_id),
    harvest_session_id: String(d.harvest_session_id ?? d.session_id),
    picker_id: String(d.picker_id),
    units: Number(d.units ?? 0),
    created_at: String(d.created_at ?? ''),
    recorded_by: String(d.recorded_by ?? ''),
  };
}

export type CreatePickerLogParams = {
  session_id: string;
  picker_id: string;
  units: number;
  recorded_by: string;
  /** Stable client UUID for deduplication across retries. */
  client_entry_id?: string;
};

export class HarvestPickerLogRepository extends BaseRepository {
  constructor(companyId: string) {
    super('harvest_picker_logs', companyId);
  }

  async listForSession(sessionId: string): Promise<FallbackPickerLogRow[]> {
    const rows = await this.localList(
      (r) => r.data['session_id'] === sessionId || r.data['harvest_session_id'] === sessionId,
    );
    return rows.map(toLog).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async listForPicker(sessionId: string, pickerId: string): Promise<FallbackPickerLogRow[]> {
    const rows = await this.localList(
      (r) =>
        (r.data['session_id'] === sessionId || r.data['harvest_session_id'] === sessionId) &&
        r.data['picker_id'] === pickerId,
    );
    return rows.map(toLog).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  /** High-frequency write — uses client_entry_id for dedup on retry. */
  async record(params: CreatePickerLogParams): Promise<FallbackPickerLogRow> {
    const id = params.client_entry_id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const data: Record<string, unknown> = {
      id,
      company_id: this.companyId,
      harvest_session_id: params.session_id,
      session_id: params.session_id,
      picker_id: params.picker_id,
      units: params.units,
      recorded_by: params.recorded_by,
      client_entry_id: id,
      created_at: now,
    };

    const row = await this.localWrite(id, data, 'ADD_HARVEST_PICKER_LOG', {
      row: data,
      client_entry_id: id,
    });
    return toLog(row);
  }

  /** Compute total units for a picker within a session from local data. */
  async totalUnitsForPicker(sessionId: string, pickerId: string): Promise<number> {
    const logs = await this.listForPicker(sessionId, pickerId);
    return logs.reduce((sum, l) => sum + l.units, 0);
  }

  /** Compute total units across all pickers for a session from local data. */
  async totalUnitsForSession(sessionId: string): Promise<number> {
    const logs = await this.listForSession(sessionId);
    return logs.reduce((sum, l) => sum + l.units, 0);
  }

  async pullRemote(
    fetchFn: (params: { companyId: string; sessionId: string }) => Promise<FallbackPickerLogRow[]>,
    sessionId: string,
  ): Promise<void> {
    const {
      buildLocalRow,
      shouldApplyRemoteRow,
      upsertEntityRow,
    } = await import('@/lib/localData/entityRepository');

    const remote = await fetchFn({ companyId: this.companyId, sessionId });
    for (const l of remote) {
      const existing = await this.localGet(l.id);
      if (!shouldApplyRemoteRow({ local: existing, remoteUpdatedAt: l.created_at })) continue;
      const data: Record<string, unknown> = {
        ...l,
        session_id: l.harvest_session_id,
      };
      await upsertEntityRow(
        'harvest_picker_logs',
        buildLocalRow({
          id: l.id,
          companyId: this.companyId,
          data,
          syncStatus: 'synced',
          createdAt: l.created_at,
          updatedAt: l.created_at,
          offlineCreated: false,
        }),
      );
    }
  }
}
