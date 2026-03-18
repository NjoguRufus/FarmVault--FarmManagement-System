/**
 * useAppLock hook.
 * Manages app lock state and determines if the app should show the lock screen.
 *
 * IMPORTANT: Quick Unlock is an OPTIONAL security layer on top of normal login.
 * The PIN lock screen should ONLY appear when:
 * 1. Server has confirmed a PIN exists for this device
 * 2. AND the app is in a locked state (manual lock or timeout)
 *
 * CRITICAL FIX: Lock state now persists across reloads via localStorage.
 * We hydrate from localStorage BEFORE render to prevent bypass.
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
  shouldShowAppLockPrompt,
  getInitialLockState,
  setPinExistsFlag,
  getLockTimeout,
  APP_LOCK_CHANGE_EVENT,
  type DeviceAppLockStatus,
} from '@/services/appLockService';

export interface UseAppLockResult {
  /** Whether a PIN exists for this device (confirmed from server) */
  hasPinOnServer: boolean;
  /** Whether the app is currently locked and should show lock screen */
  isLocked: boolean;
  /** Whether we're still loading the server status (null = not yet determined) */
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
 * Get initial state synchronously from localStorage.
 * This runs BEFORE render to hydrate lock state immediately.
 */
function getHydratedInitialState(): { hasPin: boolean; isLocked: boolean } {
  const state = getInitialLockState();
  debugLog('=== HYDRATING LOCK STATE FROM LOCALSTORAGE ===');
  debugLog('fv_pin_exists:', state.hasPin);
  debugLog('fv_locked:', state.isLocked);
  return state;
}

/**
 * Hook to manage app lock state.
 * Call this at the app level to determine if lock screen should be shown.
 *
 * CRITICAL: We NOW initialize lock state from localStorage BEFORE render.
 * This ensures lock screen shows immediately on reload when locked.
 */
