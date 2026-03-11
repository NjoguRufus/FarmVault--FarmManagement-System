import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { InventoryItem } from '@/types';

export type InventoryDeductModalProps = {
  item: InventoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (params: { quantity: number; reason?: string }) => Promise<void> | void;
};

export function InventoryDeductModal(props: InventoryDeductModalProps) {
  const { item, open, onOpenChange, onConfirm } = props;
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setQuantity('');
    setReason('');
  };

  async function handleConfirm() {
    const qty = Number(quantity);
    if (!item || !Number.isFinite(qty) || qty <= 0) return;
    try {
      setSubmitting(true);
      await onConfirm({ quantity: qty, reason: reason.trim() || undefined });
      reset();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deduct stock</DialogTitle>
          <DialogDescription>
            Manually deduct stock for <span className="font-medium">{item?.name}</span>. Use this for corrections,
            wastage, or adjustments not yet linked to operations.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="deduct-quantity">Quantity to deduct</Label>
            <Input
              id="deduct-quantity"
              type="number"
              min={0}
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="deduct-reason">Reason (optional)</Label>
            <Input
              id="deduct-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Damaged bags, spill, correction"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Saving…' : 'Confirm deduction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

