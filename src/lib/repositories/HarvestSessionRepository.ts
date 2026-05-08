import { BaseRepository } from './BaseRepository';
import type { FallbackHarvestSessionRow } from '@/services/fallbackHarvestService';
import { rowToFallbackHarvestSession } from '@/services/fallbackHarvestService';
import type { LocalEntityRow } from '@/lib/localData/types';

function toSession(row: LocalEntityRow): FallbackHarvestSessionRow {
  return rowToFallbackHarvestSession(row.data as Record<string, unknown>);
}

export type CreateSessionParams = {
  id?: string;
  project_id: string;
  crop_id?: string | null;
  session_date: string;
  use_pickers: boolean;
  unit_type: string;
  container_type: string;
  destination: 'FARM' | 'MARKET';
  price_per_unit?: number | null;
  auto_units_sold?: boolean;
  picker_rate_per_unit?: number;
  created_by: string;
};

export type UpdateSessionParams = Partial<Pick<
  FallbackHarvestSessionRow,
  'status' | 'price_per_unit' | 'auto_units_sold' | 'units_sold' |
  'picker_rate_per_unit' | 'destination' | 'total_revenue' | 'total_expenses' | 'net_profit'
>>;

export class HarvestSessionRepository extends BaseRepository {
  constructor(companyId: string) {
    super('harvest_sessions', companyId);
  }

  async list(projectId?: string | null): Promise<FallbackHarvestSessionRow[]> {
    const rows = await this.localList(
      projectId ? (r) => r.data['project_id'] === projectId : undefined,
    );
    return rows.map(toSession);
  }

  async get(id: string): Promise<FallbackHarvestSessionRow | undefined> {
    const row = await this.localGet(id);
    return row ? toSession(row) : undefined;
  }

  async create(params: CreateSessionParams): Promise<FallbackHarvestSessionRow> {
    const id = params.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const data: Record<string, unknown> = {
      id,
      company_id: this.companyId,
      project_id: params.project_id,
      crop_id: params.crop_id ?? null,
      session_date: params.session_date,
      use_pickers: params.use_pickers,
      unit_type: params.unit_type,
      total_units: 0,
      container_type: params.container_type,
      total_containers: 0,
      destination: params.destination,
      price_per_unit: params.price_per_unit ?? null,
      auto_units_sold: params.auto_units_sold ?? true,
      units_sold: null,
      picker_rate_per_unit: params.picker_rate_per_unit ?? 0,
      total_revenue: 0,
      total_expenses: 0,
      net_profit: 0,
      status: 'collecting',
      created_by: params.created_by,
      created_at: now,
      updated_at: now,
    };
    const row = await this.localWrite(id, data, 'ADD_HARVEST_SESSION', {
      row: data,
    });
    return toSession(row);
  }

  async update(id: string, patch: UpdateSessionParams): Promise<FallbackHarvestSessionRow> {
    const existing = await this.localGet(id);
    if (!existing) throw new Error(`Session ${id} not found locally.`);
    const data = { ...existing.data, ...patch, updated_at: new Date().toISOString() };
    const row = await this.localWrite(id, data, 'UPDATE_HARVEST_SESSION', {
      id,
      company_id: this.companyId,
      patch,
    });
    return toSession(row);
  }

  /**
   * Pull sessions from Supabase into local store (called on mount or reconnect).
   * Preserves pending local rows — last-write-wins on updated_at.
   */
  async pullRemote(
    fetchFn: (companyId: string, projectId?: string | null) => Promise<FallbackHarvestSessionRow[]>,
    projectId?: string | null,
  ): Promise<void> {
    const {
      buildLocalRow,
      shouldApplyRemoteRow,
      upsertEntityRow,
    } = await import('@/lib/localData/entityRepository');

    const remote = await fetchFn(this.companyId, projectId);
    for (const s of remote) {
      const existing = await this.localGet(s.id);
      if (!shouldApplyRemoteRow({ local: existing, remoteUpdatedAt: s.updated_at })) continue;
      await upsertEntityRow(
        'harvest_sessions',
        buildLocalRow({
          id: s.id,
          companyId: this.companyId,
          data: s as unknown as Record<string, unknown>,
          syncStatus: 'synced',
          createdAt: s.created_at,
          updatedAt: s.updated_at,
          offlineCreated: false,
        }),
      );
    }
  }
}
