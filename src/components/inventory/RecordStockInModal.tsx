import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { InventoryStockRow } from '@/services/inventoryReadModelService';
import type { Supplier } from '@/types';
import { recordInventoryStockIn, logInventoryAuditEvent } from '@/services/inventoryReadModelService';
import { createFinanceExpense } from '@/services/financeExpenseService';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { useProject } from '@/contexts/ProjectContext';

interface RecordStockInModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  item?: InventoryStockRow | null;
  suppliers: Supplier[];
  farmId?: string | null;
  projectId?: string | null;
  onRecorded?: () => void;
}

export function RecordStockInModal({
  open,
  onOpenChange,
  companyId,
  item,
  suppliers,
  farmId,
  projectId,
  onRecorded,
}: RecordStockInModalProps) {
  const { user } = useAuth();
  const { activeProject, activeFarmId } = useProject();
  const { addNotification } = useNotifications();
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [transactionType, setTransactionType] = useState('Purchase');
  const [supplierId, setSupplierId] = useState<'none' | string>('none');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const today = new Date().toISOString().slice(0, 10);
      setDate(today);
      if (item?.supplier_id) {
        setSupplierId(item.supplier_id as string);
      }
    } else {
      setQuantity('');
      setUnitCost('');
      setTransactionType('Purchase');
      setSupplierId('none');
      setNotes('');
    }
  }, [open, item?.supplier_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;
    const qty = Number(quantity);
    const cost = Number(unitCost);
    if (!qty || qty <= 0 || !cost || cost <= 0) {
      toast.error('Quantity and unit cost must be greater than zero.');
      return;
    }
    setSaving(true);
    try {
      const totalCost = qty * cost;
      const resolvedFarmId = farmId ?? activeProject?.farmId ?? activeFarmId ?? null;
      const resolvedProjectId = projectId ?? activeProject?.id ?? null;

      await recordInventoryStockIn({
        companyId,
        itemId: item.id,
        quantity: qty,
        unitCost: cost,
        transactionType,
        supplierId: supplierId === 'none' ? undefined : supplierId,
        date: date || new Date().toISOString(),
        notes: notes || undefined,
      });

      await logInventoryAuditEvent({
        companyId,
        action: 'STOCK_IN',
        inventoryItemId: item.id,
        itemName: item.name,
        quantity: qty,
        unit: item.unit || 'units',
        actorUserId: user?.id,
        actorName: user?.name ?? user?.email,
        notes: notes || undefined,
        metadata: { 
          transactionType, 
          unitCost: cost,
          totalCost,
        },
      });

      if (transactionType.toLowerCase() === 'purchase' && totalCost > 0) {
        if (resolvedFarmId) {
          await createFinanceExpense({
            companyId,
            farmId: resolvedFarmId,
            projectId: resolvedProjectId,
            category: 'inventory_purchase',
            amount: totalCost,
            note: `Inventory stock-in: ${item.name} (${qty} ${item.unit || 'units'} @ KES ${cost.toLocaleString()})`,
            expenseDate: date || new Date().toISOString().slice(0, 10),
            createdBy: user?.id ?? null,
          });
        } else {
          toast.warning('Stock recorded, but no active farm selected so expense was not auto-created.');
        }
      }

      addNotification({
        title: 'Stock Added',
        message: `${user?.name ?? 'User'} added ${qty} ${item.unit || 'units'} to ${item.name}`,
        toastType: 'success',
      });

      toast.success('Stock in recorded.');
      onOpenChange(false);
      onRecorded?.();
    } catch (error: any) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error('[RecordStockInModal] error', error);
      }
      toast.error(error?.message || 'Failed to record stock in.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle>Record Stock In</DialogTitle>
        </DialogHeader>
        {item ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <p className="text-sm font-medium text-foreground">{item.name}</p>
              <p className="text-xs text-muted-foreground">
                Current: {item.current_stock.toLocaleString()} {item.unit}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Quantity</label>
                <Input
                  type="number"
                  className="fv-input"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min={0}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Unit Cost</label>
                <Input
                  type="number"
                  step="0.01"
                  className="fv-input"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  min={0}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Transaction Type</label>
                <Select value={transactionType} onValueChange={setTransactionType}>
                  <SelectTrigger className="fv-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Purchase">Purchase</SelectItem>
                    <SelectItem value="Opening Balance">Opening Balance</SelectItem>
                    <SelectItem value="Adjustment">Adjustment</SelectItem>
                    <SelectItem value="Return In">Return In</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Supplier</label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="fv-input">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Date</label>
              <Input
                type="date"
                className="fv-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Notes</label>
              <Textarea
                className="fv-input resize-none"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes (invoice number, batch, etc.)"
              />
            </div>

            <DialogFooter>
              <button
                type="button"
                className="fv-btn fv-btn--secondary"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="fv-btn fv-btn--primary"
              >
                {saving ? 'Saving…' : 'Record Stock In'}
              </button>
            </DialogFooter>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">Select an item to record stock in.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

