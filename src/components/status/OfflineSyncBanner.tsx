import React from 'react';
import { useConnectivityStatus } from '@/contexts/ConnectivityContext';

export function OfflineSyncBanner() {
  const { status, pendingCount, triggerSync } = useConnectivityStatus();

  if (status === 'online' && pendingCount === 0) return null;

  const isOffline = status === 'offline';
  const isSyncFailed = status === 'sync_failed';

  return (
    <div
      className={[
        'absolute inset-x-0 top-[4.25rem] z-[1] flex items-center justify-center gap-2 py-1.5 text-[11px] font-medium tracking-wide',
        isOffline && 'pointer-events-none text-amber-900/90 dark:text-amber-200/90',
        isSyncFailed && 'bg-amber-100 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200',
        status === 'syncing' && 'text-amber-900/80 dark:text-amber-200/80',
        status === 'online' && pendingCount > 0 && 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200',
      ].filter(Boolean).join(' ')}
    >
      {isOffline && <span>Offline — changes will sync when back online.</span>}
      {status === 'syncing' && <span>Syncing…</span>}
      {isSyncFailed && (
        <>
          <span>Sync failed — {pendingCount} pending.</span>
          <button
            type="button"
            onClick={() => void triggerSync()}
            className="underline font-semibold hover:no-underline"
          >
            Retry
          </button>
        </>
      )}
      {status === 'online' && pendingCount > 0 && !isSyncFailed && (
        <span>{pendingCount} change{pendingCount !== 1 ? 's' : ''} pending sync.</span>
      )}
    </div>
  );
}
