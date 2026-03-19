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
 * 
 * Boot states:
 * - 'booting': Initial load, reading localStorage
 * - 'locked': App is locked, show PIN screen
 * - 'unlocked': App is unlocked, show children
 */

import React, { useState, useEffect, useCallback } from 'react';
import { QuickUnlockScreen } from './QuickUnlockScreen';
import {
  getInitialLockState,
  shouldLockNow,
  lockApp,
  unlockApp,
  recordLastActive,
  getLockTimeout,
  getInactivityGraceMs,
  hasPinInLocalStorage,
  APP_LOCK_CHANGE_EVENT,
  APP_PIN_CHANGE_EVENT,
  type AppLockChangeEventDetail,
  type AppPinChangeEventDetail,
} from '@/services/appLockService';

// Debug logging - always enabled for now to help diagnose issues
function debugLog(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log('[AppLockGate]', ...args);
}

type BootState = 'booting' | 'locked' | 'unlocked';

interface LockState {
  hasPin: boolean;
  isLocked: boolean;
}

/**
 * Read lock state synchronously from localStorage.
 * This MUST be synchronous to prevent any flash of unlocked content.
 * 
 * Decision logic:
 * 1. If no PIN exists → unlocked (nothing to lock with)
 * 2. If PIN exists AND fv_locked is 'true' → locked
 * 3. If PIN exists AND fv_locked is NOT 'true' → check timeout
 * 4. If timeout has elapsed → lock and return locked
 * 5. Otherwise → unlocked
 */
function readLockStateSync(): { state: LockState; bootDecision: BootState } {
  if (typeof window === 'undefined') {
    return { 
      state: { hasPin: false, isLocked: false },
      bootDecision: 'unlocked'
    };
  }

  const state = getInitialLockState();
  
  debugLog('=== BOOT: READING LOCK STATE ===');
  debugLog('fv_pin_exists:', state.hasPin);
  debugLog('fv_locked:', state.isLocked);
  debugLog('fv_app_lock_timeout:', getLockTimeout(), 'seconds');

  // No PIN → can't lock, default to unlocked
  if (!state.hasPin) {
    debugLog('BOOT DECISION: unlocked (no PIN exists)');
    return { state, bootDecision: 'unlocked' };
  }

  // PIN exists AND explicitly locked → show lock screen
  if (state.isLocked) {
    debugLog('BOOT DECISION: locked (fv_locked is true)');
    return { state, bootDecision: 'locked' };
  }

  // PIN exists but not explicitly locked → check timeout
  if (shouldLockNow(true)) {
    debugLog('BOOT DECISION: locked (timeout elapsed since last activity)');
    // Persist the lock state so reload also shows lock
    lockApp();
    return { 
      state: { hasPin: true, isLocked: true },
      bootDecision: 'locked'
    };
  }

  debugLog('BOOT DECISION: unlocked (timeout not elapsed)');
  return { state, bootDecision: 'unlocked' };
}

interface AppLockGateProps {
  children: React.ReactNode;
}

