/**
 * useFallbackHarvestRepository — local-first data access for the fallback harvest module.
 *
 * Data flow:
 *   mount → read from local Dexie immediately (instant)
 *   online → pull remote to Dexie, re-read from Dexie
 *   write  → repository writes locally + queues sync → local state updates
 *
 * Components NEVER call fallbackHarvestService directly.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getFallbackHarvestRepository } from '@/lib/repositories/FallbackHarvestRepository';
import type { CreateSessionParams } from '@/lib/repositories/HarvestSessionRepository';
import type { CreatePickerParams } from '@/lib/repositories/HarvestPickerRepository';
import type { CreatePickerLogParams } from '@/lib/repositories/HarvestPickerLogRepository';
import type {
  FallbackHarvestSessionRow,
  FallbackPickerRow,
  FallbackPickerLogRow,
} from '@/services/fallbackHarvestService';
import { useIsOnline } from '@/hooks/useConnectivity';

// ─── Sessions list hook ───────────────────────────────────────────────────────

export function useFallbackSessionsLocal(
  companyId: string | null | undefined,
  projectId: string | null | undefined,
) {
  const [sessions, setSessions] = useState<FallbackHarvestSessionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isOnline = useIsOnline();
  const qc = useQueryClient();
  const pulledRef = useRef(false);

  const load = useCallback(async () => {
    if (!companyId) { setIsLoading(false); return; }
    const repo = getFallbackHarvestRepository(companyId);
    const local = await repo.listSessions(projectId);
    setSessions(local);
    setIsLoading(false);
  }, [companyId, projectId]);

  const pullAndReload = useCallback(async () => {
    if (!companyId || !projectId || !isOnline) return;
    const repo = getFallbackHarvestRepository(companyId);
    await repo.pullSessionsRemote(projectId);
    await load();
    void qc.invalidateQueries({ queryKey: ['fallback-session-summary'], exact: false });
  }, [companyId, projectId, isOnline, load, qc]);

  // Load from local on mount and whenever filters change
  useEffect(() => {
    setIsLoading(true);
    pulledRef.current = false;
    void load();
  }, [load]);

  // Pull from remote once per mount when online
  useEffect(() => {
    if (!isOnline || pulledRef.current) return;
    pulledRef.current = true;
    void pullAndReload();
  }, [isOnline, pullAndReload]);

  const createSession = useCallback(
    async (params: Omit<CreateSessionParams, never>): Promise<FallbackHarvestSessionRow> => {
      if (!companyId) throw new Error('companyId required');
      const repo = getFallbackHarvestRepository(companyId);
      const created = await repo.createSession(params);
      setSessions((prev) => [created, ...prev]);
      return created;
    },
    [companyId],
  );

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  return { sessions, isLoading, createSession, refresh, pullAndReload };
}

// ─── Single session + pickers + logs hook ────────────────────────────────────

export function useFallbackSessionDetail(
  companyId: string | null | undefined,
  sessionId: string | null | undefined,
) {
  const [session, setSession] = useState<FallbackHarvestSessionRow | null>(null);
  const [pickers, setPickers] = useState<FallbackPickerRow[]>([]);
  const [pickerLogs, setPickerLogs] = useState<FallbackPickerLogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isOnline = useIsOnline();
  const pulledRef = useRef(false);

  const load = useCallback(async () => {
    if (!companyId || !sessionId) { setIsLoading(false); return; }
    const repo = getFallbackHarvestRepository(companyId);
    const [s, p, l] = await Promise.all([
      repo.getSession(sessionId),
      repo.listPickers(sessionId),
      repo.listPickerLogs(sessionId),
    ]);
    setSession(s ?? null);
    setPickers(p);
    setPickerLogs(l);
    setIsLoading(false);
  }, [companyId, sessionId]);

  const pullAndReload = useCallback(async () => {
    if (!companyId || !sessionId || !isOnline) return;
    const repo = getFallbackHarvestRepository(companyId);
    await repo.pullSessionDataRemote(sessionId);
    await load();
  }, [companyId, sessionId, isOnline, load]);

  useEffect(() => {
    setIsLoading(true);
    pulledRef.current = false;
    void load();
  }, [load]);

  useEffect(() => {
    if (!isOnline || pulledRef.current) return;
    pulledRef.current = true;
    void pullAndReload();
  }, [isOnline, pullAndReload]);

  // ─── Write methods ─────────────────────────────────────────────────────────

  const addPicker = useCallback(
    async (params: CreatePickerParams): Promise<FallbackPickerRow> => {
      if (!companyId) throw new Error('companyId required');
      const repo = getFallbackHarvestRepository(companyId);
      const created = await repo.addPicker(params);
      setPickers((prev) => [...prev, created]);
      return created;
    },
    [companyId],
  );

  const removePicker = useCallback(
    async (id: string): Promise<void> => {
      if (!companyId || !sessionId) return;
      const repo = getFallbackHarvestRepository(companyId);
      await repo.removePicker(id, sessionId);
      setPickers((prev) => prev.filter((p) => p.id !== id));
    },
    [companyId, sessionId],
  );

  /**
   * Record a picker weigh-in — primary high-frequency operation.
   * Writes locally instantly, returns the optimistic row.
   */
  const recordPickerLog = useCallback(
    async (params: CreatePickerLogParams): Promise<FallbackPickerLogRow> => {
      if (!companyId) throw new Error('companyId required');
      const repo = getFallbackHarvestRepository(companyId);
      const log = await repo.recordPickerLog(params);
      setPickerLogs((prev) => [log, ...prev]);
      return log;
    },
    [companyId],
  );

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  // Totals derived locally — no RPC needed for offline use
  const totalUnitsForSession = pickerLogs.reduce((s, l) => s + l.units, 0);

  const totalsByPicker = pickers.map((p) => ({
    picker: p,
    totalUnits: pickerLogs
      .filter((l) => l.picker_id === p.id)
      .reduce((s, l) => s + l.units, 0),
  }));

  return {
    session,
    pickers,
    pickerLogs,
    isLoading,
    totalUnitsForSession,
    totalsByPicker,
    addPicker,
    removePicker,
    recordPickerLog,
    refresh,
    pullAndReload,
  };
}
