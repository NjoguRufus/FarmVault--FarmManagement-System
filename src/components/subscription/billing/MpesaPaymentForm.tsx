import React from 'react';
import { Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type MpesaFieldErrors = Partial<Record<'mpesaName' | 'mpesaPhone' | 'transactionCode', string>>;

export interface MpesaPaymentFormProps {
  mpesaName: string;
  mpesaPhone: string;
  transactionCode: string;
  onMpesaNameChange: (v: string) => void;
  onMpesaPhoneChange: (v: string) => void;
  onTransactionCodeChange: (v: string) => void;
  fieldErrors: MpesaFieldErrors;
  disabled?: boolean;
  onSubmit: () => void;
  onDismiss: () => void;
  submitLoading?: boolean;
  className?: string;
}

export function MpesaPaymentForm({
  mpesaName,
  mpesaPhone,
  transactionCode,
  onMpesaNameChange,
  onMpesaPhoneChange,
  onTransactionCodeChange,
  fieldErrors,
  disabled,
  onSubmit,
  onDismiss,
  submitLoading,
  className,
}: MpesaPaymentFormProps) {
  return (
    <div className={cn('space-y-3 lg:space-y-4', className)}>
      <div className="space-y-0.5 lg:space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">M-Pesa details</p>
        <p className="text-[11px] leading-snug text-muted-foreground lg:text-xs lg:leading-normal">
          Use the name and number from your M-Pesa confirmation.
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:gap-3">
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="billing-mpesa-name" className="text-xs font-medium text-foreground">
            Name on M-Pesa
          </label>
          <Input
            id="billing-mpesa-name"
            className={cn(
              'h-9 rounded-md bg-background lg:h-10 lg:rounded-lg',
              fieldErrors.mpesaName && 'border-destructive',
            )}
            value={mpesaName}
            disabled={disabled}
            onChange={(e) => onMpesaNameChange(e.target.value)}
            placeholder="As shown on SMS"
            autoComplete="name"
          />
          {fieldErrors.mpesaName ? <p className="text-xs text-destructive">{fieldErrors.mpesaName}</p> : null}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="billing-mpesa-phone" className="text-xs font-medium text-foreground">
            Phone number
          </label>
          <Input
            id="billing-mpesa-phone"
            className={cn(
              'h-9 rounded-md bg-background lg:h-10 lg:rounded-lg',
              fieldErrors.mpesaPhone && 'border-destructive',
            )}
            value={mpesaPhone}
            disabled={disabled}
            onChange={(e) => onMpesaPhoneChange(e.target.value)}
            placeholder="+2547…"
            inputMode="tel"
            autoComplete="tel"
          />
          {fieldErrors.mpesaPhone ? <p className="text-xs text-destructive">{fieldErrors.mpesaPhone}</p> : null}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="billing-mpesa-tx" className="text-xs font-medium text-foreground">
            Transaction code
          </label>
          <Input
            id="billing-mpesa-tx"
            className={cn(
              'h-9 rounded-md bg-background font-mono text-xs lg:h-10 lg:rounded-lg lg:text-sm',
              fieldErrors.transactionCode && 'border-destructive',
            )}
            value={transactionCode}
            disabled={disabled}
            onChange={(e) => onTransactionCodeChange(e.target.value)}
            placeholder="Paste SMS or enter code"
            autoComplete="off"
          />
          {fieldErrors.transactionCode ? <p className="text-xs text-destructive">{fieldErrors.transactionCode}</p> : null}
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        disabled
        className="h-8 w-full cursor-not-allowed gap-2 rounded-md border-dashed text-[10px] text-muted-foreground lg:h-9 lg:rounded-lg lg:text-xs"
      >
        <Smartphone className="h-3.5 w-3.5" />
        STK Push — coming soon
      </Button>

      <div className="flex flex-col-reverse gap-2 pt-0.5 sm:flex-row sm:justify-end lg:pt-1">
        <Button
          type="button"
          variant="ghost"
          className="h-9 rounded-md text-sm text-muted-foreground lg:h-10 lg:rounded-lg"
          disabled={submitLoading}
          onClick={onDismiss}
        >
          Maybe later
        </Button>
        <Button
          type="button"
          className="h-11 rounded-xl px-5 text-sm font-semibold shadow-sm lg:h-10 lg:rounded-lg lg:px-6"
          disabled={disabled || submitLoading}
          onClick={onSubmit}
        >
          {submitLoading ? 'Submitting…' : 'Submit payment'}
        </Button>
      </div>
    </div>
  );
}
