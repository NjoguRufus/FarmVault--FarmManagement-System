import React from 'react';
import { useConnectivityStatus } from '@/contexts/ConnectivityContext';

/**
 * Compact online / offline / syncing indicator for the shell (🟢 🟡 🔴).
 */
export function ConnectionStatusIndicator() {
  const { status, isOnline, isSyncing } = useConnectivityStatus();
  const label =
    !isOnline ? 'Offline' : isSyncing || status === 'syncing' ? 'Syncing' : 'Online';
  const dot =
    !isOnline ? '🔴' : isSyncing || status === 'syncing' ? '🔄' : '🟢';

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
      title={label}
      aria-label={label}
    >
      <span aria-hidden>{dot}</span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}
