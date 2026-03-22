import React from 'react';
import { cn } from '@/lib/utils';
import { useConnectivityStatus } from '@/contexts/ConnectivityContext';

interface ConnectivityStatusPillProps {
  className?: string;
  /** When true, show pending count and sync-failed state in the label. */
  showDetail?: boolean;
}

export function ConnectivityStatusPill({ className, showDetail = true }: ConnectivityStatusPillProps) {
  const { status, pendingCount, lastSyncFailed, triggerSync } = useConnectivityStatus();

  const label =
    status === 'offline'
      ? 'Offline Mode'
      : status === 'sync_failed'
        ? `Sync failed (${pendingCount} pending)`
        : status === 'syncing'
          ? 'Syncing…'
          : status === 'online' && showDetail && pendingCount > 0
            ? `${pendingCount} pending`
            : '';

  const isClickable = status === 'sync_failed' || (status === 'online' && pendingCount > 0);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border py-1 text-[11px] font-medium',
        label ? 'px-2.5' : 'px-1.5',
        status === 'online' && !lastSyncFailed && 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400',
        status === 'offline' && 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400',
        (status === 'syncing' || status === 'sync_failed') && 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400',
        isClickable && 'cursor-pointer hover:opacity-90',
        className
      )}
      role={isClickable ? 'button' : undefined}
      onClick={isClickable ? () => void triggerSync() : undefined}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && triggerSync() : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-live="polite"
      title={isClickable ? 'Click to retry sync' : undefined}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          status === 'online' && !lastSyncFailed && 'bg-emerald-500',
          status === 'offline' && 'bg-red-500',
          (status === 'syncing' || status === 'sync_failed') && 'bg-amber-500 animate-pulse'
        )}
      />
      {label ? label : null}
    </span>
  );
}

