/**
 * App Lock Service
 * Handles per-device, per-user PIN-based quick unlock.
 * 
 * IMPORTANT: Quick Unlock is an OPTIONAL local security layer on top of normal login.
 * It does NOT replace cloud/account authentication.
 * 
 * Secure: PIN is hashed before storage, never stored in plain text.
 *
 * Storage keys (all in localStorage, device-specific):
 * - fv_device_id: Unique device identifier
 * - fv_locked: Explicit lock state ('true' if locked, 'false' if unlocked)
 * - fv_pin_exists: Whether a PIN has been created ('true' when PIN exists)
 * - fv_app_lock_timeout: Auto-lock timeout in seconds (10, 30, 60, 300)
 * - fv_app_last_active: Timestamp when user last left the app
 * - fv_app_unlocked_at: Timestamp when PIN was last successfully entered
 * - fv_pin_setup_skipped: User skipped PIN setup for this session
 * 
 * CRITICAL RULE: The PIN lock screen should ONLY appear when:
 * 1. A PIN has been created and verified on the server (fv_pin_exists = 'true')
 * 2. The app is in a locked state (fv_locked = 'true')
 * 
 * Lock state persists across page reloads via localStorage.
 * If no PIN exists on the server, NEVER show the PIN lock screen.
 */

import { supabase } from '@/lib/supabase';

const DEVICE_KEY = 'fv_device_id';
const LOCK_STATE_KEY = 'fv_locked'; // "true" when locked, "false" when unlocked
const PIN_EXISTS_KEY = 'fv_pin_exists'; // "true" when PIN is created on server
const LOCK_TIMEOUT_KEY = 'fv_app_lock_timeout';
const LAST_ACTIVE_KEY = 'fv_app_last_active';
const UNLOCKED_AT_KEY = 'fv_app_unlocked_at';
const PIN_SETUP_SKIPPED_KEY = 'fv_pin_setup_skipped';
const PROMPT_DISMISSED_KEY = 'fv_app_lock_prompt_dismissed';
// Version key to track migrations - increment when we need to reset state
const STATE_VERSION_KEY = 'fv_quick_unlock_version';
const CURRENT_STATE_VERSION = '4'; // Increment this to force reset of broken states

export type LockTimeoutSeconds = 10 | 30 | 60 | 300;

// Debug flag - always log for now to help debug issues
const DEBUG_LOCK = true;

function debugLog(...args: unknown[]): void {
  if (DEBUG_LOCK) {
    // eslint-disable-next-line no-console
    console.log('[AppLock]', ...args);
  }
}

/**
 * MIGRATION: Reset broken Quick Unlock state.
 * This clears stale localStorage data that causes the PIN screen to appear
 * when no PIN was ever properly set up.
 * 
 * Call this ONCE at app startup before any other Quick Unlock logic runs.
 */
export function migrateQuickUnlockState(): void {
  if (typeof window === 'undefined') return;
  
  const currentVersion = window.localStorage.getItem(STATE_VERSION_KEY);
  
  if (currentVersion !== CURRENT_STATE_VERSION) {
    debugLog('=== MIGRATING QUICK UNLOCK STATE ===');
    debugLog('Old version:', currentVersion, '-> New version:', CURRENT_STATE_VERSION);
    
    // Clear all lock-related state to start fresh
    // This fixes users who got stuck with broken lock state
    window.localStorage.removeItem(LOCK_STATE_KEY);
    window.localStorage.removeItem(PIN_EXISTS_KEY);
    window.localStorage.removeItem(LAST_ACTIVE_KEY);
    window.localStorage.removeItem(UNLOCKED_AT_KEY);
    window.localStorage.removeItem(PIN_SETUP_SKIPPED_KEY);
    window.localStorage.removeItem(PROMPT_DISMISSED_KEY);
    // Also remove old key name if it exists
    window.localStorage.removeItem('fv_app_locked');
    // Keep device ID and timeout preference
    
    // Mark migration as complete
    window.localStorage.setItem(STATE_VERSION_KEY, CURRENT_STATE_VERSION);
    
    debugLog('Quick Unlock state reset complete - users will start fresh');
  }
}

