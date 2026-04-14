import { logger } from "@/lib/logger";
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
  logger.log('[AppLockPrompt]', ...args);
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

  const modalShellClass =
    'w-full max-w-[400px] rounded-2xl border border-[#e5e7df] bg-[#fafaf7] p-8 shadow-[0_20px_40px_rgba(45,106,79,0.14)]';

  const modalBackdropClass =
    'fixed inset-0 z-50 flex items-center justify-center bg-[#fafaf7] p-4';

  const iconWrapClass =
    'mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#2D6A4F]/12';

  // Intro screen
  if (step === 'intro') {
    return (
      <div
        className={modalBackdropClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-lock-intro-title"
        aria-describedby="app-lock-intro-desc"
      >
        <div className={cn(modalShellClass, 'animate-in zoom-in-95 duration-200')}>
          <div className="space-y-6 text-center">
            <div className={iconWrapClass}>
              <Shield className="h-8 w-8 text-[#2D6A4F]" aria-hidden />
            </div>

            <div className="space-y-2">
              <h1
                id="app-lock-intro-title"
                className="text-2xl font-semibold tracking-tight text-[#1f3d2f]"
              >
                Protect your FarmVault
              </h1>
              <p
                id="app-lock-intro-desc"
                className="text-sm leading-relaxed text-[#5f6f63]"
              >
                Add a PIN to keep your farm records secure on this device.
              </p>
            </div>

            <div className="space-y-3 pt-1">
              <Button
                onClick={handleStartSetup}
                autoFocus
                className="h-11 w-full bg-[#2D6A4F] text-white shadow-sm transition-colors hover:bg-[#265943] focus-visible:ring-[#2D6A4F]"
              >
                Create PIN
              </Button>
              <Button
                type="button"
                onClick={handleSkip}
                variant="outline"
                className="h-11 w-full border-[#d7dccf] bg-transparent text-[#46594f] hover:bg-[#f2f4ec]"
              >
                Skip for now
              </Button>
            </div>

            <p className="text-xs leading-relaxed text-[#7b877f]">
              You can always enable this later in Settings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Success screen
  if (step === 'success') {
    return (
      <div className={modalBackdropClass}>
        <div className={cn(modalShellClass, 'space-y-6 text-center')}>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#2D6A4F]/12">
            <Check className="h-8 w-8 text-[#2D6A4F]" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-[#1f3d2f]">PIN ready</h1>
            <p className="text-sm leading-relaxed text-[#5f6f63]">
              Your FarmVault is now protected on this device.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Error screen
  if (step === 'error') {
    return (
      <div className={modalBackdropClass}>
        <div className={cn(modalShellClass, 'space-y-6 text-center')}>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#D4A937]/15">
            <AlertCircle className="h-8 w-8 text-[#D4A937]" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-[#1f3d2f]">Setup failed</h1>
            <p className="text-sm leading-relaxed text-[#5f6f63]">{error}</p>
          </div>
          <div className="space-y-3">
            <Button
              onClick={handleRetry}
              className="h-11 w-full bg-[#2D6A4F] text-white shadow-sm transition-colors hover:bg-[#265943]"
            >
              Try again
            </Button>
            <Button
              onClick={handleSkip}
              variant="outline"
              className="h-11 w-full border-[#d7dccf] bg-transparent text-[#46594f] hover:bg-[#f2f4ec]"
            >
              Skip for now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // PIN entry screens (enter / confirm)
  const currentPin = step === 'confirm' ? confirmPin : pin;

  return (
    <div className={modalBackdropClass}>
      <div className={cn(modalShellClass, 'space-y-7')}>
        <div className="space-y-3 text-center">
          <div className={iconWrapClass}>
            <Lock className="h-7 w-7 text-[#2D6A4F]" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-[#1f3d2f]">
              {step === 'enter' ? 'Create your 4-digit PIN' : 'Confirm your PIN'}
            </h1>
            <p className="text-sm leading-relaxed text-[#5f6f63]">
              {step === 'enter'
                ? 'Use a PIN you can remember to protect FarmVault on this device.'
                : 'Enter the same PIN again to finish setup.'}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-[#D4A937]/30 bg-[#D4A937]/10 p-3 text-center text-sm text-[#7a611f]">
            {error}
          </div>
        )}

        <div className="flex justify-center gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'h-3.5 w-3.5 rounded-full transition-all duration-150',
                i < currentPin.length ? 'scale-110 bg-[#2D6A4F]' : 'bg-[#d4d9ce]'
              )}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2.5 select-none">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((key) => {
            if (key === '') {
              return <div key="empty" className="h-14" />;
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
                    'flex h-14 items-center justify-center rounded-xl border border-[#d7dccf] text-[#66756d] transition-all touch-manipulation disabled:cursor-not-allowed disabled:opacity-40',
                    pressedKey === 'del' ? 'scale-95 bg-[#edf1e7]' : 'bg-[#f7f8f3] hover:bg-[#edf1e7]'
                  )}
                >
                  <X className="h-5 w-5" />
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
                  'h-14 rounded-xl border border-[#d7dccf] text-xl font-semibold text-[#2f3f36] transition-all touch-manipulation',
                  pressedKey === key
                    ? 'scale-95 bg-[#2D6A4F] text-white'
                    : 'bg-[#f7f8f3] hover:bg-[#edf1e7]'
                )}
              >
                {key}
              </button>
            );
          })}
        </div>

        <Button
          onClick={handleSkip}
          variant="outline"
          className="h-11 w-full border-[#d7dccf] bg-transparent text-[#46594f] hover:bg-[#f2f4ec]"
          disabled={saving}
        >
          Skip for now
        </Button>
      </div>
    </div>
  );
}
