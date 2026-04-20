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
import { Textarea } from '@/components/ui/textarea';

export type EditMarketSalesBuyerEntry = {
  id: string;
  buyer_label: string | null;
  quantity: number;
  price_per_unit: number;
};

export type EditMarketSalesBuyerSavePayload = {
  buyerLabel: string | null;
  quantity: number;
  pricePerUnit: number;
  editReason: string;
};

const MIN_REASON = 8;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: EditMarketSalesBuyerEntry | null;
  /** Shown in quantity label, e.g. "boxes". */
  unitLabel: string;
  /** Tomato buyer lines use whole numbers; fallback may use decimals. */
  quantityMode: 'int' | 'decimal';
  onSave: (payload: EditMarketSalesBuyerSavePayload) => Promise<void>;
  isSaving?: boolean;
};

export function EditMarketSalesBuyerDialog({
  open,
  onOpenChange,
  entry,
  unitLabel,
  quantityMode,
  onSave,
  isSaving = false,
}: Props) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!entry) return;
    setName(entry.buyer_label?.trim() ?? '');
    setPrice(String(entry.price_per_unit));
    setQty(
      quantityMode === 'int'
        ? String(Math.max(1, Math.floor(Number(entry.quantity) || 1)))
        : String(entry.quantity),
    );
    setReason('');
  }, [entry, quantityMode]);

  const canSubmit =
    reason.trim().length >= MIN_REASON &&
    price.trim() !== '' &&
    qty.trim() !== '' &&
    Number.isFinite(Number(price)) &&
    Number(price) >= 0 &&
    Number.isFinite(Number(qty)) &&
    (quantityMode === 'int' ? Math.floor(Number(qty)) >= 1 : Number(qty) > 0);

  async function handleSave() {
    if (!entry || !canSubmit || isSaving) return;
    const priceN = Number(price);
    const qtyN = quantityMode === 'int' ? Math.max(1, Math.floor(Number(qty))) : Math.max(0.0001, Number(qty));
    await onSave({
      buyerLabel: name.trim() ? name.trim() : null,
      quantity: qtyN,
      pricePerUnit: priceN,
      editReason: reason.trim(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit buyer line</DialogTitle>
        </DialogHeader>
        {entry ? (
          <>
            <div className="space-y-3 py-1">
              <div className="space-y-1">
                <Label className="text-xs">Buyer name (optional)</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Price per {unitLabel} (KES)</Label>
                <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quantity ({unitLabel})</Label>
                <Input
                  inputMode={quantityMode === 'int' ? 'numeric' : 'decimal'}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  Reason for this edit <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Required for audits — e.g. corrected price agreed with buyer on phone"
                  className="min-h-[5rem] resize-y text-sm"
                  maxLength={2000}
                />
                <p className="text-[10px] text-muted-foreground">
                  At least {MIN_REASON} characters. Stored with your user id and a before/after snapshot.
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={!canSubmit || isSaving}>
                {isSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