/**
 * Reset ALL Quick Unlock state including device preferences.
 * Use this for debugging or when user explicitly wants to start fresh.
 */
export function resetAllQuickUnlockState(): void {
  if (typeof window === 'undefined') return;
  
  debugLog('=== RESETTING ALL QUICK UNLOCK STATE ===');
  
  window.localStorage.removeItem(LOCK_STATE_KEY);
  window.localStorage.removeItem(PIN_EXISTS_KEY);
  window.localStorage.removeItem(LAST_ACTIVE_KEY);
  window.localStorage.removeItem(UNLOCKED_AT_KEY);
  window.localStorage.removeItem(PIN_SETUP_SKIPPED_KEY);
  window.localStorage.removeItem(LOCK_TIMEOUT_KEY);
  window.localStorage.removeItem(STATE_VERSION_KEY);
  // Keep device ID to maintain server association
  
  debugLog('All Quick Unlock state cleared');
}

/**
 * Check if user skipped PIN setup for this session.
 */
export function isPinSetupSkipped(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(PIN_SETUP_SKIPPED_KEY) === 'true';
}

/**
 * Mark that user skipped PIN setup.
 * They can still set it up later from Settings.
 */
export function skipPinSetup(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PIN_SETUP_SKIPPED_KEY, 'true');
  debugLog('PIN setup skipped by user');
}

/**
 * Clear the skipped flag (e.g., when user wants to set up PIN later).
 */
export function clearPinSetupSkipped(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PIN_SETUP_SKIPPED_KEY);
  debugLog('PIN setup skipped flag cleared');
}

/**
 * Check if the first-time App Lock prompt has been dismissed.
 */
export function isPromptDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(PROMPT_DISMISSED_KEY) === 'true';
}

/**
 * Mark the first-time prompt as dismissed.
 * Called when user either creates a PIN or skips.
 */
export function dismissPrompt(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROMPT_DISMISSED_KEY, 'true');
  debugLog('App Lock prompt dismissed');
}

/**
 * Check if we should show the first-time App Lock prompt.
 * Returns true if:
 * - The prompt hasn't been dismissed
 * - AND no PIN exists yet
 */
export function shouldShowAppLockPrompt(): boolean {
  if (typeof window === 'undefined') return false;
  const dismissed = isPromptDismissed();
  debugLog('shouldShowAppLockPrompt: dismissed =', dismissed);
  return !dismissed;
}

/**
 * Get or create a unique device ID stored in localStorage.
 * This identifies the current device for quick unlock purposes.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '';
  let id = window.localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, id);
    debugLog('Created new device ID:', id);
  }
  return id;
}

/**
 * Hash a PIN for secure storage.
 * Uses SHA-256 with a salt. PIN is never stored in plain text.
 */
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + 'fv_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface DeviceAppLockStatus {
  hasPin: boolean;
  fingerprintEnabled: boolean;
  faceEnabled: boolean;
  passkeyEnabled: boolean;
  isLocked: boolean;
  lockedUntil: Date | null;
}

/**
 * Get the configured auto-lock timeout from localStorage.
 * Default is 60 seconds (1 minute).
 */
export function getLockTimeout(): LockTimeoutSeconds {
  if (typeof window === 'undefined') return 60;
  const raw = window.localStorage.getItem(LOCK_TIMEOUT_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (parsed === 10 || parsed === 30 || parsed === 60 || parsed === 300) {
    debugLog('[TIMEOUT] Loaded timeout from localStorage:', parsed, 'seconds');
    return parsed;
  }
  debugLog('[TIMEOUT] No valid timeout in localStorage, using default: 60 seconds');
  return 60;
}

/**
 * Save the auto-lock timeout to localStorage.
 * This is device-specific and persists across sessions.
 */
export function setLockTimeout(timeout: LockTimeoutSeconds): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCK_TIMEOUT_KEY, String(timeout));
  debugLog('[TIMEOUT] Saved timeout to localStorage:', timeout, 'seconds');
}

/**
 * Record the current timestamp as "last hidden".
 * Called when the user leaves the app (tab hidden, window blur, etc.)
 * This is used to calculate elapsed time when user returns.
 */
