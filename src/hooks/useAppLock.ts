/**
 * useAppLock hook.
 * Manages app lock state and determines if the app should show the lock screen.
 *
 * IMPORTANT: Quick Unlock is an OPTIONAL security layer on top of normal login.
 * The PIN lock screen should ONLY appear when:
 * 1. Server has confirmed a PIN exists for this device
 * 2. The app is in a locked state (manual lock or timeout)
 *
 * If no PIN exists on the server, we should NEVER show the PIN lock screen.
 * Instead, we might show a setup flow if the user wants to enable Quick Unlock.
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
  clearQuickUnlockState,
  APP_LOCK_CHANGE_EVENT,
  type DeviceAppLockStatus,
} from '@/services/appLockService';

export interface UseAppLockResult {
  /** Whether a PIN exists for this device (confirmed from server) */
  hasPinOnServer: boolean;
  /** Whether the app is currently locked and should show lock screen */
  isLocked: boolean;
  /** Whether we're still loading the server status */
  isLoading: boolean;
  /** Lock the app immediately (only works if PIN exists) */
  lock: () => void;
  /** Unlock the app */
  unlock: () => void;
  /** Full device lock status from server */
  status: DeviceAppLockStatus | null;
  /** Refresh status from server */
  refresh: () => Promise<void>;
}

// Debug logging
function debugLog(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log('[useAppLock]', ...args);
}

/**
 * Hook to manage app lock state.
 * Call this at the app level to determine if lock screen should be shown.
 *
 * CRITICAL: We do NOT initialize lock state from localStorage.
 * We wait for server confirmation that a PIN exists before showing lock screen.
 * This prevents the bug where users see a lock screen without ever setting up a PIN.
 */
export function useAppLock(): UseAppLockResult {
  const { user } = useAuth();
  const [status, setStatus] = useState<DeviceAppLockStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  
  // Track if we've fetched status from server
  const hasFetchedStatus = useRef(false);

  const refresh = useCallback(async () => {
    debugLog('refresh() called, user:', user?.id ? 'present' : 'not present');
    
    // If no user yet, wait for auth
    if (!user?.id) {
      debugLog('No user yet, waiting for auth');
      return;
    }

    try {
      debugLog('Fetching device status for user:', user.id);
      const deviceStatus = await getDeviceAppLockStatus();
      setStatus(deviceStatus);
      hasFetchedStatus.current = true;
      debugLog('Device status from server:', deviceStatus);

      if (!deviceStatus.hasPin) {
        // No PIN on server - this is the key fix!
        // Clear any stale local lock state and DO NOT show lock screen
        debugLog('No PIN on server - clearing stale local state, no lock screen');
        clearQuickUnlockState();
        setLocked(false);
        setIsLoading(false);
        return;
      }

      // PIN exists on server, now check if we should be locked
      let shouldBeLocked = false;

      // Check explicit lock flag (set by "Lock now" button)
      if (isAppLocked()) {
        debugLog('Explicit lock flag is set');
        shouldBeLocked = true;
      }

      // Check timeout-based locking (only if PIN exists)
      if (!shouldBeLocked && shouldLockNow(true)) {
        debugLog('Timeout elapsed, should lock');
        lockApp();
        shouldBeLocked = true;
      }

      debugLog('Final lock state:', shouldBeLocked);
      setLocked(shouldBeLocked);
    } catch (err) {
      console.error('[useAppLock] Failed to get status:', err);
      // On error, assume no PIN and don't lock
      // This is safer than locking user out
      debugLog('Error fetching status - assuming no PIN, not locking');
      setLocked(false);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Load status on mount and when user changes
  useEffect(() => {
    debugLog('User effect triggered');
    hasFetchedStatus.current = false;
    setIsLoading(true);
    refresh();
  }, [refresh]);

  // Listen for lock state changes from other components (e.g., "Lock now" button)
  useEffect(() => {
    const handleLockChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ locked: boolean }>;
      debugLog('Lock change event received:', customEvent.detail);
      
      // Only respond to lock events if we have a PIN on the server
      if (status?.hasPin) {
        setLocked(customEvent.detail?.locked ?? false);
      } else {
        debugLog('Ignoring lock event - no PIN on server');
      }
    };

    window.addEventListener(APP_LOCK_CHANGE_EVENT, handleLockChange);
    return () => window.removeEventListener(APP_LOCK_CHANGE_EVENT, handleLockChange);
  }, [status?.hasPin]);

  // Track visibility changes for timeout-based locking
  useEffect(() => {
    // Only track if we have a PIN on server
    if (!status?.hasPin) {
      debugLog('Not tracking visibility - no PIN on server');
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        debugLog('App hidden, recording last active');
        recordLastActive();
      } else {
        debugLog('App visible, checking if should lock');
        if (shouldLockNow(true)) {
          debugLog('Timeout elapsed on return, locking');
          lockApp();
          setLocked(true);
        }
      }
    };

    const handleBeforeUnload = () => {
      debugLog('beforeunload, recording last active');
      recordLastActive();
    };

    const handleWindowBlur = () => {
      debugLog('Window blur, recording last active');
      recordLastActive();
    };

    const handleWindowFocus = () => {
      debugLog('Window focus, checking if should lock');
      if (shouldLockNow(true)) {
        debugLog('Timeout elapsed on focus, locking');
        lockApp();
        setLocked(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    debugLog('Visibility tracking enabled (PIN exists on server)');

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [status?.hasPin]);

  // Lock function - only works if PIN exists
  const lock = useCallback(() => {
    if (!status?.hasPin) {
      debugLog('Cannot lock - no PIN on server');
      return;
    }
    debugLog('Manual lock requested');
    lockApp();
    setLocked(true);
  }, [status?.hasPin]);

  // Unlock function
  const unlock = useCallback(() => {
    debugLog('Unlocking app');
    unlockApp();
    setLocked(false);
  }, []);

  return {
    hasPinOnServer: status?.hasPin ?? false,
    isLocked: locked,
    isLoading,
    lock,
    unlock,
    status,
    refresh,
  };
}
