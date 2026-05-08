/**
 * ConnectivityManager — singleton that tracks network state and drives sync on reconnect.
 *
 * Emits CONNECTIVITY_CHANGED_EVENT whenever state changes.
 * Components use useConnectivity() hook; they never talk to this directly.
 */
import { CONNECTIVITY_CHANGED_EVENT } from '@/lib/localData/types';
import { getIsLocalDataSyncRunning } from '@/lib/localData/syncEngine';
import { getIsSyncing as getIsHarvestQueueSyncing } from '@/lib/offlineQueue';
import { countPendingForCompany } from '@/lib/localData/entityRepository';
import { getLocalSyncQueuePendingCount } from '@/lib/localData/localSyncQueue';
import { listFailedSyncs } from '@/lib/localData/entityRepository';

export type ConnectivityState = {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
};

let _wasOnline: boolean | null = null;
let _syncOnReconnectFn: ((companyId: string) => Promise<unknown>) | null = null;
let _activeCompanyId: string | null = null;

function emit() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CONNECTIVITY_CHANGED_EVENT));
  }
}

async function onOnline() {
  emit();
  if (_syncOnReconnectFn && _activeCompanyId) {
    try {
      await _syncOnReconnectFn(_activeCompanyId);
    } catch {
      // best-effort
    }
  }
}

function onOffline() {
  emit();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void onOnline();
  });
  window.addEventListener('offline', onOffline);

  // Also re-emit on sync state changes from existing engines
  window.addEventListener('farmvault:local-sync-state', emit);
  window.addEventListener('farmvault:offline-queue-changed', emit);
}

/**
 * Register the sync function to trigger on reconnect.
 * Call this once from the app root (e.g. AppProviders).
 */
export function registerSyncOnReconnect(
  fn: (companyId: string) => Promise<unknown>,
  companyId: string,
): void {
  _syncOnReconnectFn = fn;
  _activeCompanyId = companyId;
}

export function updateActiveCompanyId(companyId: string | null): void {
  _activeCompanyId = companyId;
}

export function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

export function getIsSyncing(): boolean {
  return getIsLocalDataSyncRunning() || getIsHarvestQueueSyncing();
}

export async function getConnectivityState(companyId?: string | null): Promise<ConnectivityState> {
  const isOnline = isBrowserOnline();
  const isSyncing = getIsSyncing();

  let pendingCount = 0;
  let failedCount = 0;

  if (companyId) {
    try {
      const [entityPending, queuePending, failed] = await Promise.all([
        countPendingForCompany(companyId),
        getLocalSyncQueuePendingCount(companyId),
        listFailedSyncs(companyId),
      ]);
      // queuePending is a subset of entityPending; use the larger value
      pendingCount = Math.max(entityPending, queuePending);
      failedCount = failed.length;
    } catch {
      // best-effort
    }
  }

  return { isOnline, isSyncing, pendingCount, failedCount };
}

export function subscribeConnectivity(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CONNECTIVITY_CHANGED_EVENT, cb);
  window.addEventListener('farmvault:local-sync-state', cb);
  window.addEventListener('farmvault:offline-queue-changed', cb);
  return () => {
    window.removeEventListener(CONNECTIVITY_CHANGED_EVENT, cb);
    window.removeEventListener('farmvault:local-sync-state', cb);
    window.removeEventListener('farmvault:offline-queue-changed', cb);
  };
}
