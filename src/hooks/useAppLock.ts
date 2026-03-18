/**
 * useAppLock hook.
 * Manages app lock state sync with server and handles the first-time prompt.
 *
 * IMPORTANT: The actual lock enforcement is now handled by AppLockGate at the root level.
 * This hook is used for:
 * 1. Syncing PIN exists flag with server
 * 2. Showing the first-time App Lock prompt
 * 3. Providing lock/unlock functions for UI components
 *
 * The AppLockGate reads localStorage synchronously on boot to enforce lock
 * before any React components render.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getDeviceAppLockStatus,
  lockApp,
  unlockApp,
  clearQuickUnlockState,
  shouldShowAppLockPrompt,
  getInitialLockState,
  setPinExistsFlag,
  hasPinInLocalStorage,
  type DeviceAppLockStatus,
} from '@/services/appLockService';

export interface UseAppLockResult {
  /** Whether a PIN exists for this device (confirmed from server) */
  hasPinOnServer: boolean;
  /** Whether we're still loading the server status */
  isLoading: boolean;
  /** Whether to show the first-time App Lock prompt */
  showPrompt: boolean;
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
 * Hook to manage app lock sync with server.
 * 
 * NOTE: The actual lock screen is enforced by AppLockGate at the root level.
 * This hook syncs the PIN flag with the server and provides lock/unlock functions.
 */
export function useAppLock(): UseAppLockResult {
  const { user } = useAuth();
  
  const [status, setStatus] = useState<DeviceAppLockStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasPinLocal, setHasPinLocal] = useState<boolean>(() => hasPinInLocalStorage());
  
  const hasFetchedStatus = useRef(false);

  const refresh = useCallback(async () => {
    debugLog('refresh() called, user:', user?.id ? 'present' : 'not present');
    
    // If no user yet, wait for auth
    if (!user?.id) {
      debugLog('No user yet, waiting for auth');
      setIsLoading(false);
      return;
    }

    try {
      debugLog('Fetching device status for user:', user.id);
      const deviceStatus = await getDeviceAppLockStatus();
      setStatus(deviceStatus);
      hasFetchedStatus.current = true;
      debugLog('Device status from server:', deviceStatus);

      // Sync the PIN exists flag with server truth
      setPinExistsFlag(deviceStatus.hasPin);
      setHasPinLocal(deviceStatus.hasPin);

      if (!deviceStatus.hasPin) {
        // No PIN on server - clear any stale local lock state
        debugLog('No PIN on server - clearing stale local state');
        clearQuickUnlockState();
      }
    } catch (err) {
      console.error('[useAppLock] Failed to get status:', err);
      // On error, keep the local state as-is
      debugLog('Error fetching status - keeping local state');
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

  // Lock function - dispatches event that AppLockGate listens to
  const lock = useCallback(() => {
    const hasPin = status?.hasPin || hasPinLocal;
    if (!hasPin) {
      debugLog('Cannot lock - no PIN');
      return;
    }
    debugLog('=== MANUAL LOCK REQUESTED ===');
    lockApp();
  }, [status?.hasPin, hasPinLocal]);

  // Unlock function - dispatches event that AppLockGate listens to
  const unlock = useCallback(() => {
    debugLog('=== UNLOCK REQUESTED ===');
    unlockApp();
  }, []);

  // Calculate whether to show the first-time prompt
  // Show only if: not loading, no PIN exists on server, and prompt not dismissed
  const showPrompt = !isLoading && !status?.hasPin && !hasPinLocal && shouldShowAppLockPrompt();

  // Use server status if available, otherwise fall back to localStorage
  const hasPinOnServer = status?.hasPin ?? hasPinLocal;

  return {
    hasPinOnServer,
    isLoading,
    showPrompt,
    lock,
    unlock,
    status,
    refresh,
  };
}
