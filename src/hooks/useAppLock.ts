/**
 * useAppLock hook.
 * Manages app lock state and determines if the app should show the lock screen.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getDeviceAppLockStatus,
  isAppLocked,
  lockApp,
  unlockApp,
  type DeviceAppLockStatus,
} from '@/services/appLockService';

export interface UseAppLockResult {
  /** Whether quick unlock is enabled for this device */
  isEnabled: boolean;
  /** Whether the app is currently locked */
  isLocked: boolean;
  /** Whether we're still loading the lock status */
  isLoading: boolean;
  /** Lock the app (will show lock screen on next check) */
  lock: () => void;
  /** Unlock the app */
  unlock: () => void;
  /** Full device lock status */
  status: DeviceAppLockStatus | null;
  /** Refresh status from server */
  refresh: () => Promise<void>;
}

/**
 * Hook to manage app lock state.
 * Call this at the app level to determine if lock screen should be shown.
 */
export function useAppLock(): UseAppLockResult {
  const { user } = useAuth();
  const [status, setStatus] = useState<DeviceAppLockStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [locked, setLocked] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setStatus(null);
      setIsLoading(false);
      return;
    }

    try {
      const deviceStatus = await getDeviceAppLockStatus();
      setStatus(deviceStatus);

      // Check if app should be locked
      if (deviceStatus.hasPin && isAppLocked()) {
        setLocked(true);
      } else {
        setLocked(false);
      }
    } catch (err) {
      console.error('[useAppLock] Failed to get status:', err);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Load status on mount and when user changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-lock on visibility change (when user switches away from app)
  useEffect(() => {
    if (!status?.hasPin) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // User switched away - lock after a delay (could be configurable)
        // For now, we don't auto-lock on tab switch to avoid annoyance
        // This can be enabled later with a timeout
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [status?.hasPin]);

  const lock = useCallback(() => {
    if (status?.hasPin) {
      lockApp();
      setLocked(true);
    }
  }, [status?.hasPin]);

  const unlock = useCallback(() => {
    unlockApp();
    setLocked(false);
  }, []);

  return {
    isEnabled: status?.hasPin ?? false,
    isLocked: locked,
    isLoading,
    lock,
    unlock,
    status,
    refresh,
  };
}
