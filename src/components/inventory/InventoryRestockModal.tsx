import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { InventoryItem } from '@/types';

export type InventoryRestockModalProps = {
  item: InventoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (params: { quantity: number; totalCost: number; date: string }) => Promise<void> | void;
};

export function InventoryRestockModal(props: InventoryRestockModalProps) {
  const { item, open, onOpenChange, onConfirm } = props;
  const [quantity, setQuantity] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setQuantity('');
    setTotalCost('');
  };

  async function handleConfirm() {
    const qty = Number(quantity);
    const cost = Number(totalCost);
    if (!item || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost <= 0) return;
    try {
      setSubmitting(true);
      await onConfirm({ quantity: qty, totalCost: cost, date });
      reset();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (!next) reset();
      onOpenChange(next);
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restock inventory</DialogTitle>
          <DialogDescription>
            Add stock for <span className="font-medium">{item?.name}</span>. This will update current quantity,
            create a movement entry, and log an audit event.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="restock-quantity">Quantity to add</Label>
            <Input
              id="restock-quantity"
              type="number"
              min={0}
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="restock-total-cost">Total cost</Label>
            <Input
              id="restock-total-cost"
              type="number"
              min={0}
              step="any"
              value={totalCost}
              onChange={(e) => setTotalCost(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="restock-date">Purchase date</Label>
            <Input
              id="restock-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Saving…' : 'Confirm restock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

