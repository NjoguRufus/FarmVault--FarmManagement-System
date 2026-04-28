import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { InventoryStockRow } from '@/services/inventoryReadModelService';
import type { Supplier } from '@/types';
import { recordInventoryStockIn, logInventoryAuditEvent } from '@/services/inventoryReadModelService';
import { INVENTORY_STOCK_IN_EXPENSE_SOURCE } from '@/services/financeExpenseService';
import { ExpenseService } from '@/services/localData/ExpenseService';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { useProject } from '@/contexts/ProjectContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const UNIT_OPTIONS = ['ml', 'litres', 'grams', 'kg', 'pieces', 'meters'] as const;
type StockInUnit = (typeof UNIT_OPTIONS)[number];

function normalizeUnit(raw: string | null | undefined): StockInUnit | null {
  const u = String(raw ?? '').trim().toLowerCase();
  if (u === 'l' || u === 'liter' || u === 'litre' || u === 'liters') return 'litres';
  if (u === 'g' || u === 'gram') return 'grams';
  if (u === 'kgs' || u === 'kilogram') return 'kg';
  if (u === 'piece') return 'pieces';
  if (u === 'meter' || u === 'metre') return 'meters';
  if ((UNIT_OPTIONS as readonly string[]).includes(u)) return u as StockInUnit;
  return null;
}

function compatibleUnits(baseUnit: StockInUnit): StockInUnit[] {
  if (baseUnit === 'litres' || baseUnit === 'ml') return ['litres', 'ml'];
  if (baseUnit === 'kg' || baseUnit === 'grams') return ['kg', 'grams'];
  return [baseUnit];
}