export function AppLockGate({ children }: AppLockGateProps) {
  // Read initial state SYNCHRONOUSLY - this is critical to prevent bypass
  const [bootResult] = useState(() => {
    const result = readLockStateSync();
    debugLog('Initial boot result:', result);
    return result;
  });
  
  const [lockState, setLockState] = useState<LockState>(bootResult.state);
  const [bootState, setBootState] = useState<BootState>('booting');
  const [hasMountedAppOnce, setHasMountedAppOnce] = useState(bootResult.bootDecision !== 'locked');

  // On mount, set the boot decision
  useEffect(() => {
    debugLog('Boot phase complete, decision:', bootResult.bootDecision);
    setBootState(bootResult.bootDecision);
  }, [bootResult.bootDecision]);

  useEffect(() => {
    if (bootState === 'unlocked') setHasMountedAppOnce(true);
  }, [bootState]);

  // Listen for lock state changes from other components
  useEffect(() => {
    const handleLockChange = (event: Event) => {
      const customEvent = event as CustomEvent<AppLockChangeEventDetail>;
      const detail = customEvent.detail;
      
      debugLog('Lock change event received:', detail);
      
      if (detail) {
        // Update both hasPin and isLocked from the event
        const newHasPin = detail.hasPin ?? lockState.hasPin;
        const newIsLocked = detail.locked;
        
        debugLog('Updating lock state:', { hasPin: newHasPin, isLocked: newIsLocked });
        
        setLockState({ hasPin: newHasPin, isLocked: newIsLocked });
        
        // Immediately update boot state based on the new lock state
        if (newHasPin && newIsLocked) {
          debugLog('*** LOCKING APP (event) ***');
          setBootState('locked');
        } else {
          debugLog('*** UNLOCKING APP (event) ***');
          setBootState('unlocked');
        }
      }
    };

    window.addEventListener(APP_LOCK_CHANGE_EVENT, handleLockChange);
    return () => window.removeEventListener(APP_LOCK_CHANGE_EVENT, handleLockChange);
  }, [lockState.hasPin]);

  // Listen for PIN existence changes
  useEffect(() => {
    const handlePinChange = (event: Event) => {
      const customEvent = event as CustomEvent<AppPinChangeEventDetail>;
      const detail = customEvent.detail;
      
      debugLog('PIN change event received:', detail);
      
      if (detail) {
        setLockState(prev => {
          const newState = { ...prev, hasPin: detail.hasPin };
          debugLog('Updated hasPin:', detail.hasPin);
          return newState;
        });
        
        // If PIN was removed, ensure we're unlocked
        if (!detail.hasPin) {
          debugLog('PIN removed - ensuring unlocked state');
          setBootState('unlocked');
        }
      }
    };

    window.addEventListener(APP_PIN_CHANGE_EVENT, handlePinChange);
    return () => window.removeEventListener(APP_PIN_CHANGE_EVENT, handlePinChange);
  }, []);

  // Track visibility changes for auto-lock timeout
  useEffect(() => {
    // Re-read hasPin from localStorage to ensure we have current value
    const currentHasPin = hasPinInLocalStorage();
    
    if (!currentHasPin) {
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
        // Re-check PIN exists in case it was removed while hidden
        const hasPin = hasPinInLocalStorage();
        if (hasPin && shouldLockNow(true)) {
          debugLog('[VISIBILITY] *** AUTO-LOCK TRIGGERED ***');
          lockApp();
          setLockState({ hasPin: true, isLocked: true });
          setBootState('locked');
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
      // Re-check PIN exists
      const hasPin = hasPinInLocalStorage();
      if (hasPin && shouldLockNow(true)) {
        debugLog('[VISIBILITY] *** AUTO-LOCK TRIGGERED ON FOCUS ***');
        lockApp();
        setLockState({ hasPin: true, isLocked: true });
        setBootState('locked');
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

  // Track in-app activity and lock only after real inactivity.
  useEffect(() => {
    if (bootState !== 'unlocked') return;
    if (!lockState.hasPin) return;

    let lastInteractionAt = Date.now();
    let inactivityStartAt: number | null = null;
    let didRecordInactivityStart = false;
    const timeoutMs = getLockTimeout() * 1000;
    const inactivityGraceMs = getInactivityGraceMs();

    const markInteraction = () => {
      lastInteractionAt = Date.now();
      inactivityStartAt = null;
      didRecordInactivityStart = false;
    };

    const checkInactivity = () => {
      if (document.hidden) return;
      const now = Date.now();
      const idleMs = now - lastInteractionAt;

      if (idleMs < inactivityGraceMs) return;

      if (inactivityStartAt == null) {
        inactivityStartAt = now;
      }

      if (!didRecordInactivityStart) {
        recordLastActive();
        didRecordInactivityStart = true;
      }

      const inactivityElapsedMs = now - inactivityStartAt;
      if (inactivityElapsedMs >= timeoutMs) {
        debugLog('[INACTIVITY] *** AUTO-LOCK TRIGGERED ***');
        lockApp();
        setLockState({ hasPin: true, isLocked: true });
        setBootState('locked');
      }
    };

    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((evt) => window.addEventListener(evt, markInteraction, { passive: true }));
    const interval = window.setInterval(checkInactivity, 1000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, markInteraction));
      window.clearInterval(interval);
    };
  }, [bootState, lockState.hasPin]);

  // Handle unlock - called when PIN is entered correctly
  const handleUnlock = useCallback(() => {
    debugLog('=== UNLOCK FROM GATE ===');
    unlockApp();
    setLockState(prev => ({ ...prev, isLocked: false }));
    setBootState('unlocked');
  }, []);

  // Handle switching to password login
  const handleSwitchToPassword = useCallback(() => {
    debugLog('Switching to password login');
    // Clear lock state and redirect to sign-in
    unlockApp();
    setLockState(prev => ({ ...prev, isLocked: false }));
    setBootState('unlocked');
    // Force navigation to sign-in
    window.location.href = '/sign-in';
  }, []);

  // During boot, show a minimal splash to prevent flash of content
  if (bootState === 'booting') {
    debugLog('Booting - showing splash');
    return (
      <div 
        className="min-h-screen flex items-center justify-center bg-background"
        aria-busy="true"
        aria-label="Loading FarmVault"
      >
        <div className="h-12 w-12 rounded-full bg-primary/10 animate-pulse" />
      </div>
    );
  }

  // If locked, show ONLY the lock screen - block everything else
  if (bootState === 'locked') {
    debugLog('=== SHOWING LOCK SCREEN (GATE LEVEL) ===');
    debugLog('bootState:', bootState);
    debugLog('lockState:', lockState);

    // If app has never been mounted in this session, show lock screen only.
    // If it was already mounted, keep it mounted and overlay lock screen so user returns to exact state.
    if (!hasMountedAppOnce) {
      return (
        <QuickUnlockScreen
          onUnlocked={handleUnlock}
          onSwitchToPassword={handleSwitchToPassword}
        />
      );
    }

    return (
      <>
        {children}
        <div className="fixed inset-0 z-[9999]">
          <QuickUnlockScreen
            onUnlocked={handleUnlock}
            onSwitchToPassword={handleSwitchToPassword}
          />
        </div>
      </>
    );
  }

  // Unlocked - render children normally
  debugLog('App is unlocked - rendering children');
  return <>{children}</>;
}
