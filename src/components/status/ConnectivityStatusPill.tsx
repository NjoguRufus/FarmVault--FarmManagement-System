import React from 'react';
import { cn } from '@/lib/utils';
import { useConnectivityStatus } from '@/contexts/ConnectivityContext';

interface ConnectivityStatusPillProps {
  className?: string;
}

export function ConnectivityStatusPill({ className }: ConnectivityStatusPillProps) {
  const { status } = useConnectivityStatus();

  const label = status === 'offline' ? 'Offline' : status === 'syncing' ? 'Syncing...' : 'Online';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
        status === 'online' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
        status === 'offline' && 'border-red-200 bg-red-50 text-red-700',
        status === 'syncing' && 'border-amber-200 bg-amber-50 text-amber-700',
        className
      )}
      aria-live="polite"
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'online' && 'bg-emerald-500',
          status === 'offline' && 'bg-red-500',
          status === 'syncing' && 'bg-amber-500 animate-pulse'
        )}
      />
      {label}
    </span>
  );
}

