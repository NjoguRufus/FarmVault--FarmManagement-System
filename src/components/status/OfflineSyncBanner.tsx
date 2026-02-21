import React from 'react';
import { useConnectivityStatus } from '@/contexts/ConnectivityContext';

export function OfflineSyncBanner() {
  const { isOnline } = useConnectivityStatus();

  if (isOnline) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[4.25rem] z-[1] text-center text-[11px] font-medium tracking-wide text-amber-900/55">
      Your OFFLINE changes will Sync when your Online
    </div>
  );
}
