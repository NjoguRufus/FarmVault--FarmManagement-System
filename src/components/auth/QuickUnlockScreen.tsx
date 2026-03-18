/**
 * QuickUnlockScreen component.
 * Shows a PIN entry screen to unlock the app on a trusted device.
 * Fallback to full password login is always available.
 * 
 * Mobile-optimized with proper touch handling and visual feedback.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Shield, Lock, Delete, Loader2, AlertCircle, Fingerprint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { verifyPin, getDeviceAppLockStatus } from '@/services/appLockService';
import { cn } from '@/lib/utils';

// Debug logging
function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log('[QuickUnlock]', ...args);
}

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
  
  // Track which button is being pressed for visual feedback
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  
  // Ref to prevent double-submission
  const isSubmitting = useRef(false);
  // Ref to track if we've already auto-submitted for this PIN
  const autoSubmittedFor = useRef<string | null>(null);

  // Check lock status on mount
  useEffect(() => {
    async function checkStatus() {
      try {
        log('Checking device lock status...');
        const status = await getDeviceAppLockStatus();
        log('Device status:', status);
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

  // Auto-submit when PIN reaches 4 digits (with debounce to allow typing more)
  useEffect(() => {
    // Only auto-submit if we haven't already submitted for this exact PIN
    if (pin.length >= 4 && pin.length <= 6 && !verifying && !isLocked && autoSubmittedFor.current !== pin) {
      // Small delay to allow user to enter more digits if they want
      const timer = setTimeout(() => {
        if (pin.length >= 4 && !verifying && !isLocked && autoSubmittedFor.current !== pin) {
          log('Auto-submitting PIN of length:', pin.length);
          autoSubmittedFor.current = pin;
          handleVerify();
        }
      }, 500); // 500ms delay to allow typing more digits
      
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, verifying, isLocked]);

  const handleVerify = useCallback(async () => {
    if (pin.length < 4) {
      setError('Enter at least 4 digits');
      return;
    }

    // Prevent double submission
    if (isSubmitting.current) {
      log('Already submitting, ignoring');
      return;
    }
    
    isSubmitting.current = true;
    setVerifying(true);
    setError(null);
    log('Verifying PIN...');

    try {
      const isValid = await verifyPin(pin);
      log('PIN verification result:', isValid);

      if (isValid) {
        log('PIN correct, unlocking...');
        onUnlocked();
      } else {
        const newAttempts = attemptsRemaining - 1;
        setAttemptsRemaining(newAttempts);
        setPin('');
        autoSubmittedFor.current = null; // Reset so user can try again

        if (newAttempts <= 0) {
          setIsLocked(true);
          setLockedUntil(new Date(Date.now() + 5 * 60 * 1000));
          setError('Too many failed attempts. Try again in 5 minutes or use password login.');
        } else {
          setError(`Incorrect PIN. ${newAttempts} ${newAttempts === 1 ? 'attempt' : 'attempts'} remaining.`);
        }
      }
    } catch (err) {
      log('PIN verification error:', err);
      setError('Failed to verify PIN. Please try again.');
      setPin('');
      autoSubmittedFor.current = null;
    } finally {
      setVerifying(false);
      isSubmitting.current = false;
    }
  }, [pin, attemptsRemaining, onUnlocked]);

  const handleDigitPress = useCallback((digit: string) => {
    if (isLocked || verifying) return;
    log('Digit pressed:', digit);
    if (pin.length < 6) {
      setPin((prev) => prev + digit);
      setError(null);
    }
  }, [isLocked, verifying, pin.length]);

  const handleBackspace = useCallback(() => {
    if (isLocked || verifying) return;
    log('Backspace pressed');
    setPin((prev) => prev.slice(0, -1));
    setError(null);
    autoSubmittedFor.current = null; // Reset auto-submit tracking
  }, [isLocked, verifying]);

  const handleClear = useCallback(() => {
    if (isLocked || verifying) return;
    log('Clear pressed');
    setPin('');
    setError(null);
    autoSubmittedFor.current = null;
  }, [isLocked, verifying]);
  
  // Handle touch/click with visual feedback
  const handleKeyDown = (key: string) => {
    setPressedKey(key);
  };
  
  const handleKeyUp = () => {
    setPressedKey(null);
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

        {/* Number pad - Mobile optimized with larger touch targets */}
        {!isLocked && (
          <div className="grid grid-cols-3 gap-2 sm:gap-3 select-none">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key, i) => {
              if (key === '' && i === 9) {
                // Empty space or biometric button
                return biometricAvailable ? (
                  <button
                    key="biometric"
                    type="button"
                    className="h-16 sm:h-14 rounded-xl flex items-center justify-center text-muted-foreground touch-manipulation"
                    disabled
                    title="Biometric unlock coming soon"
                  >
                    <Fingerprint className="h-6 w-6" />
                  </button>
                ) : (
                  <div key="empty-left" className="h-16 sm:h-14" />
                );
              }
              if (key === 'del') {
                // Backspace button
                return (
                  <button
                    key="backspace"
                    type="button"
                    onClick={handleBackspace}
                    onTouchStart={() => handleKeyDown('del')}
                    onTouchEnd={handleKeyUp}
                    onMouseDown={() => handleKeyDown('del')}
                    onMouseUp={handleKeyUp}
                    onMouseLeave={handleKeyUp}
                    disabled={verifying || pin.length === 0}
                    className={cn(
                      "h-16 sm:h-14 rounded-xl flex items-center justify-center transition-all touch-manipulation",
                      "text-muted-foreground disabled:opacity-30",
                      pressedKey === 'del' ? "bg-muted scale-95" : "hover:bg-muted/50 active:bg-muted active:scale-95"
                    )}
                  >
                    <Delete className="h-6 w-6" />
                  </button>
                );
              }
              // Number buttons
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleDigitPress(key)}
                  onTouchStart={() => handleKeyDown(key)}
                  onTouchEnd={handleKeyUp}
                  onMouseDown={() => handleKeyDown(key)}
                  onMouseUp={handleKeyUp}
                  onMouseLeave={handleKeyUp}
                  disabled={verifying}
                  className={cn(
                    "h-16 sm:h-14 rounded-xl text-xl sm:text-2xl font-semibold text-foreground transition-all touch-manipulation",
                    "disabled:opacity-50",
                    pressedKey === key 
                      ? "bg-primary text-primary-foreground scale-95" 
                      : "bg-muted/50 hover:bg-muted active:bg-primary active:text-primary-foreground active:scale-95"
                  )}
                >
                  {key}
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
