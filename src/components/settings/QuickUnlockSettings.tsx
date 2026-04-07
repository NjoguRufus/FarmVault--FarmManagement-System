import { logger } from "@/lib/logger";
/**
 * Quick Unlock Settings component.
 * Allows users to enable/disable PIN-based quick unlock on their device.
 * 
 * PIN Creation Flow:
 * 1. When no PIN exists, show "Create PIN" card with inline form
 * 2. User enters and confirms PIN
 * 3. After creation, the creation card disappears
 * 4. Show "Lock now", "Change PIN", "Disable" options
 */

import React, { useState, useEffect, useRef } from 'react';
import { Shield, Lock, Fingerprint, Smartphone, Loader2, Check, X, AlertCircle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  enableQuickUnlock,
  disableQuickUnlock,
  getDeviceAppLockStatus,
  updatePin,
  verifyPin,
  getLockTimeout,
  setLockTimeout,
  getInactivityGraceMs,
  setInactivityGraceMs,
  lockApp,
  hasPinInLocalStorage,
  checkBiometricCapabilities,
  clearPinSetupSkipped,
  dismissPrompt,
  type DeviceAppLockStatus,
} from '@/services/appLockService';
import { cn } from '@/lib/utils';

// Debug logging
function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  logger.log('[QuickUnlockSettings]', ...args);
}

