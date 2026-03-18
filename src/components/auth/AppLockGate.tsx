/**
 * AppLockGate - Root-level lock enforcement component.
 * 
 * CRITICAL: This component MUST wrap the entire app at the ROOT level,
 * BEFORE any providers, routing, or auth logic.
 * 
 * This ensures the lock cannot be bypassed by:
 * - Page reload
 * - Navigation
 * - Auth state changes
 * - Any async operations
 * 
 * The lock state is read SYNCHRONOUSLY from localStorage before any render.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { QuickUnlockScreen } from './QuickUnlockScreen';
import {
  getInitialLockState,
  isAppLocked,
  shouldLockNow,
  lockApp,
  unlockApp,
  recordLastActive,
  getLockTimeout,
  APP_LOCK_CHANGE_EVENT,
} from '@/services/appLockService';

// Debug logging
function debugLog(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log('[AppLockGate]', ...args);
}

/**
 * Read lock state synchronously from localStorage.
 * This MUST be synchronous to prevent any flash of unlocked content.
 */
function readLockStateSync(): { hasPin: boolean; isLocked: boolean } {
  if (typeof window === 'undefined') {
    return { hasPin: false, isLocked: false };
  }

  const state = getInitialLockState();
  
  debugLog('=== BOOT: READING LOCK STATE ===');
  debugLog('fv_pin_exists:', state.hasPin);
  debugLog('fv_locked:', state.isLocked);
  debugLog('fv_app_lock_timeout:', getLockTimeout(), 'seconds');

  // If PIN exists, also check if we should lock due to timeout
  if (state.hasPin && !state.isLocked) {
    // Check if timeout has elapsed since last activity
    if (shouldLockNow(true)) {
      debugLog('BOOT: Timeout elapsed since last activity, locking app');
      lockApp();
      return { hasPin: true, isLocked: true };
    }
  }

  return state;
}

interface AppLockGateProps {
  children: React.ReactNode;
}

export function AppLockGate({ children }: AppLockGateProps) {
  // Read initial state SYNCHRONOUSLY - this is critical to prevent bypass
  const [lockState, setLockState] = useState(() => {
    const state = readLockStateSync();
    debugLog('Initial lock state:', state);
    return state;
  });

  // Track if we're in the "boot" phase (checking initial state)
  const [isBooting, setIsBooting] = useState(true);

  // On mount, finish the boot phase
  useEffect(() => {
    debugLog('Boot phase complete');
    setIsBooting(false);
  }, []);

  // Listen for lock state changes from other components
  useEffect(() => {
    const handleLockChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ locked: boolean }>;
      debugLog('Lock change event received:', customEvent.detail);
      
      if (customEvent.detail?.locked) {
        setLockState(prev => ({ ...prev, isLocked: true }));
      } else {
        setLockState(prev => ({ ...prev, isLocked: false }));
      }
    };

    window.addEventListener(APP_LOCK_CHANGE_EVENT, handleLockChange);
    return () => window.removeEventListener(APP_LOCK_CHANGE_EVENT, handleLockChange);
  }, []);

  // Track visibility changes for auto-lock
  useEffect(() => {
    if (!lockState.hasPin) {
      debugLog('[VISIBILITY] Not tracking - no PIN exists');
      return;
    }

    debugLog('[VISIBILITY] Setting up visibility tracking at root level');

    const handleVisibilityChange = () => {
      if (document.hidden) {
        debugLog('[VISIBILITY] App hidden - recording timestamp');
        recordLastActive();
      } else {
        debugLog('[VISIBILITY] App visible - checking if should lock');
        if (shouldLockNow(true)) {
          debugLog('[VISIBILITY] *** AUTO-LOCK TRIGGERED ***');
          lockApp();
          setLockState(prev => ({ ...prev, isLocked: true }));
        }
      }
    };

    const handleBeforeUnload = () => {
      debugLog('[VISIBILITY] beforeunload - recording timestamp');
      recordLastActive();
    };

    const handleWindowBlur = () => {
      debugLog('[VISIBILITY] Window blur - recording timestamp');
      recordLastActive();
    };

    const handleWindowFocus = () => {
      debugLog('[VISIBILITY] Window focus - checking if should lock');
      if (shouldLockNow(true)) {
        debugLog('[VISIBILITY] *** AUTO-LOCK TRIGGERED ON FOCUS ***');
        lockApp();
        setLockState(prev => ({ ...prev, isLocked: true }));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [lockState.hasPin]);

  // Handle unlock
  const handleUnlock = useCallback(() => {
    debugLog('=== UNLOCK FROM GATE ===');
    unlockApp();
    setLockState(prev => ({ ...prev, isLocked: false }));
  }, []);

  // Handle switching to password login
  const handleSwitchToPassword = useCallback(() => {
    debugLog('Switching to password login');
    // Clear lock state and redirect to sign-in
    unlockApp();
    setLockState(prev => ({ ...prev, isLocked: false }));
    // Force navigation to sign-in
    window.location.href = '/sign-in';
  }, []);

  // During boot, show nothing to prevent flash
  if (isBooting) {
    debugLog('Booting - showing nothing');
    return null;
  }

  // If locked, show ONLY the lock screen - block everything else
  if (lockState.hasPin && lockState.isLocked) {
    debugLog('=== SHOWING LOCK SCREEN (GATE LEVEL) ===');
    debugLog('App is locked - all content blocked');
    
    return (
      <QuickUnlockScreen
        onUnlocked={handleUnlock}
        onSwitchToPassword={handleSwitchToPassword}
      />
    );
  }

  // Not locked - render children normally
  debugLog('App is unlocked - rendering children');
  return <>{children}</>;
}
