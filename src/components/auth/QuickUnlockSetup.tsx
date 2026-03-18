/**
 * QuickUnlockSetup component.
 * First-time PIN setup flow for Quick Unlock.
 * 
 * Flow:
 * 1. User enters a 4-6 digit PIN
 * 2. Auto-progress to confirmation step
 * 3. User re-enters PIN to confirm
 * 4. If match: save PIN and show success
 * 5. If mismatch: show error and restart
 * 
 * User can skip setup and do it later from Settings.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, Lock, Check, AlertCircle, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { enableQuickUnlock, skipPinSetup } from '@/services/appLockService';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type SetupStep = 'enter' | 'confirm' | 'success' | 'error';

interface QuickUnlockSetupProps {
  /** Called when setup is complete (PIN created) */
  onComplete: () => void;
  /** Called when user skips setup */
  onSkip: () => void;
  /** User's name for personalization */
  userName?: string;
}

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log('[QuickUnlockSetup]', ...args);
}

export function QuickUnlockSetup({
  onComplete,
  onSkip,
  userName,
}: QuickUnlockSetupProps) {
  const [step, setStep] = useState<SetupStep>('enter');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  
  // Ref to prevent double submission
  const isSubmitting = useRef(false);

  // Auto-progress to confirm step when PIN is 4+ digits
  useEffect(() => {
    if (step === 'enter' && pin.length >= 4) {
      const timer = setTimeout(() => {
        if (pin.length >= 4) {
          log('Auto-progressing to confirm step');
          setStep('confirm');
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [pin, step]);

  // Auto-verify when confirm PIN matches length
  useEffect(() => {
    if (step === 'confirm' && confirmPin.length === pin.length && !isSubmitting.current) {
      const timer = setTimeout(() => {
        if (confirmPin.length === pin.length) {
          handleConfirm();
        }
      }, 300);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmPin, step]);

  const handleConfirm = useCallback(async () => {
    if (isSubmitting.current) return;
    
    log('Confirming PIN...');
    
    if (pin !== confirmPin) {
      log('PINs do not match');
      setError('PINs do not match. Please try again.');
      setStep('error');
      return;
    }

    isSubmitting.current = true;
    setSaving(true);
    setError(null);

    try {
      log('Saving PIN to server...');
      await enableQuickUnlock(pin);
      log('PIN saved successfully');
      setStep('success');
      
      // Show success for a moment before completing
      setTimeout(() => {
        onComplete();
      }, 2000);
    } catch (err) {
      log('Failed to save PIN:', err);
      setError((err as Error).message || 'Failed to save PIN. Please try again.');
      setStep('error');
    } finally {
      setSaving(false);
      isSubmitting.current = false;
    }
  }, [pin, confirmPin, onComplete]);

  const handleRetry = () => {
    setPin('');
    setConfirmPin('');
    setError(null);
    setStep('enter');
  };

  const handleSkip = () => {
    log('User skipped PIN setup');
    skipPinSetup();
    toast.info('You can set up a PIN later in Settings');
    onSkip();
  };

  const handleDigitPress = (digit: string) => {
    if (saving) return;
    
    if (step === 'enter') {
      if (pin.length < 6) {
        setPin(prev => prev + digit);
        setError(null);
      }
    } else if (step === 'confirm') {
      if (confirmPin.length < 6) {
        setConfirmPin(prev => prev + digit);
        setError(null);
      }
    }
  };

  const handleBackspace = () => {
    if (saving) return;
    
    if (step === 'enter') {
      setPin(prev => prev.slice(0, -1));
    } else if (step === 'confirm') {
      if (confirmPin.length > 0) {
        setConfirmPin(prev => prev.slice(0, -1));
      } else {
        // Go back to enter step
        setStep('enter');
      }
    }
    setError(null);
  };

  const handleKeyDown = (key: string) => setPressedKey(key);
  const handleKeyUp = () => setPressedKey(null);

  const currentPin = step === 'confirm' ? confirmPin : pin;
  const targetLength = step === 'confirm' ? pin.length : 6;

  // Success screen
  if (step === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm space-y-8 text-center">
          <div className="h-20 w-20 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
            <Check className="h-10 w-10 text-green-500" />
          </div>
          <div className="space-y-3">
            <h1 className="text-xl font-semibold text-foreground">PIN Set Successfully!</h1>
            <p className="text-sm text-muted-foreground">
              You will use this PIN to unlock FarmVault on this device.
              You can change or disable it anytime in Settings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Error screen
  if (step === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm space-y-8 text-center">
          <div className="h-20 w-20 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
          </div>
          <div className="space-y-3">
            <h1 className="text-xl font-semibold text-foreground">
              {error || 'Something went wrong'}
            </h1>
            <p className="text-sm text-muted-foreground">
              Please try again.
            </p>
          </div>
          <div className="space-y-3">
            <Button onClick={handleRetry} className="w-full">
              Try Again
            </Button>
            <Button onClick={handleSkip} variant="ghost" className="w-full">
              Skip for now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {step === 'enter' ? 'Create a PIN' : 'Confirm Your PIN'}
            </h1>
            {userName && step === 'enter' && (
              <p className="text-sm text-muted-foreground mt-1">Hi, {userName}</p>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            {step === 'enter' 
              ? 'Create a 4-6 digit PIN for quick access on this device.'
              : 'Enter the PIN again to confirm.'}
          </p>
          
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2">
            <div className={cn(
              "h-2 w-8 rounded-full transition-colors",
              step === 'enter' ? "bg-primary" : "bg-primary/30"
            )} />
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div className={cn(
              "h-2 w-8 rounded-full transition-colors",
              step === 'confirm' ? "bg-primary" : "bg-muted"
            )} />
          </div>
        </div>

        {/* PIN dots */}
        <div className="flex justify-center gap-3">
          {Array.from({ length: targetLength }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-4 w-4 rounded-full transition-all',
                i < currentPin.length
                  ? 'bg-primary scale-110'
                  : 'bg-muted-foreground/30',
                saving && 'animate-pulse'
              )}
            />
          ))}
        </div>

        {/* Number pad */}
        <div className="grid grid-cols-3 gap-2 select-none">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key, i) => {
            if (key === '' && i === 9) {
              return <div key="empty" className="h-16" />;
            }
            if (key === 'del') {
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
                  disabled={saving || currentPin.length === 0}
                  className={cn(
                    "h-16 rounded-xl flex items-center justify-center transition-all touch-manipulation",
                    "text-muted-foreground disabled:opacity-30",
                    pressedKey === 'del' ? "bg-muted scale-95" : "hover:bg-muted/50 active:bg-muted active:scale-95"
                  )}
                >
                  <X className="h-6 w-6" />
                </button>
              );
            }
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
                disabled={saving}
                className={cn(
                  "h-16 rounded-xl text-xl font-semibold text-foreground transition-all touch-manipulation",
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

        {/* Skip button */}
        <div className="pt-4">
          <Button
            onClick={handleSkip}
            variant="ghost"
            className="w-full text-muted-foreground"
            disabled={saving}
          >
            Skip for now
          </Button>
          <p className="text-center text-[11px] text-muted-foreground mt-2">
            You can set up a PIN later in Settings
          </p>
        </div>
      </div>
    </div>
  );
}
