import React, { useState, useEffect } from 'react';
import { Minus, AlertTriangle, Package } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { InventoryStockRow } from '@/services/inventoryReadModelService';

interface DeductStockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: InventoryStockRow | null;
  companyId: string;
  onDeducted?: () => void;
  onDeduct: (params: {
    companyId: string;
    itemId: string;
    quantity: number;
    reason?: string;
  }) => Promise<void>;
}

export function DeductStockModal({
  open,
  onOpenChange,
  item,
  companyId,
  onDeducted,
  onDeduct,
}: DeductStockModalProps) {
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setQuantity('');
      setReason('');
      setError(null);
    }
  }, [open]);

  const currentStock = item?.current_stock ?? 0;
  const parsedQuantity = parseFloat(quantity) || 0;
  const isValidQuantity = parsedQuantity > 0 && parsedQuantity <= currentStock;
  const remainingStock = currentStock - parsedQuantity;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item || !isValidQuantity) return;

    setError(null);
    setSaving(true);

    try {
      await onDeduct({
        companyId,
        itemId: item.id,
        quantity: parsedQuantity,
        reason: reason.trim() || undefined,
      });

      toast.success(`Deducted ${parsedQuantity} ${item.unit || 'units'} from ${item.name}`);
      onOpenChange(false);
      onDeducted?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to deduct stock';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Minus className="h-5 w-5 text-orange-600" />
            Deduct Stock
          </DialogTitle>
          <DialogDescription>
            Remove stock from inventory. This action will be recorded in the audit trail.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Item info */}
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
              <Package className="h-5 w-5 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{item.name}</p>
              <p className="text-sm text-muted-foreground">
                Current stock: <span className="font-medium">{currentStock} {item.unit || 'units'}</span>
              </p>
            </div>
          </div>

          {/* Quantity input */}
          <div className="space-y-2">
            <Label htmlFor="deduct-quantity">Quantity to Deduct *</Label>
            <Input
              id="deduct-quantity"
              type="number"
              min="0.01"
              max={currentStock}
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={`Max: ${currentStock}`}
              className={parsedQuantity > currentStock ? 'border-red-500 focus-visible:ring-red-500' : ''}
              required
            />
            {parsedQuantity > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Remaining after deduction:
                </span>
                <span className={remainingStock < 0 ? 'text-red-600 font-medium' : 'text-foreground font-medium'}>
                  {remainingStock.toFixed(2)} {item.unit || 'units'}
                </span>
              </div>
            )}
            {parsedQuantity > currentStock && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertTriangle className="h-4 w-4" />
                <span>Cannot deduct more than available stock</span>
              </div>
            )}
          </div>

          {/* Reason input */}
          <div className="space-y-2">
            <Label htmlFor="deduct-reason">Reason / Notes (optional)</Label>
            <Textarea
              id="deduct-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Field spraying, Damaged goods, Inventory correction..."
              rows={3}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !isValidQuantity}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {saving ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Deducting...
                </>
              ) : (
                <>
                  <Minus className="h-4 w-4 mr-2" />
                  Deduct Stock
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
