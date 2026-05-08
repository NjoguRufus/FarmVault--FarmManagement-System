import { useEffect, useState } from 'react';
import { useConnectivityStatus } from '@/contexts/ConnectivityContext';
import { CheckCircle, Loader2, AlertTriangle, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  /** companyId kept for API compatibility but counts come from ConnectivityContext. */
  companyId?: string | null;
  className?: string;
};

type VisualState = 'offline' | 'syncing' | 'synced' | 'failed' | 'idle';

/**
 * Icon + label indicator showing the current sync state.
 * Reads from ConnectivityContext which aggregates both the legacy harvest queue and
 * the general local-first sync queue.
 *
 * States:
 *   offline  → amber cloud-off
 *   syncing  → blue spinner
 *   synced   → green check (auto-hides after 3s)
 *   failed   → amber warning with retry option
 *   idle     → nothing shown
 */
export function SyncStatusIndicator({ className }: Props) {
  const { status, pendingCount, lastSyncFailed, triggerSync } = useConnectivityStatus();
  const [showSynced, setShowSynced] = useState(false);
  const [prevSyncing, setPrevSyncing] = useState(false);

  // Show green "Synced" briefly after a sync run completes with no pending items
  useEffect(() => {
    const wasSyncing = prevSyncing;
    const nowIdle = status === 'online' && pendingCount === 0;
    if (wasSyncing && nowIdle) {
      setShowSynced(true);
      const t = setTimeout(() => setShowSynced(false), 3000);
      return () => clearTimeout(t);
    }
    setPrevSyncing(status === 'syncing');
  }, [status, pendingCount, prevSyncing]);

  const visual: VisualState =
    status === 'offline' ? 'offline'
    : status === 'syncing' ? 'syncing'
    : status === 'sync_failed' ? 'failed'
    : showSynced ? 'synced'
    : 'idle';

  if (visual === 'idle') return null;

  return (
    <div className={cn('flex items-center gap-1.5 text-xs font-medium select-none', className)}>
      {visual === 'offline' && (
        <>
          <CloudOff className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-amber-600 hidden sm:inline">Offline</span>
          {pendingCount > 0 && (
            <span className="text-amber-500">({pendingCount})</span>
          )}
        </>
      )}
      {visual === 'syncing' && (
        <>
          <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
          <span className="text-blue-600 hidden sm:inline">Syncing...</span>
        </>
      )}
      {visual === 'synced' && (
        <>
          <CheckCircle className="h-3.5 w-3.5 text-green-500" />
          <span className="text-green-600 hidden sm:inline">Synced</span>
        </>
      )}
      {visual === 'failed' && (
        <button
          type="button"
          onClick={() => void triggerSync()}
          className="flex items-center gap-1 text-amber-600 hover:text-amber-700"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">
            {pendingCount} pending · Retry
          </span>
        </button>
      )}
    </div>
  );
}
