import React from 'react';
import { cn } from '@/lib/utils';
import { useConnectivityStatus } from '@/contexts/ConnectivityContext';

/** Tint the “online” pill next to plan badges — driven by get_my_company_workspace_status, not the subscription gate. */
export type WorkspaceApprovalTone = 'pending' | 'active' | 'unknown' | 'loading';

interface ConnectivityStatusPillProps {
  className?: string;
  /** When true, show pending count and sync-failed state in the label. */
  showDetail?: boolean;
  /**
   * When online, pill/dot reflects core.companies workspace lifecycle.
   * `loading` = neutral until RPC returns; `unknown` = emerald (legacy / no company).
   */
  workspaceApprovalTone?: WorkspaceApprovalTone;
}

export function ConnectivityStatusPill({
  className,
  showDetail = true,
  workspaceApprovalTone = 'unknown',
}: ConnectivityStatusPillProps) {
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

  const onlineBase = status === 'online' && !lastSyncFailed;
  const onlinePendingApproval = onlineBase && workspaceApprovalTone === 'pending';
  const onlineLoadingWorkspace = onlineBase && workspaceApprovalTone === 'loading';
  const onlineEmerald = onlineBase && !onlinePendingApproval && !onlineLoadingWorkspace;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border py-1 text-[11px] font-medium',
        label ? 'px-2.5' : 'px-1.5',
        onlineEmerald &&
          'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400',
        onlinePendingApproval &&
          'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-400',
        onlineLoadingWorkspace &&
          'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300',
        status === 'offline' && 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400',
        (status === 'syncing' || status === 'sync_failed') &&
          'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400',
        isClickable && 'cursor-pointer hover:opacity-90',
        className,
      )}
      role={isClickable ? 'button' : undefined}
      onClick={isClickable ? () => void triggerSync() : undefined}
      onKeyDown={isClickable ? (e) => e.key === 'Enter' && triggerSync() : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-live="polite"
      title={
        isClickable
          ? 'Click to retry sync'
          : onlinePendingApproval
            ? 'Online — workspace approval pending'
            : onlineLoadingWorkspace
              ? 'Online — checking workspace status'
              : status === 'online' && !lastSyncFailed
                ? 'Online'
                : undefined
      }
    >
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          onlineEmerald && 'bg-emerald-500',
          onlinePendingApproval && 'bg-rose-500',
          onlineLoadingWorkspace && 'bg-slate-400 dark:bg-slate-500',
          status === 'offline' && 'bg-red-500',
          (status === 'syncing' || status === 'sync_failed') && 'bg-amber-500 animate-pulse',
        )}
      />
      {label ? label : null}
    </span>
  );
}
