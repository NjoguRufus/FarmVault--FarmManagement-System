/**
 * useAppLock hook.
 * Manages app lock state and determines if the app should show the lock screen.
 *
 * This hook handles:
 * - Loading Quick Unlock status from the server
 * - Determining if the app should be locked on initial load
 * - Tracking visibility changes and backgrounding
 * - Recording last active time for timeout-based locking
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getDeviceAppLockStatus,
  isAppLocked,
  lockApp,
  unlockApp,
  recordLastActive,
  shouldLockNow,
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

// Debug logging for development
const DEBUG_LOCK = import.meta.env.DEV;
function debugLog(...args: unknown[]): void {
  if (DEBUG_LOCK) {
    // eslint-disable-next-line no-console
    console.log('[useAppLock]', ...args);
  }
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

  // Use a ref to track if we've done the initial check
  const initialCheckDone = useRef(false);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      debugLog('No user, clearing status');
      setStatus(null);
      setIsLoading(false);
      setLocked(false);
      return;
    }

    try {
      debugLog('Fetching device status for user:', user.id);
      const deviceStatus = await getDeviceAppLockStatus();
      setStatus(deviceStatus);
      debugLog('Device status:', deviceStatus);

      let nextLocked = false;
      if (deviceStatus.hasPin) {
        // Check if explicitly locked
        nextLocked = isAppLocked();
        debugLog('Explicit lock state:', nextLocked);

        // Also lock if timeout has elapsed (including fresh load with no unlock timestamp)
        if (!nextLocked && shouldLockNow(deviceStatus.hasPin)) {
          debugLog('Timeout elapsed, locking app');
          lockApp();
          nextLocked = true;
        }
      }

      debugLog('Final lock state:', nextLocked);
      setLocked(nextLocked);
      initialCheckDone.current = true;
    } catch (err) {
      console.error('[useAppLock] Failed to get status:', err);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Load status on mount and when user changes
  useEffect(() => {
    debugLog('User changed, refreshing');
    initialCheckDone.current = false;
    refresh();
  }, [refresh]);

  // Track when the user leaves/returns to the app to support timeout-based locking.
  useEffect(() => {
    if (!status?.hasPin) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Record when the user left the app
        debugLog('App hidden, recording last active');
        recordLastActive();
      } else {
        // On return, lock if the timeout has elapsed
        debugLog('App visible, checking if should lock');
        if (shouldLockNow(status.hasPin)) {
          debugLog('Timeout elapsed on return, locking');
          lockApp();
          setLocked(true);
        }
      }
    };

    // Handle page unload (browser close, tab close, navigation away)
    const handleBeforeUnload = () => {
      debugLog('beforeunload, recording last active');
      recordLastActive();
    };

    // Handle window blur (switching to another app on mobile)
    const handleWindowBlur = () => {
      debugLog('Window blur, recording last active');
      recordLastActive();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [status?.hasPin]);

  const lock = useCallback(() => {
    if (status?.hasPin) {
      debugLog('Manual lock');
      lockApp();
      setLocked(true);
    }
  }, [status?.hasPin]);

  const unlock = useCallback(() => {
    debugLog('Unlocking app');
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