export function recordLastActive(): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  window.localStorage.setItem(LAST_ACTIVE_KEY, String(now));
  debugLog('[TIMER] === APP HIDDEN/BLURRED ===');
  debugLog('[TIMER] Saved fv_app_last_active:', new Date(now).toISOString());
  debugLog('[TIMER] Current timeout setting:', getLockTimeout(), 'seconds');
}

/**
 * Get the timestamp when the app was last successfully unlocked via PIN.
 * Returns null if never unlocked or data is invalid.
 */
export function getUnlockedAt(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(UNLOCKED_AT_KEY);
  if (!raw) return null;
  const ts = Number.parseInt(raw, 10);
  return Number.isFinite(ts) ? ts : null;
}

/**
 * Record when the PIN was successfully entered.
 * This is used to determine if the user needs to re-enter PIN on fresh load.
 */
export function recordUnlockedAt(): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  window.localStorage.setItem(UNLOCKED_AT_KEY, String(now));
  debugLog('Recorded unlocked at:', new Date(now).toISOString());
}

/**
 * Determine if the app should be locked based on timeout logic.
 *
 * The app should lock if:
 * 1. There's a last_active timestamp AND elapsed time >= timeout
 * 2. OR there's no unlocked_at timestamp (never unlocked this session)
 * 3. OR the unlocked_at timestamp is older than the timeout
 *
 * @param hasPin - Whether Quick Unlock is enabled (PIN exists)
 */
export function shouldLockNow(hasPin: boolean = true): boolean {
  if (typeof window === 'undefined') return false;
  if (!hasPin) {
    debugLog('[TIMER] shouldLockNow: No PIN exists, returning false');
    return false;
  }

  const timeout = getLockTimeout();
  const now = Date.now();
  
  debugLog('[TIMER] === CHECKING IF SHOULD LOCK ===');
  debugLog('[TIMER] Current timeout setting:', timeout, 'seconds');

  // Check if there's a "last active" timestamp (user left and returned)
  const lastActiveRaw = window.localStorage.getItem(LAST_ACTIVE_KEY);
  if (lastActiveRaw) {
    const lastActive = Number.parseInt(lastActiveRaw, 10);
    if (Number.isFinite(lastActive)) {
      const elapsedMs = now - lastActive;
      const elapsedSeconds = Math.round(elapsedMs / 1000);
      const timeoutMs = timeout * 1000;
      const shouldLock = elapsedMs >= timeoutMs;
      
      debugLog('[TIMER] Last hidden check:');
      debugLog('[TIMER]   - Hidden at:', new Date(lastActive).toISOString());
      debugLog('[TIMER]   - Now:', new Date(now).toISOString());
      debugLog('[TIMER]   - Elapsed:', elapsedSeconds, 'seconds (' + elapsedMs + 'ms)');
      debugLog('[TIMER]   - Timeout:', timeout, 'seconds (' + timeoutMs + 'ms)');
      debugLog('[TIMER]   - Should lock?', shouldLock ? 'YES (elapsed >= timeout)' : 'NO (elapsed < timeout)');
      
      if (shouldLock) {
        debugLog('[TIMER] *** TIMER EXPIRED - LOCKING APP ***');
        return true;
      } else {
        debugLog('[TIMER] Timer not expired yet, app stays unlocked');
      }
    }
  } else {
    debugLog('[TIMER] No last_active timestamp found (app was not hidden recently)');
  }

  // Check if there's an "unlocked at" timestamp (fresh load scenario)
  const unlockedAt = getUnlockedAt();
  if (unlockedAt === null) {
    debugLog('[TIMER] No unlock timestamp found - this is a fresh session, requiring PIN');
    return true;
  }

  // Check if the unlock timestamp is too old
  const unlockElapsedMs = now - unlockedAt;
  const unlockElapsedSeconds = Math.round(unlockElapsedMs / 1000);
  const unlockExpired = unlockElapsedMs >= timeout * 1000;
  
  debugLog('[TIMER] Unlock timestamp check:');
  debugLog('[TIMER]   - Unlocked at:', new Date(unlockedAt).toISOString());
  debugLog('[TIMER]   - Elapsed since unlock:', unlockElapsedSeconds, 'seconds');
  debugLog('[TIMER]   - Timeout:', timeout, 'seconds');
  debugLog('[TIMER]   - Session expired?', unlockExpired ? 'YES' : 'NO');

  return unlockExpired;
}