function toBaseQuantity(quantity: number, from: StockInUnit, to: StockInUnit): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (from === to) return quantity;
  if (from === 'ml' && to === 'litres') return quantity / 1000;
  if (from === 'litres' && to === 'ml') return quantity * 1000;
  if (from === 'grams' && to === 'kg') return quantity / 1000;
  if (from === 'kg' && to === 'grams') return quantity * 1000;
  return null;
}

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
  const { can } = usePermissions();
  const canCreateExpense = can('expenses', 'create');
  const queryClient = useQueryClient();
  const { addNotification } = useNotifications();
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [transactionType, setTransactionType] = useState('Purchase');
  const [supplierId, setSupplierId] = useState<'none' | string>('none');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [quantityUnit, setQuantityUnit] = useState<StockInUnit>('pieces');
  const [countAsExpensePurchase, setCountAsExpensePurchase] = useState(true);
  const [saving, setSaving] = useState(false);

  const resolvedFarmId = farmId ?? activeProject?.farmId ?? activeFarmId ?? null;
  const resolvedProjectId = projectId ?? activeProject?.id ?? null;

  const purchaseLineTotal = useMemo(() => {
    const q = Number(quantity);
    const c = Number(unitCost);
    if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(c) || c <= 0) return null;
    return q * c;
  }, [quantity, unitCost]);
  const baseUnit = useMemo<StockInUnit>(() => normalizeUnit(item?.unit) ?? 'pieces', [item?.unit]);
  const quantityUnitOptions = useMemo(() => compatibleUnits(baseUnit), [baseUnit]);
  const convertedQuantity = useMemo(() => {
    const qty = Number(quantity);
    return toBaseQuantity(qty, quantityUnit, baseUnit);
  }, [quantity, quantityUnit, baseUnit]);

  const isPurchase = transactionType.toLowerCase() === 'purchase';
  const expenseToggleEnabled =
    isPurchase && canCreateExpense && Boolean(resolvedFarmId) && purchaseLineTotal != null && purchaseLineTotal > 0;

  useEffect(() => {
    if (open) {
      const today = new Date().toISOString().slice(0, 10);
      setDate(today);
      setCountAsExpensePurchase(true);
      setQuantityUnit(normalizeUnit(item?.unit) ?? 'pieces');
      if (item?.supplier_id) {
        setSupplierId(item.supplier_id as string);
      }
    } else {
      setQuantity('');
      setUnitCost('');
      setTransactionType('Purchase');
      setSupplierId('none');
      setNotes('');
      setCountAsExpensePurchase(true);
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
    if (!convertedQuantity || convertedQuantity <= 0) {
      toast.error('Invalid quantity conversion for selected unit.');
      return;
    }
    setSaving(true);
    try {
      const totalCost = qty * cost;
      const baseUnitCost = totalCost / convertedQuantity;

      await recordInventoryStockIn({
        companyId,
        itemId: item.id,
        quantity: convertedQuantity,
        unitCost: baseUnitCost,
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
        quantity: convertedQuantity,
        unit: item.unit || 'units',
        actorUserId: user?.id,
        actorName: user?.name ?? user?.email,
        notes: notes || undefined,
        metadata: { 
          transactionType, 
          enteredQuantity: qty,
          enteredUnit: quantityUnit,
          enteredUnitCost: cost,
          convertedQuantity,
          convertedToUnit: baseUnit,
          unitCost: baseUnitCost,
          totalCost,
        },
      });

      if (
        transactionType.toLowerCase() === 'purchase' &&
        totalCost > 0 &&
        countAsExpensePurchase &&
        canCreateExpense &&
        resolvedFarmId
      ) {
        try {
          await ExpenseService.create({
            companyId,
            farmId: resolvedFarmId,
            projectId: resolvedProjectId,
            category: 'inventory_purchase',
            amount: totalCost,
            note: `Inventory stock-in: ${item.name} (${qty} ${quantityUnit} -> ${convertedQuantity.toLocaleString()} ${baseUnit} @ KES ${cost.toLocaleString()}/${quantityUnit})`,
            expenseDate: date || new Date().toISOString().slice(0, 10),
            createdBy: user?.id ?? null,
            source: INVENTORY_STOCK_IN_EXPENSE_SOURCE,
            referenceId: crypto.randomUUID(),
          });
          void queryClient.invalidateQueries({ queryKey: ['financeExpenses'] });
          void queryClient.invalidateQueries({ queryKey: ['dashboard-expenses'] });
        } catch (expErr: unknown) {
          const msg = expErr instanceof Error ? expErr.message : String(expErr);
          toast.warning('Stock recorded, but expense was not saved.', { description: msg });
        }
      } else if (
        transactionType.toLowerCase() === 'purchase' &&
        totalCost > 0 &&
        countAsExpensePurchase &&
        !resolvedFarmId
      ) {
        toast.message('No farm in context — expense not recorded. Add on Expenses if needed.');
      } else if (
        transactionType.toLowerCase() === 'purchase' &&
        totalCost > 0 &&
        countAsExpensePurchase &&
        !canCreateExpense
      ) {
        toast.message('No permission to create expenses — log this purchase on Expenses if needed.');
      }

      addNotification({
        title: 'Stock Added',
        message: `${user?.name ?? 'User'} added ${convertedQuantity.toLocaleString()} ${baseUnit} to ${item.name}`,
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <label className="text-sm font-medium text-foreground">Unit</label>
                <Select value={quantityUnit} onValueChange={(v) => setQuantityUnit(v as StockInUnit)}>
                  <SelectTrigger className="fv-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {quantityUnitOptions.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            {quantity && convertedQuantity && quantityUnit !== baseUnit ? (
              <p className="text-xs text-muted-foreground">
                Auto-convert: {Number(quantity).toLocaleString()} {quantityUnit} = {convertedQuantity.toLocaleString()} {baseUnit}
              </p>
            ) : null}

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

            {isPurchase ? (
              <div
                className={cn(
                  'flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5',
                  !expenseToggleEnabled && 'opacity-80',
                )}
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium text-foreground">Count as expense</p>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {!resolvedFarmId
                      ? 'Pick a farm/project so this posts to finance.'
                      : !canCreateExpense
                        ? 'No expense permission — log manually if needed.'
                        : purchaseLineTotal == null
                          ? 'Enter quantity and unit cost.'
                          : 'Turn off if you already recorded this purchase on Expenses.'}
                  </p>
                </div>
                <Switch
                  checked={countAsExpensePurchase && expenseToggleEnabled}
                  onCheckedChange={(v) => setCountAsExpensePurchase(v)}
                  disabled={!expenseToggleEnabled}
                  className="shrink-0 mt-0.5"
                  aria-label="Count stock purchase as expense"
                />
              </div>
            ) : null}

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

