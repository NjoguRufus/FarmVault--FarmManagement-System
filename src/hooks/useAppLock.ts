/**
 * useAppLock hook.
 * Manages app lock state and determines if the app should show the lock screen.
 *
 * This hook handles:
 * - Loading Quick Unlock status from the server
 * - Determining if the app should be locked on initial load
 * - Tracking visibility changes and backgrounding
 * - Recording last active time for timeout-based locking
 *
 * IMPORTANT: Lock state is checked SYNCHRONOUSLY from localStorage on mount
 * to prevent the app from briefly showing content before the lock screen.
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
  APP_LOCK_CHANGE_EVENT,
  type DeviceAppLockStatus,
} from '@/services/appLockService';

export interface UseAppLockResult {
  /** Whether quick unlock is enabled for this device (from server) */
  isEnabled: boolean;
  /** Whether the app is currently locked (local state) */
  isLocked: boolean;
  /** Whether we're still loading the server status */
  isLoading: boolean;
  /** Whether we have a potential lock (local localStorage check, before server confirms PIN exists) */
  hasPotentialLock: boolean;
  /** Lock the app immediately */
  lock: () => void;
  /** Unlock the app */
  unlock: () => void;
  /** Full device lock status from server */
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
 * Check synchronously if we should show lock screen based on local state.
 * This is called BEFORE any async operations to prevent content flash.
 */
function getInitialLockState(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check explicit lock flag first
  const explicitlyLocked = isAppLocked();
  if (explicitlyLocked) {
    debugLog('Initial check: explicitly locked');
    return true;
  }
  
  // Check if timeout has expired (requires PIN check later, but we can check timeout now)
  // We'll assume hasPin=true for initial check since we can't know without server
  const shouldLock = shouldLockNow(true);
  if (shouldLock) {
    debugLog('Initial check: timeout expired, should lock');
    // Set the lock flag so it persists
    lockApp();
    return true;
  }
  
  debugLog('Initial check: not locked');
  return false;
}

/**
 * Hook to manage app lock state.
 * Call this at the app level to determine if lock screen should be shown.
 *
 * CRITICAL: The `isLocked` state is initialized SYNCHRONOUSLY from localStorage
 * to prevent the app from briefly showing content before the lock screen.
 */
export function useAppLock(): UseAppLockResult {
  const { user } = useAuth();
  const [status, setStatus] = useState<DeviceAppLockStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // CRITICAL: Initialize locked state synchronously from localStorage
  // This prevents the app from briefly showing content before lock screen
  const [locked, setLocked] = useState(() => {
    const initialLocked = getInitialLockState();
    debugLog('Initializing locked state:', initialLocked);
    return initialLocked;
  });

  // Track if we've verified PIN exists on server
  const pinVerified = useRef(false);
  // Track if we've done initial load
  const initialLoadDone = useRef(false);

  const refresh = useCallback(async () => {
    debugLog('refresh() called, user:', user?.id ? 'present' : 'not present');
    
    // If no user yet, don't clear lock state - just wait
    // The lock state from localStorage should persist until we can verify
    if (!user?.id) {
      debugLog('No user yet, keeping current lock state, waiting for auth');
      // Don't set isLoading to false yet - we're still waiting for auth
      // Don't change locked state - preserve the localStorage state
      return;
    }

    try {
      debugLog('Fetching device status for user:', user.id);
      const deviceStatus = await getDeviceAppLockStatus();
      setStatus(deviceStatus);
      debugLog('Device status:', deviceStatus);

      // Now we know if PIN exists on server
      pinVerified.current = true;

      if (!deviceStatus.hasPin) {
        // No PIN set up - unlock and clear any stale lock state
        debugLog('No PIN on server, clearing lock state');
        unlockApp();
        setLocked(false);
        initialLoadDone.current = true;
        setIsLoading(false);
        return;
      }

      // PIN exists on server, now check if we should be locked
      let nextLocked = false;

      // Check explicit lock flag
      if (isAppLocked()) {
        debugLog('Explicit lock flag is set');
        nextLocked = true;
      }

      // Check timeout-based locking
      if (!nextLocked && shouldLockNow(true)) {
        debugLog('Timeout elapsed, locking app');
        lockApp();
        nextLocked = true;
      }

      debugLog('Final lock state after refresh:', nextLocked);
      setLocked(nextLocked);
      initialLoadDone.current = true;
    } catch (err) {
      console.error('[useAppLock] Failed to get status:', err);
      // On error, preserve current lock state for security
      // If we were locked, stay locked
      debugLog('Error fetching status, preserving current lock state');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Load status on mount and when user changes
  useEffect(() => {
    debugLog('User effect triggered');
    refresh();
  }, [refresh]);

  // Listen for lock state changes from other components (e.g., "Lock now" button)
  useEffect(() => {
    const handleLockChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ locked: boolean }>;
      debugLog('Lock change event received:', customEvent.detail);
      if (customEvent.detail?.locked) {
        setLocked(true);
      } else {
        setLocked(false);
      }
    };

    window.addEventListener(APP_LOCK_CHANGE_EVENT, handleLockChange);
    debugLog('Listening for lock change events');

    return () => {
      window.removeEventListener(APP_LOCK_CHANGE_EVENT, handleLockChange);
    };
  }, []);

  // Track when the user leaves/returns to the app to support timeout-based locking.
  useEffect(() => {
    // Enable visibility tracking if we have a PIN (confirmed from server)
    // OR if we're in a potentially locked state (local check)
    const shouldTrack = status?.hasPin || locked;
    
    if (!shouldTrack) {
      debugLog('Not tracking visibility - no PIN and not locked');
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Record when the user left the app
        debugLog('App hidden, recording last active');
        recordLastActive();
      } else {
        // On return, check if timeout has elapsed
        debugLog('App visible, checking if should lock');
        
        // Only lock if we know a PIN exists (server confirmed)
        // OR if we're already locked (don't need server confirmation)
        const hasPin = status?.hasPin ?? false;
        
        if (hasPin && shouldLockNow(true)) {
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

    // Handle window focus (returning to app)
    const handleWindowFocus = () => {
      debugLog('Window focus, checking if should lock');
      const hasPin = status?.hasPin ?? false;
      
      if (hasPin && shouldLockNow(true)) {
        debugLog('Timeout elapsed on focus, locking');
        lockApp();
        setLocked(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    debugLog('Visibility tracking enabled');

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [status?.hasPin, locked]);

  // Lock function - works immediately without waiting for server
  const lock = useCallback(() => {
    debugLog('Manual lock requested');
    lockApp();
    setLocked(true);
    debugLog('App locked immediately');
  }, []);

  const unlock = useCallback(() => {
    debugLog('Unlocking app');
    unlockApp();
    setLocked(false);
  }, []);

  // hasPotentialLock: true if local storage indicates we might be locked
  // This is used to block rendering even before server confirms PIN exists
  const hasPotentialLock = locked && !pinVerified.current;

  return {
    isEnabled: status?.hasPin ?? false,
    isLocked: locked,
    isLoading,
    hasPotentialLock,
    lock,
    unlock,
    status,
    refresh,
  };
}
