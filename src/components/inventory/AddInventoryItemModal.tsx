import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { InventoryCategoryRow } from '@/services/inventoryReadModelService';
import type { Supplier } from '@/types';
import {
  createInventoryCategory,
  createInventoryItem,
  recordInventoryStockIn,
} from '@/services/inventoryReadModelService';
import { createSupplier } from '@/services/suppliersService';
import { toast } from 'sonner';
import { useAuth } from '@clerk/react';

interface AddInventoryItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  categories: InventoryCategoryRow[];
  suppliers: Supplier[];
  onCreated?: () => void;
  createdBy?: string;
}

export function AddInventoryItemModal({
  open,
  onOpenChange,
  companyId,
  categories,
  suppliers,
  onCreated,
  createdBy,
}: AddInventoryItemModalProps) {
  const { sessionClaims } = useAuth();
  const sessionCompanyId = (sessionClaims?.company_id as string | undefined)?.trim();
  const [name, setName] = useState('');
  /**
   * Category selection values:
   * - UUID from `public.inventory_categories` (preferred)
   * - "template:<key>" for farmer-friendly defaults
   * - "add_new" to create a custom category
   */
  const [categoryId, setCategoryId] = useState<string>('');
  const [newCategoryName, setNewCategoryName] = useState('');

  const [unit, setUnit] = useState<'kg' | 'litres' | 'bags' | 'crates' | 'pieces' | 'metres' | 'other'>('kg');
  const [quantity, setQuantity] = useState('');
  const [costPerUnit, setCostPerUnit] = useState('');

  const [supplierId, setSupplierId] = useState<'none' | 'add_new' | string>('none');
  const [newSupplierName, setNewSupplierName] = useState('');

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sku, setSku] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [minStockLevel, setMinStockLevel] = useState('');
  const [reorderQuantity, setReorderQuantity] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);

  const predefinedCategories = useMemo(
    () => [
      { value: 'template:fertilizer', label: 'Fertilizer' },
      { value: 'template:chemical', label: 'Chemical / Pesticide' },
      { value: 'template:seed', label: 'Seed' },
      { value: 'template:equipment', label: 'Equipment' },
      { value: 'template:packaging', label: 'Packaging' },
      { value: 'template:fuel', label: 'Fuel' },
      { value: 'template:other', label: 'Other' },
      { value: 'add_new', label: 'Add new category…' },
    ],
    [],
  );

  const predefinedUnits = useMemo(
    () => [
      { value: 'kg', label: 'kg' },
      { value: 'litres', label: 'litres' },
      { value: 'bags', label: 'bags' },
      { value: 'crates', label: 'crates' },
      { value: 'pieces', label: 'pieces' },
      { value: 'metres', label: 'metres' },
      { value: 'other', label: 'other' },
    ],
    [],
  );

  const resetForm = () => {
    setName('');
    setCategoryId('');
    setNewCategoryName('');
    setUnit('kg');
    setQuantity('');
    setCostPerUnit('');
    setSupplierId('none');
    setNewSupplierName('');
    setShowAdvanced(false);
    setSku('');
    setItemCode('');
    setMinStockLevel('');
    setReorderQuantity('');
    setNotes('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !categoryId || !unit || !quantity) return;

    const activeCompanyId = sessionCompanyId || String(companyId ?? '').trim();
    if (!activeCompanyId) {
      const msg = 'Cannot create category/item: companyId is missing. Please re-login or switch company.';
      // eslint-disable-next-line no-console
      console.error('[AddInventoryItemModal] missing companyId', { companyId });
      toast.error(msg);
      return;
    }

    const normalizedUnit = unit.trim();
    if (!normalizedUnit) {
      toast.error('Please select a unit for this item.');
      return;
    }

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[AddInventoryItemModal] submit debug', {
        unitState: unit,
        normalizedUnit,
        quantity,
        categoryId,
      });
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Quantity must be greater than zero.');
      return;
    }

    setSaving(true);
    try {
      // Resolve category UUID
      let resolvedCategoryUuid: string | null = null;
      if (categoryId === 'add_new') {
        const nm = newCategoryName.trim();
        if (!nm) {
          toast.error('Please type the new category name.');
          setSaving(false);
          return;
        }

        const existing = categories.find(
          (c) => (c.name ?? '').trim().toLowerCase() === nm.toLowerCase(),
        );
        if (existing) {
          resolvedCategoryUuid = existing.id;
        } else {
          const createdCat = await createInventoryCategory({
            companyId: activeCompanyId,
            name: nm,
            description: null,
            color: null,
            icon: null,
            isActive: true,
          });
          resolvedCategoryUuid = createdCat.id;
        }
      } else if (categoryId.startsWith('template:')) {
        const key = categoryId.replace('template:', '').trim().toLowerCase();
        const label = predefinedCategories.find((c) => c.value === categoryId)?.label ?? key;
        const existing =
          categories.find((c) => (c.name ?? '').trim().toLowerCase() === label.toLowerCase()) ??
          categories.find((c) => (c.name ?? '').trim().toLowerCase() === key);

        if (existing) {
          resolvedCategoryUuid = existing.id;
        } else {
          const createdCat = await createInventoryCategory({
            companyId: activeCompanyId,
            name: label,
            description: null,
            color: null,
            icon: null,
            isActive: true,
          });
          resolvedCategoryUuid = createdCat.id;
        }
      } else {
        resolvedCategoryUuid = categoryId;
      }

      if (!resolvedCategoryUuid) {
        toast.error('Please select a category.');
        setSaving(false);
        return;
      }

      // Supplier UUID
      let resolvedSupplierId: string | undefined = undefined;
      if (supplierId === 'add_new') {
        const nameTrim = newSupplierName.trim();
        if (!nameTrim) {
          toast.error('Please type the supplier name, or select "None".');
          setSaving(false);
          return;
        }
        const existingSupplier = suppliers.find(
          (s) =>
            (s.name ?? '').trim().toLowerCase() === nameTrim.toLowerCase() &&
            s.companyId === activeCompanyId,
        );
        if (existingSupplier) {
          resolvedSupplierId = existingSupplier.id;
        } else {
          const createdSupplier = await createSupplier({
            companyId: activeCompanyId,
            name: nameTrim,
          });
          resolvedSupplierId = createdSupplier.id;
        }
      } else if (supplierId !== 'none') {
        resolvedSupplierId = supplierId;
      }

      const avgCost = costPerUnit ? Number(costPerUnit) : undefined;

      const finalInsertPayload = {
        companyId: activeCompanyId,
        name,
        categoryId: resolvedCategoryUuid,
        supplierId: resolvedSupplierId,
        unit: normalizedUnit,
        minStockLevel: showAdvanced && minStockLevel ? Number(minStockLevel) : undefined,
        reorderQuantity: showAdvanced && reorderQuantity ? Number(reorderQuantity) : undefined,
        averageCost: avgCost,
        itemCode: (showAdvanced ? (itemCode || sku || undefined) : undefined) ?? undefined,
        description: showAdvanced ? notes || undefined : undefined,
        unitSize: 1,
        unitSizeLabel: normalizedUnit,
        defaultProjectId: undefined,
        defaultCropStageId: undefined,
      } as const;

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[AddInventoryItemModal] before createInventoryItem', {
          unitState: unit,
          normalizedUnit,
          payloadUnit: finalInsertPayload.unit,
          payloadUnitSizeLabel: finalInsertPayload.unitSizeLabel,
          payload: finalInsertPayload,
        });
      }
      const created = await createInventoryItem(finalInsertPayload);

      const rpcPayload = {
        companyId: activeCompanyId,
        itemId: created.id,
        quantity: qty,
        unitCost: avgCost ?? 0,
        transactionType: 'opening_balance',
        supplierId: resolvedSupplierId,
        date: new Date().toISOString(),
        notes: showAdvanced ? notes || undefined : undefined,
      } as const;
      await recordInventoryStockIn(rpcPayload);

      toast.success('Inventory item created.');
      resetForm();
      onOpenChange(false);
      onCreated?.();
    } catch (error: any) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error('[AddInventoryItemModal] error', error);
      }
      toast.error(error?.message || 'Failed to create inventory item.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        if (!val) resetForm();
        onOpenChange(val);
      }}
    >
      <DialogContent className="max-w-lg w-[95vw] sm:w-full">
        <DialogHeader>
          <DialogTitle>Add Inventory Item</DialogTitle>
          <DialogDescription>
            Add an item in under 30 seconds. Only fill what you know — you can edit later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">Item Name</label>
            <Input
              className="fv-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dithane, DAP Fertilizer, Irrigation Pipe"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Category</label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="fv-input">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                  {predefinedCategories.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {categoryId === 'add_new' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  New category name <span className="text-muted-foreground">(optional)</span>
                </label>
                <Input
                  className="fv-input"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g. Greenhouse Tools"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Unit</label>
              <Select value={unit} onValueChange={(v) => setUnit(v as any)}>
                <SelectTrigger className="fv-input">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {predefinedUnits.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">Quantity</label>
              <Input
                type="number"
                className="fv-input"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="How many do you have right now?"
                min={0}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Cost per Unit <span className="text-muted-foreground">(optional)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  KSh
                </span>
                <Input
                  type="number"
                  step="0.01"
                  className="fv-input pl-12"
                  value={costPerUnit}
                  onChange={(e) => setCostPerUnit(e.target.value)}
                  placeholder="e.g. 250"
                  min={0}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Supplier <span className="text-muted-foreground">(optional)</span>
              </label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="fv-input">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="add_new">Add new supplier…</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {supplierId === 'add_new' && (
                <div className="pt-2">
                  <Input
                    className="fv-input"
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    placeholder="Supplier name (e.g. Agrovet mjini)"
                  />
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Advanced options
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                + Advanced options
              </>
            )}
          </button>

          {showAdvanced && (
            <div className="rounded-lg border border-border/60 bg-muted/10 p-3 sm:p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    SKU <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <Input className="fv-input" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Optional" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Item Code <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <Input className="fv-input" value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="Optional" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Minimum Stock Level <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <Input type="number" className="fv-input" value={minStockLevel} onChange={(e) => setMinStockLevel(e.target.value)} placeholder="e.g. 10" min={0} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Reorder Quantity <span className="text-muted-foreground">(optional)</span>
                  </label>
                  <Input type="number" className="fv-input" value={reorderQuantity} onChange={(e) => setReorderQuantity(e.target.value)} placeholder="e.g. 50" min={0} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Notes <span className="text-muted-foreground">(optional)</span>
                </label>
                <Textarea className="fv-input resize-none" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any extra details you want to remember" />
              </div>
            </div>
          )}

          <DialogFooter>
            <button
              type="button"
              className="fv-btn fv-btn--secondary"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim() || !categoryId || !quantity || !unit.trim()}
              className="fv-btn fv-btn--primary"
            >
              {saving ? 'Saving…' : 'Save Item'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

