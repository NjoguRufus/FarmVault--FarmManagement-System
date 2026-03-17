/**
 * App Lock Service
 * Handles per-device, per-user PIN-based quick unlock.
 * Secure: PIN is hashed before storage, never stored in plain text.
 */

import { supabase } from '@/lib/supabase';

const DEVICE_KEY = 'fv_device_id';
const LOCK_STATE_KEY = 'fv_app_locked';

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
  }
  return id;
}

/**
 * Hash a PIN for secure storage.
 * Uses a simple but non-reversible approach for client-side.
 * For production, consider moving to server-side KDF (e.g., argon2).
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
}

/**
 * Disable quick unlock for the current device.
 */
export async function disableQuickUnlock(): Promise<void> {
  const deviceId = getOrCreateDeviceId();

  const { error } = await supabase.rpc('disable_quick_unlock', {
    _device_id: deviceId,
  });

  if (error) {
    throw new Error(error.message ?? 'Failed to disable quick unlock');
  }

  // Clear local lock state
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(LOCK_STATE_KEY);
  }
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
 * Check if the app should show the lock screen.
 * Call this on app start after authentication.
 */
export function isAppLocked(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(LOCK_STATE_KEY) === 'true';
}

/**
 * Lock the app (show lock screen on next check).
 */
export function lockApp(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCK_STATE_KEY, 'true');
}

/**
 * Unlock the app (hide lock screen).
 */
export function unlockApp(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LOCK_STATE_KEY);
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