export function useAppLock(): UseAppLockResult {
  const { user } = useAuth();
  
  // CRITICAL: Hydrate initial state from localStorage synchronously
  // This ensures we start with the correct lock state before any render
  const initialState = useRef(getHydratedInitialState());
  
  const [status, setStatus] = useState<DeviceAppLockStatus | null>(null);
  // isLoading starts as true to block initial render
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // Initialize locked state from localStorage - CRITICAL for reload persistence
  const [locked, setLocked] = useState<boolean>(initialState.current.isLocked && initialState.current.hasPin);
  // Track if we potentially have a PIN (from localStorage) before server confirms
  const [hasPinLocal, setHasPinLocal] = useState<boolean>(initialState.current.hasPin);
  
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

      // Sync the PIN exists flag with server truth
      setPinExistsFlag(deviceStatus.hasPin);
      setHasPinLocal(deviceStatus.hasPin);

      if (!deviceStatus.hasPin) {
        // No PIN on server - clear any stale local lock state
        debugLog('No PIN on server - clearing stale local state, no lock screen');
        clearQuickUnlockState();
        setLocked(false);
        setIsLoading(false);
        return;
      }

      // PIN exists on server, now check if we should be locked
      let shouldBeLocked = false;

      // Check explicit lock flag from localStorage (set by "Lock now" button)
      if (isAppLocked()) {
        debugLog('Explicit lock flag is set in localStorage - app should be locked');
        shouldBeLocked = true;
      }

      // Check timeout-based locking (only if PIN exists)
      if (!shouldBeLocked && shouldLockNow(true)) {
        debugLog('Timeout elapsed, should lock');
        lockApp();
        shouldBeLocked = true;
      }

      debugLog('=== FINAL LOCK STATE ===');
      debugLog('shouldBeLocked:', shouldBeLocked);
      setLocked(shouldBeLocked);
    } catch (err) {
      console.error('[useAppLock] Failed to get status:', err);
      // On error, if localStorage says we have PIN and are locked, stay locked
      // This is safer than unlocking and exposing data
      const localState = getInitialLockState();
      if (localState.hasPin && localState.isLocked) {
        debugLog('Error fetching status - but localStorage shows locked, staying locked');
        setLocked(true);
      } else {
        debugLog('Error fetching status - assuming no PIN, not locking');
        setLocked(false);
      }
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
      
      // Respond to lock events if we have a PIN (from server OR localStorage)
      if (status?.hasPin || hasPinLocal) {
        setLocked(customEvent.detail?.locked ?? false);
      } else {
        debugLog('Ignoring lock event - no PIN');
      }
    };

    window.addEventListener(APP_LOCK_CHANGE_EVENT, handleLockChange);
    return () => window.removeEventListener(APP_LOCK_CHANGE_EVENT, handleLockChange);
  }, [status?.hasPin, hasPinLocal]);

  // Track visibility changes for timeout-based auto-locking
  useEffect(() => {
    // Only track if we have a PIN (from server OR localStorage)
    const hasPin = status?.hasPin || hasPinLocal;
    if (!hasPin) {
      debugLog('[VISIBILITY] Not tracking - no PIN exists');
      return;
    }

    const currentTimeout = getLockTimeout();
    debugLog('[VISIBILITY] === ENABLING VISIBILITY TRACKING ===');
    debugLog('[VISIBILITY] Current timeout setting:', currentTimeout, 'seconds');
    debugLog('[VISIBILITY] Will auto-lock when app is hidden for longer than', currentTimeout, 'seconds');

    const handleVisibilityChange = () => {
      if (document.hidden) {
        debugLog('[VISIBILITY] ========================================');
        debugLog('[VISIBILITY] EVENT: visibilitychange → HIDDEN');
        debugLog('[VISIBILITY] User left the app/tab');
        debugLog('[VISIBILITY] ========================================');
        recordLastActive();
      } else {
        debugLog('[VISIBILITY] ========================================');
        debugLog('[VISIBILITY] EVENT: visibilitychange → VISIBLE');
        debugLog('[VISIBILITY] User returned to the app/tab');
        debugLog('[VISIBILITY] ========================================');
        if (shouldLockNow(true)) {
          debugLog('[VISIBILITY] *** AUTO-LOCK TRIGGERED ON RETURN ***');
          lockApp();
          setLocked(true);
        } else {
          debugLog('[VISIBILITY] No lock needed - timeout not exceeded');
        }
      }
    };

    const handleBeforeUnload = () => {
      debugLog('[VISIBILITY] EVENT: beforeunload - recording timestamp before page unload');
      recordLastActive();
    };

    const handleWindowBlur = () => {
      debugLog('[VISIBILITY] EVENT: window blur - user switched away');
      recordLastActive();
    };

    const handleWindowFocus = () => {
      debugLog('[VISIBILITY] ========================================');
      debugLog('[VISIBILITY] EVENT: window focus - user returned');
      debugLog('[VISIBILITY] ========================================');
      if (shouldLockNow(true)) {
        debugLog('[VISIBILITY] *** AUTO-LOCK TRIGGERED ON FOCUS ***');
        lockApp();
        setLocked(true);
      } else {
        debugLog('[VISIBILITY] No lock needed - timeout not exceeded');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      debugLog('[VISIBILITY] Removing visibility tracking listeners');
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [status?.hasPin, hasPinLocal]);

  // Lock function - only works if PIN exists
  const lock = useCallback(() => {
    const hasPin = status?.hasPin || hasPinLocal;
    if (!hasPin) {
      debugLog('Cannot lock - no PIN');
      return;
    }
    debugLog('=== MANUAL LOCK REQUESTED ===');
    lockApp();
    setLocked(true);
  }, [status?.hasPin, hasPinLocal]);

  // Unlock function
  const unlock = useCallback(() => {
    debugLog('=== UNLOCK REQUESTED ===');
    unlockApp();
    setLocked(false);
  }, []);

  // Calculate whether to show the first-time prompt
  // Show only if: not loading, no PIN exists on server, and prompt not dismissed
  const showPrompt = !isLoading && !status?.hasPin && shouldShowAppLockPrompt();

  // Use server status if available, otherwise fall back to localStorage
  const hasPinOnServer = status?.hasPin ?? hasPinLocal;

  return {
    hasPinOnServer,
    isLocked: locked,
    isLoading,
    showPrompt,
    lock,
    unlock,
    status,
    refresh,
  };
}
