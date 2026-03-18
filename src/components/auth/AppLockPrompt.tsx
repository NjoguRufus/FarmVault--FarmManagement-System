/**
 * AppLockPrompt component.
 * Shows a first-time prompt introducing the App Lock feature.
 * 
 * This appears when:
 * - User hasn't seen/dismissed the prompt before
 * - No PIN has been created yet
 * 
 * User can:
 * - Create PIN (starts the PIN creation flow)
 * - Skip (dismisses prompt, can enable later from Settings)
 */

import React, { useState } from 'react';
import { Shield, Lock, X, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  enableQuickUnlock, 
  dismissPrompt,
  skipPinSetup 
} from '@/services/appLockService';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Step = 'intro' | 'enter' | 'confirm' | 'success' | 'error';

interface AppLockPromptProps {
  onComplete: () => void;
  onSkip: () => void;
}

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log('[AppLockPrompt]', ...args);
}

export function AppLockPrompt({ onComplete, onSkip }: AppLockPromptProps) {
  const [step, setStep] = useState<Step>('intro');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pressedKey, setPressedKey] = useState<string | null>(null);

  const handleSkip = () => {
    log('User skipped App Lock setup');
    dismissPrompt();
    skipPinSetup();
    toast.info('You can enable App Lock later in Settings');
    onSkip();
  };

  const handleStartSetup = () => {
    log('Starting PIN setup');
    setStep('enter');
  };

  const handleDigitPress = (digit: string) => {
    if (saving) return;
    
    if (step === 'enter') {
      if (pin.length < 4) {
        const newPin = pin + digit;
        setPin(newPin);
        setError(null);
        // Auto-advance to confirm when 4 digits entered
        if (newPin.length === 4) {
          log('PIN entered, moving to confirm step');
          setTimeout(() => setStep('confirm'), 200);
        }
      }
    } else if (step === 'confirm') {
      if (confirmPin.length < 4) {
        const newConfirmPin = confirmPin + digit;
        setConfirmPin(newConfirmPin);
        setError(null);
        // Auto-verify when 4 digits entered
        if (newConfirmPin.length === 4) {
          log('Confirm PIN entered, verifying match');
          setTimeout(() => verifyPins(pin, newConfirmPin), 200);
        }
      }
    }
  };

  const verifyPins = async (enteredPin: string, confirmedPin: string) => {
    if (enteredPin !== confirmedPin) {
      log('PINs do not match');
      setError('PINs do not match. Try again.');
      setPin('');
      setConfirmPin('');
      setStep('enter');
      return;
    }

    setSaving(true);
    try {
      log('Saving PIN...');
      await enableQuickUnlock(enteredPin);
      dismissPrompt();
      log('PIN saved successfully');
      setStep('success');
      setTimeout(() => {
        onComplete();
      }, 2000);
    } catch (err) {
      log('Failed to save PIN:', err);
      setError((err as Error).message || 'Failed to save PIN');
      setStep('error');
    } finally {
      setSaving(false);
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
        setStep('enter');
      }
    }
    setError(null);
  };

  const handleRetry = () => {
    setPin('');
    setConfirmPin('');
    setError(null);
    setStep('enter');
  };

  // Intro screen
  if (step === 'intro') {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-card rounded-2xl shadow-xl border p-6 space-y-6">
          <div className="text-center space-y-4">
            <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">New Feature: App Lock</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Protect FarmVault on this device with a PIN.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <Button onClick={handleStartSetup} className="w-full gap-2">
              <Lock className="h-4 w-4" />
              Create PIN
            </Button>
            <Button onClick={handleSkip} variant="ghost" className="w-full text-muted-foreground">
              Skip
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            You can always enable this later in Settings
          </p>
        </div>
      </div>
    );
  }

  // Success screen
  if (step === 'success') {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="h-20 w-20 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
            <Check className="h-10 w-10 text-green-500" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground">PIN Set Successfully!</h1>
            <p className="text-sm text-muted-foreground">
              You can use this PIN to unlock FarmVault on this device. 
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
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="h-20 w-20 mx-auto rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-10 w-10 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <div className="space-y-2">
            <Button onClick={handleRetry} className="w-full">Try Again</Button>
            <Button onClick={handleSkip} variant="ghost" className="w-full">Skip for now</Button>
          </div>
        </div>
      </div>
    );
  }

  // PIN entry screens (enter / confirm)
  const currentPin = step === 'confirm' ? confirmPin : pin;
  
  return (
    <div className="fixed inset-0 z-50 bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="h-14 w-14 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Lock className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">
            {step === 'enter' ? 'Create a 4-digit PIN' : 'Confirm your PIN'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === 'enter' 
              ? 'This PIN will unlock FarmVault on this device'
              : 'Enter the same PIN again'}
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="text-center text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
            {error}
          </div>
        )}

        {/* PIN dots */}
        <div className="flex justify-center gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'h-4 w-4 rounded-full transition-all',
                i < currentPin.length
                  ? 'bg-primary scale-110'
                  : 'bg-muted-foreground/30'
              )}
            />
          ))}
        </div>

        {/* Number pad */}
        <div className="grid grid-cols-3 gap-3 select-none">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) => {
            if (key === '') {
              return <div key="empty" className="h-16" />;
            }
            if (key === 'del') {
              return (
                <button
                  key="backspace"
                  type="button"
                  onClick={handleBackspace}
                  onTouchStart={() => setPressedKey('del')}
                  onTouchEnd={() => setPressedKey(null)}
                  onMouseDown={() => setPressedKey('del')}
                  onMouseUp={() => setPressedKey(null)}
                  onMouseLeave={() => setPressedKey(null)}
                  disabled={saving || currentPin.length === 0}
                  className={cn(
                    "h-16 rounded-xl flex items-center justify-center transition-all touch-manipulation",
                    "text-muted-foreground disabled:opacity-30",
                    pressedKey === 'del' ? "bg-muted scale-95" : "hover:bg-muted/50 active:bg-muted"
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
                onTouchStart={() => setPressedKey(key)}
                onTouchEnd={() => setPressedKey(null)}
                onMouseDown={() => setPressedKey(key)}
                onMouseUp={() => setPressedKey(null)}
                onMouseLeave={() => setPressedKey(null)}
                disabled={saving}
                className={cn(
                  "h-16 rounded-xl text-2xl font-semibold text-foreground transition-all touch-manipulation",
                  pressedKey === key 
                    ? "bg-primary text-primary-foreground scale-95" 
                    : "bg-muted/50 hover:bg-muted active:bg-primary active:text-primary-foreground"
                )}
              >
                {key}
              </button>
            );
          })}
        </div>

        {/* Skip button */}
        <Button
          onClick={handleSkip}
          variant="ghost"
          className="w-full text-muted-foreground"
          disabled={saving}
        >
          Skip for now
        </Button>
      </div>
    </div>
  );
}
