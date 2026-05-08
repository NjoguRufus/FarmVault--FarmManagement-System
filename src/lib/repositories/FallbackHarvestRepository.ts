/**
 * FallbackHarvestRepository — the single entry point for all fallback harvest operations.
 *
 * Components interact ONLY with this class. Never call fallbackHarvestService directly from UI.
 * All reads come from local Dexie. Writes go local first, then queue to Supabase.
 */
import { HarvestSessionRepository, type CreateSessionParams, type UpdateSessionParams } from './HarvestSessionRepository';
import { HarvestPickerRepository, type CreatePickerParams } from './HarvestPickerRepository';
import { HarvestPickerLogRepository, type CreatePickerLogParams } from './HarvestPickerLogRepository';
import type { FallbackHarvestSessionRow, FallbackPickerLogRow, FallbackPickerRow } from '@/services/fallbackHarvestService';
import {
  listFallbackPickers,
  listFallbackPickerLogs,
  listFallbackSessionsForProject,
} from '@/services/fallbackHarvestService';

export class FallbackHarvestRepository {
  private sessions: HarvestSessionRepository;
  private pickers: HarvestPickerRepository;
  private pickerLogs: HarvestPickerLogRepository;
  readonly companyId: string;

  constructor(companyId: string) {
    this.companyId = companyId;
    this.sessions = new HarvestSessionRepository(companyId);
    this.pickers = new HarvestPickerRepository(companyId);
    this.pickerLogs = new HarvestPickerLogRepository(companyId);
  }

  // ─── Sessions ─────────────────────────────────────────────────────────────

  listSessions(projectId?: string | null): Promise<FallbackHarvestSessionRow[]> {
    return this.sessions.list(projectId);
  }

  getSession(id: string): Promise<FallbackHarvestSessionRow | undefined> {
    return this.sessions.get(id);
  }

  createSession(params: CreateSessionParams): Promise<FallbackHarvestSessionRow> {
    return this.sessions.create(params);
  }

  updateSession(id: string, patch: UpdateSessionParams): Promise<FallbackHarvestSessionRow> {
    return this.sessions.update(id, patch);
  }

  // ─── Pickers ──────────────────────────────────────────────────────────────

  listPickers(sessionId: string): Promise<FallbackPickerRow[]> {
    return this.pickers.listForSession(sessionId);
  }

  addPicker(params: CreatePickerParams): Promise<FallbackPickerRow> {
    return this.pickers.create(params);
  }

  removePicker(id: string, sessionId: string): Promise<void> {
    return this.pickers.remove(id, sessionId);
  }

  // ─── Picker logs (intake / weigh-in — high frequency) ────────────────────

  listPickerLogs(sessionId: string): Promise<FallbackPickerLogRow[]> {
    return this.pickerLogs.listForSession(sessionId);
  }

  listPickerLogsForPicker(sessionId: string, pickerId: string): Promise<FallbackPickerLogRow[]> {
    return this.pickerLogs.listForPicker(sessionId, pickerId);
  }

  /** Primary high-frequency write — instant, optimistic, offline-safe. */
  recordPickerLog(params: CreatePickerLogParams): Promise<FallbackPickerLogRow> {
    return this.pickerLogs.record(params);
  }

  totalUnitsForPicker(sessionId: string, pickerId: string): Promise<number> {
    return this.pickerLogs.totalUnitsForPicker(sessionId, pickerId);
  }

  totalUnitsForSession(sessionId: string): Promise<number> {
    return this.pickerLogs.totalUnitsForSession(sessionId);
  }

  // ─── Remote pull (call on mount / reconnect) ──────────────────────────────

  async pullSessionsRemote(projectId?: string | null): Promise<void> {
    await this.sessions.pullRemote(
      async (cid, pid) => listFallbackSessionsForProject({ companyId: cid, projectId: pid ?? '' }),
      projectId,
    );
  }

  async pullPickersRemote(sessionId: string): Promise<void> {
    await this.pickers.pullRemote(listFallbackPickers, sessionId);
  }

  async pullPickerLogsRemote(sessionId: string): Promise<void> {
    await this.pickerLogs.pullRemote(listFallbackPickerLogs, sessionId);
  }

  /** Pull all data for a session in one call. */
  async pullSessionDataRemote(sessionId: string): Promise<void> {
    await Promise.allSettled([
      this.pullPickersRemote(sessionId),
      this.pullPickerLogsRemote(sessionId),
    ]);
  }
}

// ─── Singleton factory (one per company) ─────────────────────────────────────

const _cache = new Map<string, FallbackHarvestRepository>();

export function getFallbackHarvestRepository(companyId: string): FallbackHarvestRepository {
  if (!_cache.has(companyId)) {
    _cache.set(companyId, new FallbackHarvestRepository(companyId));
  }
  return _cache.get(companyId)!;
}
