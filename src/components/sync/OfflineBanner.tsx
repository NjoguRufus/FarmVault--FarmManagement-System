import { useConnectivityStatus } from '@/contexts/ConnectivityContext';
import { WifiOff } from 'lucide-react';

/**
 * Full-width offline banner — delegates to the existing ConnectivityContext.
 * Kept as a named export for use in non-MainLayout shells (StaffLayout, etc.)
 */
export function OfflineBanner() {
  const { isOnline } = useConnectivityStatus();
  if (isOnline) return null;

  return (
    <div className="w-full bg-amber-500 text-white text-sm font-medium px-4 py-2 flex items-center gap-2 z-50">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>You're offline — changes will sync automatically when reconnected.</span>
    </div>
  );
}
