/**
 * Global network + local sync activity (browser). Does not use Supabase; safe to import anywhere.
 */
import { getIsLocalDataSyncRunning } from '@/lib/localData/syncEngine';
import { LOCAL_SYNC_STATE_EVENT } from '@/lib/localData/types';
import { getIsSyncing as getIsHarvestQueueSyncing } from '@/lib/offlineQueue';

export type NetworkState = {
  isOnline: boolean;
  isSyncing: boolean;
};

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', emit);
  window.addEventListener('offline', emit);
  window.addEventListener(LOCAL_SYNC_STATE_EVENT, emit);
  window.addEventListener('farmvault:offline-queue-changed', emit);
}

export function getNetworkState(): NetworkState {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  return {
    isOnline: online,
    isSyncing: getIsLocalDataSyncRunning() || getIsHarvestQueueSyncing(),
  };
}

export function subscribeNetworkState(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function isBrowserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}
