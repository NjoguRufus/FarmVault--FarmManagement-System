import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  const [mpesaCode, setMpesaCode] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const reset = () => {
    setPhoneNumber('');
    setMpesaCode('');
    setPhoneError(null);
  };

  const handleSubmit = async () => {
    const normalizedPhone = phoneNumber.trim();
    if (normalizedPhone.length < 9) {
      setPhoneError('Enter a valid phone number.');
      return;
    }
    setPhoneError(null);
    await onPaidSubmit({
      phoneNumber: normalizedPhone,
      mpesaCode: mpesaCode.trim() || null,
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
            <DialogDescription>
              Enter the M-PESA phone number used for payment. M-PESA code is optional.
            </DialogDescription>
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
              <label className="text-xs font-medium text-muted-foreground">M-PESA Code (optional)</label>
              <input
                type="text"
                value={mpesaCode}
                onChange={(e) => setMpesaCode(e.target.value.toUpperCase())}
                placeholder="e.g. QWE123ABC"
                className="fv-input uppercase"
                disabled={submitLoading}
              />
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
