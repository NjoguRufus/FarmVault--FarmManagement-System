import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { extractMpesaCodeFromPastedMessage } from '@/lib/mpesaExtract';

interface MpesaInstructionsCardProps {
  tillNumber: string;
  className?: string;
  onPaidSubmit: (payload: { phoneNumber: string; mpesaCode: string | null }) => Promise<void> | void;
  submitLoading?: boolean;
  submitError?: string | null;
}

export function MpesaInstructionsCard({
  tillNumber,
  className,
  onPaidSubmit,
  submitLoading = false,
  submitError = null,
}: MpesaInstructionsCardProps) {
  const [open, setOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [mpesaMessage, setMpesaMessage] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);

  const extractedCode = useMemo(() => extractMpesaCodeFromPastedMessage(mpesaMessage), [mpesaMessage]);

  const reset = () => {
    setPhoneNumber('');
    setMpesaMessage('');
    setPhoneError(null);
    setMessageError(null);
  };

  const handleSubmit = async () => {
    const normalizedPhone = phoneNumber.trim();
    if (normalizedPhone.length < 9) {
      setPhoneError('Enter a valid phone number.');
      return;
    }
    setPhoneError(null);

    const trimmedMsg = mpesaMessage.trim();
    if (trimmedMsg.length > 0 && extractedCode.length < 10) {
      setMessageError('We could not find 10 characters for the M-PESA code. Paste the full SMS or the confirmation code.');
      return;
    }
    setMessageError(null);

    await onPaidSubmit({
      phoneNumber: normalizedPhone,
      mpesaCode: extractedCode.length === 10 ? extractedCode : null,
    });
  };

  return (
    <div
      className={cn(
        'rounded-2xl border border-border/50 bg-gradient-to-b from-muted/40 to-background p-4 shadow-sm ring-1 ring-black/[0.03] ring-primary/10',
        className,
      )}
    >
      <div className="space-y-3">
        <div className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-[10px] leading-snug text-amber-950 dark:text-amber-100/90 lg:px-3 lg:py-2.5 lg:text-[11px] lg:leading-relaxed">
          <p className="font-semibold">Pay via M-PESA</p>
          <ol className="mt-1 space-y-0.5">
            <li>1. Go to Lipa na M-PESA</li>
            <li>2. Buy Goods &amp; Services</li>
            <li>3. Till Number: {tillNumber}</li>
            <li>4. Enter the exact amount shown</li>
            <li>5. Confirm payment</li>
          </ol>
        </div>

        <Button type="button" className="w-full rounded-xl" onClick={() => setOpen(true)} disabled={submitLoading}>
          I&apos;ve Paid
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">STK coming soon</p>
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (submitLoading) return;
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm your payment</DialogTitle>
            <DialogDescription>Enter the M-PESA phone number used for payment.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Phone Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g. 07XXXXXXXX"
                className="fv-input"
                disabled={submitLoading}
              />
              {phoneError ? <p className="text-xs text-destructive">{phoneError}</p> : null}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">M-PESA message (optional)</label>
              <Textarea
                value={mpesaMessage}
                onChange={(e) => {
                  setMpesaMessage(e.target.value);
                  setMessageError(null);
                }}
                placeholder="Paste the full M-PESA SMS (recommended). System detects the 10-character confirmation code and only store those 10 characters (the rest is ignored)."
                className="min-h-[100px] resize-y text-sm"
                disabled={submitLoading}
                rows={4}
              />
              {extractedCode ? (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Code we&apos;ll use:</span>{' '}
                  <span className="font-mono font-semibold tracking-wide text-foreground">{extractedCode}</span>
                  {extractedCode.length < 10 ? (
                    <span className="block pt-0.5 text-amber-700 dark:text-amber-400">
                      Need 10 characters — paste a bit more of the SMS if this looks short.
                    </span>
                  ) : null}
                </p>
              ) : (
                <p className="text-[11px] leading-snug text-muted-foreground">STK coming soon</p>
              )}
              {messageError ? <p className="text-xs text-destructive">{messageError}</p> : null}
            </div>

            {submitError ? <p className="text-xs text-destructive">{submitError}</p> : null}

            <Button type="button" className="w-full rounded-xl" onClick={() => void handleSubmit()} disabled={submitLoading}>
              {submitLoading ? 'Submitting...' : 'Submit'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