/**
 * Check if quick unlock is enabled for the current device.
 */
export async function getDeviceAppLockStatus(): Promise<DeviceAppLockStatus> {
  const deviceId = getOrCreateDeviceId();
  if (!deviceId) {
    return {
      hasPin: false,
      fingerprintEnabled: false,
      faceEnabled: false,
      passkeyEnabled: false,
      isLocked: false,
      lockedUntil: null,
    };
  }

  const { data, error } = await supabase.rpc('get_device_app_lock', {
    _device_id: deviceId,
  });

  if (error || !data || data.length === 0) {
    return {
      hasPin: false,
      fingerprintEnabled: false,
      faceEnabled: false,
      passkeyEnabled: false,
      isLocked: false,
      lockedUntil: null,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    hasPin: Boolean(row.has_pin),
    fingerprintEnabled: Boolean(row.fingerprint_enabled),
    faceEnabled: Boolean(row.face_enabled),
    passkeyEnabled: Boolean(row.passkey_enabled),
    isLocked: Boolean(row.is_locked),
    lockedUntil: row.locked_until ? new Date(row.locked_until) : null,
  };
}

/**
 * Enable quick unlock with a PIN.
 * PIN must be 4-6 digits.
 */
export async function enableQuickUnlock(
  pin: string,
  options?: { fingerprint?: boolean; face?: boolean }
): Promise<void> {
  if (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
    throw new Error('PIN must be 4-6 digits');
  }

  const deviceId = getOrCreateDeviceId();
  const pinHash = await hashPin(pin);

  const { error } = await supabase.rpc('enable_quick_unlock', {
    _device_id: deviceId,
    _pin_hash: pinHash,
    _fingerprint: options?.fingerprint ?? false,
    _face: options?.face ?? false,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to enable quick unlock');
  }
  
  // Set PIN exists flag in localStorage so we know to show lock screen on reload
  setPinExistsFlag(true);
  debugLog('PIN created successfully - fv_pin_exists set to "true"');
}

/**
 * Disable quick unlock for the current device.
 * Removes the PIN from the server and clears all local Quick Unlock state.
 */
export async function disableQuickUnlock(): Promise<void> {
  const deviceId = getOrCreateDeviceId();

  const { error } = await supabase.rpc('disable_quick_unlock', {
    _device_id: deviceId,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to disable quick unlock');
  }

  // Clear all local Quick Unlock state including PIN exists flag
  clearQuickUnlockState();
  debugLog('Quick unlock disabled - all local state cleared');
}

/**
 * Verify a PIN for quick unlock.
 * Returns true if PIN is correct, false otherwise.
 */
export async function verifyPin(pin: string): Promise<boolean> {
  const deviceId = getOrCreateDeviceId();
  const pinHash = await hashPin(pin);

  const { data, error } = await supabase.rpc('verify_quick_unlock_pin', {
    _device_id: deviceId,
    _pin_hash: pinHash,
  });

  if (error) {
    console.error('[AppLock] PIN verification error:', error);
    return false;
  }

  return Boolean(data);
}

/**
 * Check if PIN exists flag is set in localStorage.
 * This is set when a PIN is successfully created on the server.
 */
export function hasPinInLocalStorage(): boolean {
  if (typeof window === 'undefined') return false;
  const hasPin = window.localStorage.getItem(PIN_EXISTS_KEY) === 'true';
  debugLog('hasPinInLocalStorage:', hasPin);
  return hasPin;
}

/**
 * Set the PIN exists flag in localStorage.
 * Called after PIN is successfully created on the server.
 */
export function setPinExistsFlag(exists: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PIN_EXISTS_KEY, exists ? 'true' : 'false');
  debugLog('setPinExistsFlag:', exists);
}

/**
 * Check if the app has an explicit lock flag set.
 * This is separate from the timeout-based lock logic.
 */
export function isAppLocked(): boolean {
  if (typeof window === 'undefined') return false;
  const locked = window.localStorage.getItem(LOCK_STATE_KEY) === 'true';
  debugLog('isAppLocked:', locked);
  return locked;
}

/**
 * Get the initial lock state synchronously from localStorage.
 * This is used to hydrate React state BEFORE server calls.
 * Returns { hasPin, isLocked } based on localStorage only.
 */
export function getInitialLockState(): { hasPin: boolean; isLocked: boolean } {
  if (typeof window === 'undefined') {
    return { hasPin: false, isLocked: false };
  }
  
  const hasPin = window.localStorage.getItem(PIN_EXISTS_KEY) === 'true';
  const isLocked = window.localStorage.getItem(LOCK_STATE_KEY) === 'true';
  
  debugLog('getInitialLockState from localStorage:', { hasPin, isLocked });
  
  return { hasPin, isLocked };
}

/**
 * Custom event name for app lock state changes.
 * Components can listen for this to react to lock/unlock.
 */
export const APP_LOCK_CHANGE_EVENT = 'fv-app-lock-change';

/**
 * Set the explicit lock flag.
 * This marks the app as locked so the lock screen will show.
 * Dispatches a custom event so React components can react immediately.
 */
export function lockApp(): void {
  if (typeof window === 'undefined') return;
  
  // Set lock state to true - this persists across reload
  window.localStorage.setItem(LOCK_STATE_KEY, 'true');
  debugLog('=== APP LOCKED ===');
  debugLog('localStorage fv_locked set to "true"');
  
  // Dispatch custom event for React components to react immediately
  window.dispatchEvent(new CustomEvent(APP_LOCK_CHANGE_EVENT, { detail: { locked: true } }));
}

/**
 * Clear the lock flag and record the unlock timestamp.
 * This is called after successful PIN verification.
 * Dispatches a custom event so React components can react immediately.
 */
export function unlockApp(): void {
  if (typeof window === 'undefined') return;
  
  // Set lock state to false - this persists across reload
  window.localStorage.setItem(LOCK_STATE_KEY, 'false');
  window.localStorage.removeItem(LAST_ACTIVE_KEY);
  recordUnlockedAt();
  debugLog('=== APP UNLOCKED ===');
  debugLog('localStorage fv_locked set to "false"');
  
  // Dispatch custom event for React components to react immediately
  window.dispatchEvent(new CustomEvent(APP_LOCK_CHANGE_EVENT, { detail: { locked: false } }));
}

/**
 * Clear all Quick Unlock state from localStorage.
 * Call this on logout to ensure fresh state on next login.
 * Does NOT clear the device ID - that persists to identify the device.
 */
export function clearQuickUnlockState(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LOCK_STATE_KEY);
  window.localStorage.removeItem(PIN_EXISTS_KEY);
  window.localStorage.removeItem(LAST_ACTIVE_KEY);
  window.localStorage.removeItem(UNLOCKED_AT_KEY);
  // Note: We keep LOCK_TIMEOUT_KEY as a device preference
  debugLog('Quick unlock state cleared (fv_locked, fv_pin_exists, etc.)');
}

/**
 * Update PIN (requires old PIN verification first).
 */
export async function updatePin(oldPin: string, newPin: string): Promise<void> {
  // Verify old PIN first
  const isValid = await verifyPin(oldPin);
  if (!isValid) {
    throw new Error('Current PIN is incorrect');
  }

  // Enable with new PIN
  await enableQuickUnlock(newPin);
}

/**
 * Check if biometric authentication is available on this device.
 * Returns capabilities object.
 */
export async function checkBiometricCapabilities(): Promise<{
  available: boolean;
  fingerprint: boolean;
  face: boolean;
  passkey: boolean;
}> {
  // Check if WebAuthn is available
  const webauthnAvailable =
    typeof window !== 'undefined' &&
    window.PublicKeyCredential !== undefined;

  if (!webauthnAvailable) {
    return {
      available: false,
      fingerprint: false,
      face: false,
      passkey: false,
    };
  }

  // Check for platform authenticator (biometric)
  let platformAuthenticator = false;
  try {
    platformAuthenticator = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    platformAuthenticator = false;
  }

  return {
    available: platformAuthenticator,
    fingerprint: platformAuthenticator, // Can't distinguish between types client-side
    face: platformAuthenticator,
    passkey: webauthnAvailable,
  };
}