export function QuickUnlockSettings() {
  const [status, setStatus] = useState<DeviceAppLockStatus | null>(null);
  const [biometricCapabilities, setBiometricCapabilities] = useState<{
    available: boolean;
    fingerprint: boolean;
    face: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [pin, setPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [timeoutSeconds, setTimeoutSeconds] = useState<number>(() => getLockTimeout());
  const [inactivityGraceMs, setInactivityGraceMsState] = useState<number>(() => getInactivityGraceMs());
  
  // Track if user has started creating a PIN (for the creation flow)
  const [isCreatingPin, setIsCreatingPin] = useState(false);
  
  // Refs for auto-focus
  const pinInputRef = useRef<HTMLInputElement>(null);
  const confirmPinInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

  // Load current status
  useEffect(() => {
    async function loadStatus() {
      try {
        log('Loading device status...');
        const [appLockStatus, bioCaps] = await Promise.all([
          getDeviceAppLockStatus(),
          checkBiometricCapabilities(),
        ]);
        log('Status loaded:', appLockStatus);
        setStatus(appLockStatus);
        setBiometricCapabilities(bioCaps);
      } catch (err) {
        console.error('[QuickUnlock] Failed to load status:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStatus();
  }, []);

  const resetPinState = () => {
    setIsCreatingPin(false);
    setIsChangingPin(false);
    setShowDisableConfirm(false);
    setPin('');
    setCurrentPin('');
    setConfirmPin('');
    setPinError(null);
  };

  const handleEnableOrChangePin = async () => {
    log('handleEnableOrChangePin called', { isChangingPin, pinLength: pin.length });
    setPinError(null);

    // When changing an existing PIN, require current PIN
    if (isChangingPin) {
      if (!currentPin || currentPin.length < 4) {
        setPinError('Enter your current PIN');
        return;
      }
    }

    // Validate new PIN (must be exactly 4 digits)
    if (pin.length !== 4) {
      setPinError('PIN must be exactly 4 digits');
      return;
    }
    if (!/^\d+$/.test(pin)) {
      setPinError('PIN must only contain numbers');
      return;
    }
    if (pin !== confirmPin) {
      setPinError('PINs do not match');
      return;
    }

    setSaving(true);
    try {
      if (isChangingPin) {
        log('Updating PIN...');
        await updatePin(currentPin, pin);
      } else {
        log('Enabling quick unlock with new PIN...');
        await enableQuickUnlock(pin);
        // Clear the "skipped setup" flag and dismiss prompt since user is now setting up PIN
        clearPinSetupSkipped();
        dismissPrompt();
      }
      const newStatus = await getDeviceAppLockStatus();
      log('New status after save:', newStatus);
      setStatus(newStatus);
      resetPinState();
      toast({
        title: isChangingPin ? 'PIN updated' : 'PIN created successfully!',
        description: isChangingPin
          ? 'Your quick unlock PIN has been updated.'
          : 'You can now use your PIN to unlock FarmVault on this device.',
      });
    } catch (err) {
      log('Error saving PIN:', err);
      toast({
        title: isChangingPin ? 'Failed to update PIN' : 'Failed to create PIN',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDisableQuickUnlock = async () => {
    setPinError(null);
    setShowDisableConfirm(true);
  };

  const handleConfirmDisableQuickUnlock = async () => {
    setPinError(null);
    // Require PIN confirmation when a PIN exists
    if (status?.hasPin) {
      if (pin.length < 4) {
        setPinError('Enter your PIN to confirm');
        return;
      }
      const valid = await verifyPin(pin);
      if (!valid) {
        setPinError('Incorrect PIN. Quick unlock was not disabled.');
        return;
      }
    }

    setSaving(true);
    try {
      await disableQuickUnlock();
      setStatus({
        hasPin: false,
        fingerprintEnabled: false,
        faceEnabled: false,
        passkeyEnabled: false,
        isLocked: false,
        lockedUntil: null,
      });
      resetPinState();
      toast({
        title: 'Quick unlock disabled',
        description: 'PIN unlock has been removed from this device.',
      });
    } catch (err) {
      toast({
        title: 'Failed to disable quick unlock',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fv-card animate-pulse">
        <div className="h-24 bg-muted/50 rounded-lg" />
      </div>
    );
  }

  const isEnabled = status?.hasPin ?? false;
  
  // Show the PIN creation form when not enabled OR when changing PIN
  const showPinForm = isCreatingPin || isChangingPin;

  return (
    <section className="fv-card space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Quick Unlock</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isEnabled 
              ? 'PIN unlock is enabled. Lock the app or change your PIN below.'
              : 'Create a PIN to unlock FarmVault faster on this device.'}
          </p>
        </div>
      </div>

      {/* Status indicator - only show when PIN exists */}
      {isEnabled && (
        <div className="flex items-center gap-2 text-sm">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-green-600 dark:text-green-400">PIN enabled on this device</span>
        </div>
      )}

      {/* ============================================= */}
      {/* PIN Creation Card - Shows ONLY when no PIN exists and not creating */}
      {/* ============================================= */}
      {!isEnabled && !isCreatingPin && (
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-3">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            <span className="font-medium text-foreground">Create a PIN</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Set up a 4-6 digit PIN to quickly unlock FarmVault without entering your password every time.
          </p>
          <Button
            onClick={() => {
              log('Starting PIN creation flow');
              setIsCreatingPin(true);
              // Auto-focus the PIN input after a short delay
              setTimeout(() => pinInputRef.current?.focus(), 100);
            }}
            className="gap-2 w-full"
            size="lg"
          >
            <Lock className="h-4 w-4" />
            Create PIN
          </Button>
        </div>
      )}

      {/* ============================================= */}
      {/* PIN Form - Shows when creating or changing PIN */}
      {/* ============================================= */}
      {showPinForm && (
        <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border/60">
          <div className="space-y-4">
            {/* Current PIN - only when changing */}
            {isChangingPin && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Current PIN
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  className="fv-input w-full text-center text-xl tracking-[0.5em] font-mono h-12"
                  value={currentPin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setCurrentPin(val);
                    setPinError(null);
                  }}
                  placeholder="••••"
                  autoComplete="off"
                />
              </div>
            )}

            {/* New PIN */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                {isChangingPin ? 'New PIN (4-6 digits)' : 'Choose a PIN (4-6 digits)'}
              </label>
              <input
                ref={pinInputRef}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                className="fv-input w-full text-center text-xl tracking-[0.5em] font-mono h-12"
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setPin(val);
                  setPinError(null);
                  // Auto-focus confirm field when PIN is complete
                  if (val.length >= 4) {
                    setTimeout(() => confirmPinInputRef.current?.focus(), 100);
                  }
                }}
                placeholder="••••"
                autoComplete="off"
              />
              {/* PIN strength indicator */}
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div 
                    key={i} 
                    className={cn(
                      "h-1 flex-1 rounded-full transition-colors",
                      i < pin.length ? "bg-primary" : "bg-muted"
                    )} 
                  />
                ))}
              </div>
            </div>

            {/* Confirm PIN */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Confirm PIN
              </label>
              <input
                ref={confirmPinInputRef}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                className={cn(
                  "fv-input w-full text-center text-xl tracking-[0.5em] font-mono h-12",
                  confirmPin.length > 0 && pin === confirmPin && "border-green-500 focus:border-green-500"
                )}
                value={confirmPin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setConfirmPin(val);
                  setPinError(null);
                }}
                placeholder="••••"
                autoComplete="off"
              />
              {/* Match indicator */}
              {confirmPin.length > 0 && (
                <p className={cn(
                  "text-xs",
                  pin === confirmPin ? "text-green-600" : "text-muted-foreground"
                )}>
                  {pin === confirmPin ? "✓ PINs match" : "PINs don't match yet"}
                </p>
              )}
            </div>

            {/* Error message */}
            {pinError && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2 rounded">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {pinError}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleEnableOrChangePin}
              disabled={saving || pin.length < 4 || pin !== confirmPin}
              className="gap-2 flex-1"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {isChangingPin ? 'Update PIN' : 'Create PIN'}
            </Button>
            <Button
              variant="ghost"
              onClick={resetPinState}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ============================================= */}
      {/* Actions when PIN is enabled */}
      {/* ============================================= */}
      {isEnabled && !showPinForm && !showDisableConfirm && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button
              variant="default"
              onClick={() => {
                log('Lock now clicked');
                // Verify PIN exists before locking
                const hasPin = hasPinInLocalStorage();
                if (!hasPin) {
                  log('Cannot lock - no PIN in localStorage');
                  toast({
                    title: 'Cannot lock',
                    description: 'No PIN is set up. Please create a PIN first.',
                    variant: 'destructive',
                  });
                  return;
                }
                // Lock the app - this will:
                // 1. Set fv_locked = 'true' in localStorage
                // 2. Dispatch APP_LOCK_CHANGE_EVENT with { locked: true, hasPin: true }
                // 3. AppLockGate will receive the event and show the lock screen
                lockApp();
                log('Lock triggered successfully');
              }}
              className="gap-2"
            >
              <Lock className="h-4 w-4" />
              Lock now
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                log('Change PIN clicked');
                setIsChangingPin(true);
                setTimeout(() => pinInputRef.current?.focus(), 100);
              }}
              className="gap-2"
            >
              <Lock className="h-4 w-4" />
              Change PIN
            </Button>
            <Button
              variant="ghost"
              onClick={handleDisableQuickUnlock}
              disabled={saving}
              className="gap-2 text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
              Disable
            </Button>
          </div>
        </div>
      )}

      {/* Disable confirmation */}
      {showDisableConfirm && (
        <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border/60">
          <p className="text-xs text-muted-foreground">
            Enter your PIN to disable quick unlock on this device. You can still log in with your
            password later.
          </p>
          {isEnabled && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">PIN</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d*"
                maxLength={6}
                className="fv-input w-full max-w-[200px] text-center text-lg tracking-widest"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, ''));
                  setPinError(null);
                }}
                placeholder="• • • •"
                autoComplete="off"
              />
            </div>
          )}
          {pinError && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />
              {pinError}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleConfirmDisableQuickUnlock}
              disabled={saving}
              className="gap-2"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              Confirm disable
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setShowDisableConfirm(false);
                setPin('');
                setPinError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Auto-lock timeout */}
      <div className="space-y-2 pt-3 border-t border-border/60">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Auto-lock timeout</span>
          <span className="text-[11px] text-muted-foreground">
            {isEnabled ? 'When the app should relock' : 'Enable PIN unlock to configure'}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[10, 30, 60, 300].map((seconds) => {
            const label =
              seconds < 60
                ? `${seconds}s`
                : seconds === 60
                ? '1 min'
                : `${Math.round(seconds / 60)} min`;
            const selected = timeoutSeconds === seconds;
            return (
              <button
                key={seconds}
                type="button"
                disabled={!isEnabled}
                onClick={() => {
                  const newTimeout = seconds as 10 | 30 | 60 | 300;
                  setTimeoutSeconds(newTimeout);
                  setLockTimeout(newTimeout);
                  toast({
                    title: 'Timeout saved',
                    description: `Auto-lock will trigger after ${label} of inactivity.`,
                    duration: 2000,
                  });
                }}
                className={cn(
                  'text-xs px-2 py-1.5 rounded-full border transition-colors',
                  selected
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:bg-muted/60',
                  !isEnabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        {isEnabled && (
          <p className="text-[11px] text-muted-foreground">
            The app will lock after {timeoutSeconds < 60 ? `${timeoutSeconds} seconds` : timeoutSeconds === 60 ? '1 minute' : `${Math.round(timeoutSeconds / 60)} minutes`} when you leave or switch apps.
          </p>
        )}
      </div>

      {/* Inactivity grace */}
      <div className="space-y-2 pt-3 border-t border-border/60">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Inactivity grace</span>
          <span className="text-[11px] text-muted-foreground">
            {isEnabled ? 'Delay before idle timer starts' : 'Enable PIN unlock to configure'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[2000, 5000, 10000].map((ms) => {
            const label = ms === 2000 ? '2s' : ms === 5000 ? '5s' : '10s';
            const selected = inactivityGraceMs === ms;
            return (
              <button
                key={ms}
                type="button"
                disabled={!isEnabled}
                onClick={() => {
                  const next = ms as 2000 | 5000 | 10000;
                  setInactivityGraceMsState(next);
                  setInactivityGraceMs(next);
                  toast({
                    title: 'Inactivity grace saved',
                    description: `Idle timer starts after ${label} without activity.`,
                    duration: 2000,
                  });
                }}
                className={cn(
                  'text-xs px-2 py-1.5 rounded-full border transition-colors',
                  selected
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:bg-muted/60',
                  !isEnabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        {isEnabled && (
          <p className="text-[11px] text-muted-foreground">
            App Lock waits {Math.round(inactivityGraceMs / 1000)} seconds of no activity before counting down the auto-lock timeout.
          </p>
        )}
      </div>

      {/* Biometric placeholder */}
      <div className="pt-3 border-t border-border/60 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Fingerprint className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Fingerprint / Face ID</span>
          </div>
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
            Coming soon
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Passkey</span>
          </div>
          <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
            Coming soon
          </span>
        </div>

        {biometricCapabilities?.available && (
          <p className="text-[11px] text-muted-foreground">
            Your device supports biometric authentication. This feature will be available soon.
          </p>
        )}
      </div>

      {/* Info note */}
      <p className="text-[11px] text-muted-foreground pt-2 border-t border-border/60">
        Quick unlock is per user and per device. If you clear browser data or use a new device,
        you&apos;ll need to log in with your password first.
      </p>
    </section>
  );
}
