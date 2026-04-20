import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type BrokerBuyerLedgerEntry = {
  id: string;
  entry_number: number;
  buyer_label: string | null;
  buyer_phone: string | null;
  line_total: number;
  broker_payment_kind: 'collected' | 'debt' | null;
  broker_collected_amount: number | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: BrokerBuyerLedgerEntry | null;
  formatKes: (n: number) => string;
  currencyLabel?: string;
  onRecordPayment: (payload: { buyerPhone: string | null; amountPaidNow: number }) => Promise<void>;
  onMarkDebt: (payload: { buyerPhone: string | null }) => Promise<void>;
  onClearRecord: (payload: { buyerPhone: string | null }) => Promise<void>;
  isSaving: boolean;
};

export function BrokerBuyerLedgerDialog({
  open,
  onOpenChange,
  entry,
  formatKes,
  currencyLabel = 'KES',
  onRecordPayment,
  onMarkDebt,
  onClearRecord,
  isSaving,
}: Props) {
  const [phone, setPhone] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !entry) return;
    setAmountError(null);
    setPhone(entry.buyer_phone?.trim() ?? '');
    setAmountStr('');
  }, [open, entry]);

  if (!entry) return null;

  const lineTotal = Number.isFinite(entry.line_total) ? entry.line_total : 0;
  const displayName = entry.buyer_label?.trim() || `Buyer ${entry.entry_number}`;
  const collectedSoFar =
    entry.broker_payment_kind === 'collected' && entry.broker_collected_amount != null && Number.isFinite(entry.broker_collected_amount)
      ? Math.max(0, Number(entry.broker_collected_amount))
      : 0;
  const balanceNow = Math.max(0, lineTotal - collectedSoFar);

  const phoneOut = (): string | null => {
    const t = phone.trim();
    return t.length > 0 ? t : null;
  };

  const parseAmount = (): number | null => {
    const n = Math.round(Number(amountStr) || 0);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  };

  const paymentNow = parseAmount();
  const balanceAfterPayment = paymentNow == null ? balanceNow : Math.max(0, balanceNow - paymentNow);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buyer payment record</DialogTitle>
          <p className="text-xs text-muted-foreground">
            For your notebook only. Line sale total:{' '}
            <span className="font-semibold text-foreground">{formatKes(lineTotal)}</span>
          </p>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-sm font-medium">{displayName}</p>
          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Collected</span>
              <span className="font-semibold tabular-nums text-foreground">{formatKes(collectedSoFar)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Balance</span>
              <span className="font-semibold tabular-nums text-foreground">{formatKes(balanceNow)}</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phone (search by number)</Label>
            <Input
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0712 345 678"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">New payment ({currencyLabel})</Label>
            <Input
              inputMode="numeric"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder={String(Math.round(balanceNow))}
            />
            <p className="text-[11px] text-muted-foreground">
              Enter the amount the buyer is paying now. It will be added to the previous collected amount.
            </p>
            <p className="text-[11px] text-muted-foreground">
              Remaining after this payment:{' '}
              <span className="font-semibold tabular-nums text-foreground">{formatKes(balanceAfterPayment)}</span>
            </p>
            {amountError ? <p className="text-xs text-destructive">{amountError}</p> : null}
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            className="w-full"
            disabled={isSaving}
            onClick={async () => {
              setAmountError(null);
              const amt = parseAmount();
              if (amt == null) {
                setAmountError('Enter a valid amount (more than 0).');
                return;
              }
              await onRecordPayment({ buyerPhone: phoneOut(), amountPaidNow: amt });
            }}
          >
            {isSaving ? 'Saving…' : 'Record payment'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={isSaving}
            title="Buyer has not paid in full; they will pay later"
            onClick={async () => {
              await onMarkDebt({ buyerPhone: phoneOut() });
            }}
          >
            Debt
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-muted-foreground"
            disabled={isSaving}
            onClick={async () => {
              await onClearRecord({ buyerPhone: phoneOut() });
            }}
          >
            Clear payment status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
