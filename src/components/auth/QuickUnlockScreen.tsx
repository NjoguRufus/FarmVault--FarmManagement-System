/**
 * QuickUnlockScreen component.
 * Shows a PIN entry screen to unlock the app on a trusted device.
 * Fallback to full password login is always available.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Lock, ArrowLeft, Loader2, AlertCircle, Fingerprint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { verifyPin, getDeviceAppLockStatus } from '@/services/appLockService';
import { cn } from '@/lib/utils';

interface QuickUnlockScreenProps {
  onUnlocked: () => void;
  onSwitchToPassword: () => void;
  userName?: string;
}

export function QuickUnlockScreen({
  onUnlocked,
  onSwitchToPassword,
  userName,
}: QuickUnlockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(5);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // Check lock status on mount
  useEffect(() => {
    async function checkStatus() {
      try {
        const status = await getDeviceAppLockStatus();
        if (status.isLocked && status.lockedUntil) {
          setIsLocked(true);
          setLockedUntil(status.lockedUntil);
        }
        setBiometricAvailable(status.fingerprintEnabled || status.faceEnabled);
      } catch (err) {
        console.error('[QuickUnlock] Failed to check status:', err);
      }
    }
    checkStatus();
  }, []);

  // Auto-submit when PIN is 4-6 digits
  useEffect(() => {
    if (pin.length >= 4 && pin.length <= 6 && !verifying && !isLocked) {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const handleVerify = useCallback(async () => {
    if (pin.length < 4) {
      setError('Enter at least 4 digits');
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      const isValid = await verifyPin(pin);

      if (isValid) {
        // Call the unlock callback - the parent (App.tsx) handles unlockApp()
        // which records the unlock timestamp and clears the lock state
        onUnlocked();
      } else {
        const newAttempts = attemptsRemaining - 1;
        setAttemptsRemaining(newAttempts);
        setPin('');

        if (newAttempts <= 0) {
          setIsLocked(true);
          setLockedUntil(new Date(Date.now() + 5 * 60 * 1000));
          setError('Too many failed attempts. Try again in 5 minutes or use password login.');
        } else {
          setError(`Incorrect PIN. ${newAttempts} ${newAttempts === 1 ? 'attempt' : 'attempts'} remaining.`);
        }
      }
    } catch (err) {
      setError('Failed to verify PIN. Please try again.');
      setPin('');
    } finally {
      setVerifying(false);
    }
  }, [pin, attemptsRemaining, onUnlocked]);

  const handleDigitPress = (digit: string) => {
    if (isLocked || verifying) return;
    if (pin.length < 6) {
      setPin((prev) => prev + digit);
      setError(null);
    }
  };

  const handleBackspace = () => {
    if (isLocked || verifying) return;
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    if (isLocked || verifying) return;
    setPin('');
    setError(null);
  };

  // Countdown timer for locked state
  const [lockCountdown, setLockCountdown] = useState<string | null>(null);
  useEffect(() => {
    if (!isLocked || !lockedUntil) return;

    const updateCountdown = () => {
      const now = new Date();
      const diff = lockedUntil.getTime() - now.getTime();

      if (diff <= 0) {
        setIsLocked(false);
        setLockedUntil(null);
        setLockCountdown(null);
        setAttemptsRemaining(5);
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setLockCountdown(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [isLocked, lockedUntil]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Welcome back</h1>
            {userName && (
              <p className="text-sm text-muted-foreground mt-1">{userName}</p>
            )}
          </div>
        </div>

        {/* PIN display */}
        <div className="space-y-4">
          <p className="text-center text-sm text-muted-foreground">
            {isLocked ? 'Account temporarily locked' : 'Enter your PIN to unlock'}
          </p>

          {/* PIN dots */}
          <div className="flex justify-center gap-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={cn(
                  'h-3 w-3 rounded-full transition-all',
                  i < pin.length
                    ? 'bg-primary scale-110'
                    : 'bg-muted-foreground/30',
                  verifying && 'animate-pulse'
                )}
              />
            ))}
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center justify-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          {/* Lock countdown */}
          {isLocked && lockCountdown && (
            <div className="text-center">
              <span className="text-sm text-muted-foreground">Try again in </span>
              <span className="text-sm font-mono font-medium text-foreground">
                {lockCountdown}
              </span>
            </div>
          )}
        </div>

        {/* Number pad */}
        {!isLocked && (
          <div className="grid grid-cols-3 gap-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', ''].map((digit, i) => {
              if (digit === '' && i === 9) {
                // Empty space or biometric button
                return biometricAvailable ? (
                  <button
                    key="biometric"
                    type="button"
                    className="h-14 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors"
                    disabled
                    title="Biometric unlock coming soon"
                  >
                    <Fingerprint className="h-6 w-6" />
                  </button>
                ) : (
                  <div key="empty-left" />
                );
              }
              if (digit === '' && i === 11) {
                // Backspace button
                return (
                  <button
                    key="backspace"
                    type="button"
                    onClick={handleBackspace}
                    disabled={verifying}
                    className="h-14 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
                  >
                    <ArrowLeft className="h-6 w-6" />
                  </button>
                );
              }
              return (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handleDigitPress(digit)}
                  disabled={verifying}
                  className="h-14 rounded-xl bg-muted/50 hover:bg-muted text-xl font-medium text-foreground transition-colors disabled:opacity-50 active:scale-95"
                >
                  {digit}
                </button>
              );
            })}
          </div>
        )}

        {/* Verifying indicator */}
        {verifying && (
          <div className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {pin.length > 0 && !verifying && !isLocked && (
            <Button
              onClick={handleClear}
              variant="ghost"
              size="sm"
              className="w-full"
            >
              Clear
            </Button>
          )}

          <Button
            onClick={onSwitchToPassword}
            variant="ghost"
            className="w-full text-muted-foreground"
          >
            <Lock className="h-4 w-4 mr-2" />
            Use password instead
          </Button>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-muted-foreground">
          FarmVault • Your farm data is secure
        </p>
      </div>
    </div>
  );
}
