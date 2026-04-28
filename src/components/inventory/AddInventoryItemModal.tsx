/**
 * Add inventory item — unit-driven flow (no packaging type).
 *
 * Example payload shape before API mapping:
 * - Continuous: { item_name, unit: "litres", amount_per_item, quantity (items), total_quantity, price_per_item?, total_cost? }
 * - Count: { item_name, unit: "pieces", quantity, total_quantity }
 *
 * @example
 * ```tsx
 * <AddInventoryItemModal
 *   open={open}
 *   onOpenChange={setOpen}
 *   companyId={companyId}
 *   categories={categories}
 *   suppliers={suppliers}
 *   onCreated={({ itemId, name }) => selectItem(itemId)}
 * />
 * ```
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { InventoryCategoryRow } from '@/services/inventoryReadModelService';
import type { Supplier } from '@/types';
import {
  createInventoryCategory,
  createInventoryItem,
  listInventoryStock,
  recordInventoryStockIn,
  logInventoryAuditEvent,
} from '@/services/inventoryReadModelService';
import { createSupplier } from '@/services/suppliersService';
import { toast } from 'sonner';
import { useAuth } from '@clerk/react';
import { useAuth as useAppAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { INVENTORY_CATEGORIES_QUERY_KEY, INVENTORY_STOCK_QUERY_KEY } from '@/hooks/useInventoryReadModels';
import { useProject } from '@/contexts/ProjectContext';
import { usePermissions } from '@/hooks/usePermissions';
import { ExpenseService } from '@/services/localData/ExpenseService';
import {
  financeExpenseExistsByReference,
  INVENTORY_OPENING_EXPENSE_SOURCE,
} from '@/services/financeExpenseService';
import { Switch } from '@/components/ui/switch';
import { CostSection } from '@/components/inventory/add-item/CostSection';
import { DynamicQuantityFields } from '@/components/inventory/add-item/DynamicQuantityFields';
import { UnitSelector } from '@/components/inventory/add-item/UnitSelector';
import { isContinuousUnit, type StockUnit } from '@/components/inventory/add-item/inventoryAddItemUnits';
import { parseNonNegativeNumber, parsePositiveNumber } from '@/components/inventory/add-item/validation';
import { parseQuantityForSubmit, validateQuantityStep } from '@/components/inventory/add-item/validationHandler';

type WizardStep = 1 | 2 | 3;

const DRAFT_STORAGE_PREFIX = 'fv-add-inv-draft:v2:';

type AddInventoryDraft = {
  step: WizardStep;
  slideDir: 1 | -1;
  name: string;
  categoryId: string;
  newCategoryName: string;
  stockUnit: StockUnit;
  amountPerItem: string;
  numberOfItems: string;
  pricePerItem: string;
  totalCost: string;
  totalCostManual?: boolean;
  supplierId: 'none' | 'add_new' | string;
  newSupplierName: string;
  showAdvanced: boolean;
  sku: string;
  itemCode: string;
  minStockLevel: string;
  reorderQuantity: string;
  notes: string;
  countAsExpense?: boolean;
};

function normalizeLegacyStockUnit(raw: unknown): StockUnit | null {
  if (typeof raw !== 'string') return null;
  const u = raw.trim();
  const legacy: Record<string, StockUnit> = {
    g: 'grams',
    grams: 'grams',
    kg: 'kg',
    ml: 'ml',
    litres: 'litres',
    liter: 'litres',
    pieces: 'pieces',
    metres: 'meters',
    meters: 'meters',
  };
  return legacy[u] ?? (['ml', 'litres', 'kg', 'grams', 'pieces', 'meters'].includes(u) ? (u as StockUnit) : null);
}

function parseStoredDraft(raw: string): Partial<AddInventoryDraft> | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return null;

    const stockUnit =
      normalizeLegacyStockUnit(o.stockUnit) ?? normalizeLegacyStockUnit(o.unit) ?? 'kg';

    const amountPerItem =
      (typeof o.amountPerItem === 'string' ? o.amountPerItem : undefined) ??
      (typeof o.amount === 'string' ? o.amount : undefined) ??
      (typeof o.unitsPerPack === 'string' ? o.unitsPerPack : '') ??
      '';

    const numberOfItems =
      (typeof o.numberOfItems === 'string' ? o.numberOfItems : undefined) ??
      (typeof o.numberOfPacks === 'string' ? o.numberOfPacks : '') ??
      '';

    const pricePerItem =
      (typeof o.pricePerItem === 'string' ? o.pricePerItem : undefined) ??
      (typeof o.pricePerPack === 'string' ? o.pricePerPack : '') ??
      '';

    const totalCost =
      (typeof o.totalCost === 'string' ? o.totalCost : undefined) ??
      (typeof o.totalPrice === 'string' ? o.totalPrice : '') ??
      '';

    return {
      ...(o as Partial<AddInventoryDraft>),
      stockUnit,
      amountPerItem,
      numberOfItems,
      pricePerItem,
      totalCost,
    };
  } catch {
    return null;
  }
}

interface AddInventoryItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  categories: InventoryCategoryRow[];
  suppliers: Supplier[];
  /** Called after a successful create; includes new item id when available (e.g. pre-select in Log Work). */
  onCreated?: (meta?: { itemId: string; name: string }) => void;
  createdBy?: string;
  /** Pre-fill when opened from another surface (e.g. Log Work typeahead). */
  externalPrefill?: {
    name: string;
    categoryTemplate?: string;
    /** Prefill step 3 total (KES), e.g. from a recorded expense. */
    totalCostKes?: number;
    /** Set false when purchase was already booked as an expense (default true / unchanged). */
    countAsExpense?: boolean;
  } | null;
  /** Increment when `externalPrefill` should re-apply (same name, new open). */
  externalPrefillNonce?: number;
  /** Farm for booking an expense (falls back to active project). */
  farmId?: string | null;
  projectId?: string | null;
}

export function AddInventoryItemModal({
  open,
  onOpenChange,
  companyId,
  categories,
  suppliers,
  onCreated,
  createdBy,
  externalPrefill = null,
  externalPrefillNonce = 0,
  farmId: farmIdProp = null,
  projectId: projectIdProp = null,
}: AddInventoryItemModalProps) {
  const { sessionClaims } = useAuth();
  const sessionCompanyId = (sessionClaims?.company_id as string | undefined)?.trim();
  const { user } = useAppAuth();
  const { activeProject, activeFarmId } = useProject();
  const { can } = usePermissions();
  const canCreateExpense = can('expenses', 'create');
  const { addNotification } = useNotifications();
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();

  const resolvedFarmId = farmIdProp ?? activeProject?.farmId ?? activeFarmId ?? null;
  const resolvedProjectId = projectIdProp ?? activeProject?.id ?? null;

  const [step, setStep] = useState<WizardStep>(1);
  const [slideDir, setSlideDir] = useState<1 | -1>(1);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const unitSelectTriggerRef = useRef<HTMLButtonElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [newCategoryName, setNewCategoryName] = useState('');

  const [stockUnit, setStockUnit] = useState<StockUnit>('kg');
  const [amountPerItem, setAmountPerItem] = useState('');
  const [numberOfItems, setNumberOfItems] = useState('');

  const [pricePerItem, setPricePerItem] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [totalCostManual, setTotalCostManual] = useState(false);

  const [supplierId, setSupplierId] = useState<'none' | 'add_new' | string>('none');
  const [newSupplierName, setNewSupplierName] = useState('');

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sku, setSku] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [minStockLevel, setMinStockLevel] = useState('');
  const [reorderQuantity, setReorderQuantity] = useState('');
  const [notes, setNotes] = useState('');

  const [countAsExpense, setCountAsExpense] = useState(true);

  const [saving, setSaving] = useState(false);

  const draftKey = useMemo(() => `${DRAFT_STORAGE_PREFIX}${String(companyId || '').trim() || 'none'}`, [companyId]);

  const clearDraftStorage = useCallback(() => {
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }, [draftKey]);

  const predefinedCategories = useMemo(
    () => [
      { value: 'template:fertilizer', label: 'Fertilizer', defaultUnit: 'kg' as StockUnit },
      { value: 'template:chemical', label: 'Chemical / Pesticide', defaultUnit: 'ml' as StockUnit },
      { value: 'template:fuel', label: 'Fuel', defaultUnit: 'litres' as StockUnit },
      { value: 'template:tying-ropes-sacks', label: 'Tying Ropes / Sacks', defaultUnit: 'pieces' as StockUnit },
      { value: 'add_new', label: '+ Add new category…', defaultUnit: null },
    ],
    [],
  );

  const getCategoryDefaultUnit = (catId: string, catName?: string): StockUnit | null => {
    const predefined = predefinedCategories.find((c) => c.value === catId);
    if (predefined?.defaultUnit) return predefined.defaultUnit;

    const n = catName?.toLowerCase() || '';
    if (n.includes('fertilizer') || n.includes('fertiliser')) return 'kg';
    if (n.includes('chemical') || n.includes('pesticide') || n.includes('herbicide') || n.includes('fungicide')) return 'ml';
    if (n.includes('fuel') || n.includes('diesel') || n.includes('petrol')) return 'litres';
    if (n.includes('rope') || n.includes('sack') || n.includes('tying')) return 'pieces';
    if (n.includes('seed')) return 'grams';

    return null;
  };

  const handleCategoryChange = (newCategoryId: string) => {
    setCategoryId(newCategoryId);

    const matchedCategory = categories.find((c) => c.id === newCategoryId);
    const defaultUnit = getCategoryDefaultUnit(newCategoryId, matchedCategory?.name ?? undefined);

    if (defaultUnit) {
      setStockUnit(defaultUnit);
    }
  };

  const liveTotalQuantity = useMemo(() => {
    const items = parsePositiveNumber(numberOfItems);
    if (!Number.isFinite(items) || items <= 0) return NaN;
    if (isContinuousUnit(stockUnit)) {
      const per = parsePositiveNumber(amountPerItem);
      if (!Number.isFinite(per) || per <= 0) return NaN;
      return per * items;
    }
    return items;
  }, [stockUnit, amountPerItem, numberOfItems]);

  const itemsNumForCost = parsePositiveNumber(numberOfItems);
  const priceNumForAuto = parseNonNegativeNumber(pricePerItem);
  const autoTotalCost = useMemo(() => {
    if (!Number.isFinite(itemsNumForCost) || itemsNumForCost <= 0) return NaN;
    if (!Number.isFinite(priceNumForAuto)) return NaN;
    return Math.round(itemsNumForCost * priceNumForAuto * 100) / 100;
  }, [itemsNumForCost, priceNumForAuto]);

  /** Positive KES total for opening purchase (matches submit logic). */
  const openingExpenseAmount = useMemo(() => {
    const itemsCount = parsePositiveNumber(numberOfItems);
    const priceNum = pricePerItem.trim() ? parseNonNegativeNumber(pricePerItem) : NaN;
    const totalNum = totalCost.trim() ? parseNonNegativeNumber(totalCost) : NaN;
    let effectiveTotal: number | undefined;
    if (totalCostManual && Number.isFinite(totalNum)) effectiveTotal = totalNum;
    else if (Number.isFinite(priceNum) && Number.isFinite(itemsCount) && itemsCount > 0) {
      effectiveTotal = itemsCount * priceNum;
    } else if (Number.isFinite(totalNum)) effectiveTotal = totalNum;
    if (effectiveTotal != null && Number.isFinite(effectiveTotal) && effectiveTotal > 0) return effectiveTotal;
    return null;
  }, [numberOfItems, pricePerItem, totalCost, totalCostManual]);

  const expenseToggleEnabled =
    canCreateExpense && Boolean(resolvedFarmId) && openingExpenseAmount != null;

  useEffect(() => {
    if (totalCostManual) return;
    if (Number.isFinite(autoTotalCost)) setTotalCost(String(autoTotalCost));
    else if (!pricePerItem.trim() && !numberOfItems.trim()) setTotalCost('');
  }, [autoTotalCost, totalCostManual, pricePerItem, numberOfItems]);

  const handlePricePerItemChange = (v: string) => {
    setTotalCostManual(false);
    setPricePerItem(v);
  };

  const handleNumberOfItemsChange = (v: string) => {
    setTotalCostManual(false);
    setNumberOfItems(v);
  };

  const handleTotalCostChange = (v: string) => {
    setTotalCostManual(true);
    setTotalCost(v);
  };

  const handleStockUnitChange = (u: StockUnit) => {
    setStockUnit(u);
    if (!isContinuousUnit(u)) setAmountPerItem('');
  };

  const canGoToStep2 = Boolean(
    name.trim() && categoryId && (categoryId !== 'add_new' || newCategoryName.trim()),
  );

  const step2Error = validateQuantityStep(stockUnit, amountPerItem, numberOfItems);
  const canGoToStep3 = step2Error == null;

  const goNext = () => {
    if (step === 1 && canGoToStep2) {
      setSlideDir(1);
      setStep(2);
    } else if (step === 2 && canGoToStep3) {
      setSlideDir(1);
      setStep(3);
    }
  };

  const goBack = () => {
    if (step === 2) {
      setSlideDir(-1);
      setStep(1);
    } else if (step === 3) {
      setSlideDir(-1);
      setStep(2);
    }
  };

  const applyDraft = useCallback((d: Partial<AddInventoryDraft>) => {
    setStep((d.step as WizardStep) ?? 1);
    setSlideDir(d.slideDir === -1 ? -1 : 1);
    setName(d.name ?? '');
    setCategoryId(d.categoryId ?? '');
    setNewCategoryName(d.newCategoryName ?? '');
    const u = normalizeLegacyStockUnit(d.stockUnit) ?? 'kg';
    setStockUnit(u);
    setAmountPerItem(d.amountPerItem ?? '');
    setNumberOfItems(d.numberOfItems ?? '');
    setPricePerItem(d.pricePerItem ?? '');
    setTotalCost(d.totalCost ?? '');
    setTotalCostManual(Boolean(d.totalCostManual));
    setSupplierId((d.supplierId as 'none' | 'add_new' | string) ?? 'none');
    setNewSupplierName(d.newSupplierName ?? '');
    setShowAdvanced(Boolean(d.showAdvanced));
    setSku(d.sku ?? '');
    setItemCode(d.itemCode ?? '');
    setMinStockLevel(d.minStockLevel ?? '');
    setReorderQuantity(d.reorderQuantity ?? '');
    setNotes(d.notes ?? '');
    setCountAsExpense(d.countAsExpense !== false);
  }, []);

  const resetForm = () => {
    setStep(1);
    setSlideDir(1);
    setName('');
    setCategoryId('');
    setNewCategoryName('');
    setStockUnit('kg');
    setAmountPerItem('');
    setNumberOfItems('');
    setPricePerItem('');
    setTotalCost('');
    setTotalCostManual(false);
    setSupplierId('none');
    setNewSupplierName('');
    setShowAdvanced(false);
    setSku('');
    setItemCode('');
    setMinStockLevel('');
    setReorderQuantity('');
    setNotes('');
    setCountAsExpense(true);
  };

  useLayoutEffect(() => {
    if (!open || !companyId) return;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = parseStoredDraft(raw);
      if (parsed && typeof parsed === 'object') {
        applyDraft(parsed);
      }
    } catch {
      /* ignore */
    }
  }, [open, companyId, draftKey, applyDraft]);

  useEffect(() => {
    if (!open || !companyId) return;
    const id = window.setTimeout(() => {
      const draft: AddInventoryDraft = {
        step,
        slideDir,
        name,
        categoryId,
        newCategoryName,
        stockUnit,
        amountPerItem,
        numberOfItems,
        pricePerItem,
        totalCost,
        totalCostManual,
        supplierId,
        newSupplierName,
        showAdvanced,
        sku,
        itemCode,
        minStockLevel,
        reorderQuantity,
        notes,
        countAsExpense,
      };
      try {
        sessionStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        /* ignore quota */
      }
    }, 400);
    return () => window.clearTimeout(id);
  }, [
    open,
    companyId,
    draftKey,
    step,
    slideDir,
    name,
    categoryId,
    newCategoryName,
    stockUnit,
    amountPerItem,
    numberOfItems,
    pricePerItem,
    totalCost,
    totalCostManual,
    supplierId,
    newSupplierName,
    showAdvanced,
    sku,
    itemCode,
    minStockLevel,
    reorderQuantity,
    notes,
    countAsExpense,
  ]);

  const handleDialogOpenChange = (val: boolean) => {
    if (!val) {
      clearDraftStorage();
      resetForm();
      onOpenChange(false);
      return;
    }
    onOpenChange(val);
  };

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      if (step === 1) nameInputRef.current?.focus();
      else if (step === 2) unitSelectTriggerRef.current?.focus();
      else if (step === 3) priceInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const raw = externalPrefill?.name?.trim();
    if (!raw) return;
    setName(raw);
    const tpl = externalPrefill?.categoryTemplate?.trim();
    if (tpl) {
      handleCategoryChange(tpl);
    }
    const kes = externalPrefill?.totalCostKes;
    if (kes != null && Number.isFinite(kes) && kes > 0) {
      setTotalCost(String(kes));
      setTotalCostManual(true);
      setPricePerItem('');
    }
    if (externalPrefill?.countAsExpense === false) {
      setCountAsExpense(false);
    }
    setStep(1);
    setSlideDir(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply when dialog opens / nonce bumps
  }, [
    open,
    externalPrefillNonce,
    externalPrefill?.name,
    externalPrefill?.categoryTemplate,
    externalPrefill?.totalCostKes,
    externalPrefill?.countAsExpense,
  ]);

  const handleSubmit = async () => {
    if (step !== 3) return;
    if (!name.trim() || !categoryId) return;

    const activeCompanyId = sessionCompanyId || String(companyId ?? '').trim();
    if (!activeCompanyId) {
      toast.error('Cannot create item: companyId is missing. Please re-login or switch company.');
      return;
    }

    const qtyErr = validateQuantityStep(stockUnit, amountPerItem, numberOfItems);
    if (qtyErr) {
      toast.error(qtyErr);
      return;
    }

    const { unitSize, stockQuantity } = parseQuantityForSubmit(stockUnit, amountPerItem, numberOfItems);
    if (!Number.isFinite(stockQuantity) || stockQuantity <= 0) {
      toast.error('Quantity must be greater than zero.');
      return;
    }

    const normalizedUnit = stockUnit.trim();
    if (pricePerItem.trim()) {
      const p = parseNonNegativeNumber(pricePerItem);
      if (!Number.isFinite(p)) {
        toast.error('Enter a valid price per item.');
        return;
      }
    }
    if (totalCost.trim()) {
      const t = parseNonNegativeNumber(totalCost);
      if (!Number.isFinite(t)) {
        toast.error('Enter a valid total cost.');
        return;
      }
    }

    setSaving(true);
    try {
      let resolvedCategoryUuid: string | null = null;
      if (categoryId === 'add_new') {
        const nm = newCategoryName.trim();
        if (!nm) {
          toast.error('Please type the new category name.');
          setSaving(false);
          return;
        }

        const existing = categories.find((c) => (c.name ?? '').trim().toLowerCase() === nm.toLowerCase());
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
        const cleanLabel = label.replace(/^\+\s*/, '');
        const existing =
          categories.find((c) => (c.name ?? '').trim().toLowerCase() === cleanLabel.toLowerCase()) ??
          categories.find((c) => (c.name ?? '').trim().toLowerCase() === key);

        if (existing) {
          resolvedCategoryUuid = existing.id;
        } else {
          const createdCat = await createInventoryCategory({
            companyId: activeCompanyId,
            name: cleanLabel,
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
            (s.name ?? '').trim().toLowerCase() === nameTrim.toLowerCase() && s.companyId === activeCompanyId,
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

      const itemsCount = parsePositiveNumber(numberOfItems);
      const priceNum = pricePerItem.trim() ? parseNonNegativeNumber(pricePerItem) : NaN;
      const totalNum = totalCost.trim() ? parseNonNegativeNumber(totalCost) : NaN;

      let effectiveTotal: number | undefined;
      if (totalCostManual && Number.isFinite(totalNum)) {
        effectiveTotal = totalNum;
      } else if (Number.isFinite(priceNum)) {
        effectiveTotal = itemsCount * priceNum;
      } else if (Number.isFinite(totalNum)) {
        effectiveTotal = totalNum;
      }

      let avgCost: number | undefined = undefined;
      if (effectiveTotal != null && Number.isFinite(effectiveTotal) && stockQuantity > 0) {
        avgCost = effectiveTotal / stockQuantity;
      }

      const finalInsertPayload = {
        companyId: activeCompanyId,
        name,
        categoryId: resolvedCategoryUuid,
        supplierId: resolvedSupplierId,
        unit: normalizedUnit,
        minStockLevel: showAdvanced && minStockLevel ? Number(minStockLevel) : undefined,
        reorderQuantity: showAdvanced && reorderQuantity ? Number(reorderQuantity) : undefined,
        averageCost: avgCost ?? 0,
        itemCode: (showAdvanced ? itemCode || sku || undefined : undefined) ?? undefined,
        description: showAdvanced ? notes || undefined : undefined,
        unitSize,
        unitSizeLabel: normalizedUnit,
        defaultProjectId: undefined,
        defaultCropStageId: undefined,
      } as const;

      const normalizedItemName = name.trim().toLowerCase();
      const existingExact = (await listInventoryStock({
        companyId: activeCompanyId,
        search: name.trim(),
      })).find((row) => row.name.trim().toLowerCase() === normalizedItemName);

      if (existingExact) {
        const existingTotalCost = (avgCost ?? 0) * stockQuantity;
        await recordInventoryStockIn({
          companyId: activeCompanyId,
          itemId: existingExact.id,
          quantity: stockQuantity,
          unitCost: avgCost ?? 0,
          transactionType: 'purchase',
          supplierId: resolvedSupplierId,
          date: new Date().toISOString(),
          notes: `Existing item detected while adding item. Converted to stock-in.${showAdvanced && notes ? ` ${notes}` : ''}`,
        });
        await logInventoryAuditEvent({
          companyId: activeCompanyId,
          action: 'STOCK_IN',
          inventoryItemId: existingExact.id,
          itemName: existingExact.name,
          quantity: stockQuantity,
          unit: existingExact.unit,
          actorUserId: user?.id ?? createdBy,
          actorName: user?.name ?? user?.email,
          notes: 'Auto-converted duplicate add-item to stock-in',
          metadata: {
            source: 'add_inventory_duplicate_to_stock_in',
            enteredName: name.trim(),
            enteredUnit: normalizedUnit,
            stockInUnitCost: avgCost ?? 0,
            stockInTotalCost: existingTotalCost,
          },
        });

        toast.success('Item already exists. Recorded as stock-in instead.');
        void queryClient.invalidateQueries({ queryKey: [INVENTORY_STOCK_QUERY_KEY] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard-inventory-supa', activeCompanyId] });
        handleDialogOpenChange(false);
        onCreated?.({ itemId: existingExact.id, name: existingExact.name });
        return;
      }

      const created = await createInventoryItem(finalInsertPayload);

      const rpcPayload = {
        companyId: activeCompanyId,
        itemId: created.id,
        quantity: stockQuantity,
        unitCost: avgCost ?? 0,
        transactionType: 'opening_balance',
        supplierId: resolvedSupplierId,
        date: new Date().toISOString(),
        notes: showAdvanced ? notes || undefined : undefined,
      } as const;
      await recordInventoryStockIn(rpcPayload);

      await logInventoryAuditEvent({
        companyId: activeCompanyId,
        action: 'ITEM_CREATED',
        inventoryItemId: created.id,
        itemName: name,
        quantity: stockQuantity,
        unit: normalizedUnit,
        actorUserId: user?.id ?? createdBy,
        actorName: user?.name ?? user?.email,
        notes: showAdvanced ? notes || undefined : undefined,
        metadata: {
          category: resolvedCategoryUuid,
          unit: normalizedUnit,
          unitSize,
        },
      });

      const expenseKes =
        effectiveTotal != null && Number.isFinite(effectiveTotal) && effectiveTotal > 0 ? effectiveTotal : null;
      if (countAsExpense && expenseKes != null && resolvedFarmId && canCreateExpense) {
        try {
          const dup = await financeExpenseExistsByReference(
            activeCompanyId,
            INVENTORY_OPENING_EXPENSE_SOURCE,
            created.id,
          );
          if (dup) {
            toast.message('Expense link already exists for this item.');
          } else {
            await ExpenseService.create({
              companyId: activeCompanyId,
              farmId: resolvedFarmId,
              projectId: resolvedProjectId,
              category: 'inventory_purchase',
              amount: expenseKes,
              note: `Inventory — new item: ${name.trim()} (opening stock, KES ${expenseKes.toLocaleString()})`,
              expenseDate: new Date().toISOString().slice(0, 10),
              createdBy: user?.id ?? createdBy ?? null,
              source: INVENTORY_OPENING_EXPENSE_SOURCE,
              referenceId: created.id,
            });
            void queryClient.invalidateQueries({ queryKey: ['financeExpenses'] });
            void queryClient.invalidateQueries({ queryKey: ['dashboard-expenses'] });
          }
        } catch (expErr: unknown) {
          const msg = expErr instanceof Error ? expErr.message : String(expErr);
          toast.warning('Item created, but expense was not saved.', { description: msg });
        }
      } else if (countAsExpense && expenseKes != null && !resolvedFarmId) {
        toast.message('No farm in context — expense not recorded. Add it on Expenses if needed.');
      } else if (countAsExpense && expenseKes != null && !canCreateExpense) {
        toast.message('No permission to create expenses — log this purchase on the Expenses page if needed.');
      }

      addNotification({
        title: 'Item Created',
        message: `${user?.name ?? 'User'} created new inventory item: ${name}`,
        toastType: 'success',
      });

      toast.success('Inventory item created.');
      void queryClient.invalidateQueries({ queryKey: [INVENTORY_STOCK_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: [INVENTORY_CATEGORIES_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-inventory-supa', activeCompanyId] });
      handleDialogOpenChange(false);
      onCreated?.({ itemId: created.id, name: name.trim() });
    } catch (error: any) {
      const code = (error as { code?: string })?.code;
      const message = String((error as { message?: string })?.message ?? '');
      const isDuplicateName =
        code === '23505' &&
        (message.includes('uq_inventory_item_master_company_name') ||
          message.toLowerCase().includes('duplicate key value'));
      if (isDuplicateName) {
        try {
          const existingExact = (await listInventoryStock({
            companyId: activeCompanyId,
            search: name.trim(),
          })).find((row) => row.name.trim().toLowerCase() === name.trim().toLowerCase());
          if (existingExact) {
            await recordInventoryStockIn({
              companyId: activeCompanyId,
              itemId: existingExact.id,
              quantity: stockQuantity,
              unitCost: avgCost ?? 0,
              transactionType: 'purchase',
              supplierId: resolvedSupplierId,
              date: new Date().toISOString(),
              notes: `Duplicate item create fallback to stock-in.${showAdvanced && notes ? ` ${notes}` : ''}`,
            });
            toast.success('Item already exists. Recorded as stock-in instead.');
            void queryClient.invalidateQueries({ queryKey: [INVENTORY_STOCK_QUERY_KEY] });
            handleDialogOpenChange(false);
            onCreated?.({ itemId: existingExact.id, name: existingExact.name });
            return;
          }
        } catch {
          // fall through to error toast
        }
      }
      toast.error(error?.message || 'Failed to create inventory item.');
    } finally {
      setSaving(false);
    }
  };

  const formKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== 'Enter') return;
    const t = e.target as HTMLElement;
    if (t.tagName === 'TEXTAREA') return;

    if (step === 1) {
      if (canGoToStep2) {
        e.preventDefault();
        goNext();
      } else {
        e.preventDefault();
      }
      return;
    }
    if (step === 2) {
      if (canGoToStep3) {
        e.preventDefault();
        goNext();
      } else {
        e.preventDefault();
      }
      return;
    }
    if (step === 3) {
      e.preventDefault();
    }
  };

  const stepTitle = step === 1 ? 'What are you adding?' : step === 2 ? 'How much do you have?' : 'Cost (optional)';

  const stepsMeta = useMemo(
    () =>
      [
        { n: 1 as const, label: 'Item' },
        { n: 2 as const, label: 'Quantity' },
        { n: 3 as const, label: 'Cost' },
      ] as const,
    [],
  );

  const motionVariants = {
    enter: (dir: number) =>
      reducedMotion
        ? { opacity: 0 }
        : { opacity: 0, x: dir * 18 },
    center: reducedMotion ? { opacity: 1 } : { opacity: 1, x: 0 },
    exit: (dir: number) =>
      reducedMotion
        ? { opacity: 0 }
        : { opacity: 0, x: -dir * 10 },
  };

  const saveDisabled =
    saving ||
    !name.trim() ||
    !categoryId ||
    !numberOfItems.trim() ||
    Boolean(validateQuantityStep(stockUnit, amountPerItem, numberOfItems));

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        showCloseButton={step === 3}
        onInteractOutside={(e) => {
          if (step < 3 && !saving) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (step < 3 && !saving) e.preventDefault();
        }}
        className={cn(
          'max-w-[430px] w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto gap-0',
          'bg-fv-cream dark:bg-card border border-border/50 shadow-lg',
          'rounded-md p-4 sm:p-5',
        )}
      >
        <DialogHeader className="space-y-2.5 pb-3 text-left">
          <DialogTitle className="sr-only">Add Inventory Item</DialogTitle>

          <div className="space-y-2">
            <div className="flex gap-1.5">
              {stepsMeta.map((s) => (
                <div
                  key={s.n}
                  className={cn(
                    'h-1.5 flex-1 rounded-full transition-colors duration-200',
                    step >= s.n ? 'bg-fv-olive/80 dark:bg-primary' : 'bg-muted dark:bg-muted',
                  )}
                />
              ))}
            </div>
            <div className="flex justify-between gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-[11px]">
              {stepsMeta.map((s) => (
                <span
                  key={s.n}
                  className={cn(
                    'min-w-0 truncate',
                    step === s.n && 'text-fv-olive dark:text-foreground',
                    step > s.n && 'text-foreground/75',
                  )}
                >
                  {s.n} {s.label}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-0.5">
            <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">{stepTitle}</h2>
            <p className="text-[11px] text-muted-foreground sm:text-xs">Draft auto-saves. Create the item on Save.</p>
          </div>
        </DialogHeader>

        <form onKeyDown={formKeyDown} className="flex min-h-0 flex-1 flex-col">
          <div className="relative min-h-[220px] flex-1 overflow-hidden">
            <AnimatePresence mode="wait" custom={slideDir}>
              <motion.div
                key={step}
                custom={slideDir}
                variants={motionVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: reducedMotion ? 0.12 : 0.28, ease: 'easeOut' }}
                className="space-y-3"
              >
                {step === 1 && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground" htmlFor="inv-item-name">
                        Item name
                      </label>
                      <Input
                        id="inv-item-name"
                        ref={nameInputRef}
                        className="fv-input h-12 text-base"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. DAP Fertilizer, Dithane, Diesel"
                        required
                        autoComplete="off"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Category</label>
                      <Select value={categoryId} onValueChange={handleCategoryChange}>
                        <SelectTrigger className="fv-input h-11">
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
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-foreground">New category name</label>
                        <Input
                          className="fv-input"
                          value={newCategoryName}
                          onChange={(e) => setNewCategoryName(e.target.value)}
                          placeholder="e.g. Seeds, Equipment"
                        />
                      </div>
                    )}
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4 text-center">
                    <div className="space-y-1.5 text-left">
                      <UnitSelector
                        ref={unitSelectTriggerRef}
                        value={stockUnit}
                        onChange={handleStockUnitChange}
                        triggerClassName="fv-input h-11 w-full"
                      />
                    </div>

                    <div className="text-left">
                      <DynamicQuantityFields
                        unit={stockUnit}
                        amountPerItem={amountPerItem}
                        numberOfItems={numberOfItems}
                        onAmountPerItemChange={setAmountPerItem}
                        onNumberOfItemsChange={handleNumberOfItemsChange}
                        totalQuantity={liveTotalQuantity}
                        reducedMotion={reducedMotion}
                      />
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-4">
                    <CostSection
                      ref={priceInputRef}
                      pricePerItem={pricePerItem}
                      onPricePerItemChange={handlePricePerItemChange}
                      totalCost={totalCost}
                      onTotalCostChange={handleTotalCostChange}
                      autoTotalHint={
                        Number.isFinite(autoTotalCost) ? String(autoTotalCost) : Number.isFinite(itemsNumForCost) ? '0' : undefined
                      }
                      currencyPrefix="KSh"
                    />

                    <div
                      className={cn(
                        'flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5',
                        !expenseToggleEnabled && 'opacity-80',
                      )}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-medium text-foreground">Count as expense</p>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          {openingExpenseAmount == null
                            ? 'Enter a total cost above to record an expense.'
                            : !resolvedFarmId
                              ? 'Pick a farm/project (header) so this posts to finance.'
                              : !canCreateExpense
                                ? 'You can’t create expenses — turn this off if you already logged it manually.'
                                : 'Turn off if you already added this purchase on the Expenses page.'}
                        </p>
                      </div>
                      <Switch
                        checked={countAsExpense && expenseToggleEnabled}
                        onCheckedChange={(v) => setCountAsExpense(v)}
                        disabled={!expenseToggleEnabled}
                        className="shrink-0 mt-0.5"
                        aria-label="Count inventory purchase as expense"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Supplier</label>
                      <Select value={supplierId} onValueChange={setSupplierId}>
                        <SelectTrigger className="fv-input h-11">
                          <SelectValue placeholder="Optional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="add_new">+ Add new supplier…</SelectItem>
                          {suppliers.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {supplierId === 'add_new' && (
                        <Input
                          className="fv-input mt-2"
                          value={newSupplierName}
                          onChange={(e) => setNewSupplierName(e.target.value)}
                          placeholder="Supplier name"
                        />
                      )}
                    </div>

                    <div className="h-px w-full bg-border/50" />

                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg py-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => setShowAdvanced((v) => !v)}
                    >
                      <span>Optional details</span>
                      {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>

                    {showAdvanced && (
                      <div className="space-y-4 pt-1">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-muted-foreground">SKU</label>
                            <Input className="fv-input" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Optional" />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-muted-foreground">Item code</label>
                            <Input className="fv-input" value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="Optional" />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-muted-foreground">Minimum stock</label>
                            <Input
                              type="number"
                              className="fv-input"
                              value={minStockLevel}
                              onChange={(e) => setMinStockLevel(e.target.value)}
                              placeholder="e.g. 10"
                              min={0}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-muted-foreground">Reorder quantity</label>
                            <Input
                              type="number"
                              className="fv-input"
                              value={reorderQuantity}
                              onChange={(e) => setReorderQuantity(e.target.value)}
                              placeholder="e.g. 50"
                              min={0}
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-muted-foreground">Notes</label>
                          <Textarea
                            className="fv-input resize-none"
                            rows={3}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Extra details"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-6 flex flex-col gap-2 border-t border-border/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="order-2 flex w-full flex-wrap gap-2 sm:order-1 sm:w-auto">
              <button
                type="button"
                onClick={() => handleDialogOpenChange(false)}
                disabled={saving}
                className="fv-btn fv-btn--ghost w-full justify-center sm:w-auto"
              >
                Cancel
              </button>
              {step > 1 ? (
                <button
                  type="button"
                  onClick={goBack}
                  disabled={saving}
                  className="fv-btn fv-btn--ghost w-full justify-center sm:w-auto"
                >
                  ← Back
                </button>
              ) : null}
            </div>

            <div className="order-1 flex w-full flex-col gap-2 sm:order-2 sm:ml-auto sm:w-auto sm:flex-row sm:justify-end">
              {step < 3 ? (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={step === 1 ? !canGoToStep2 : !canGoToStep3}
                  className={cn(
                    'inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all',
                    'gradient-primary text-primary-foreground btn-luxury',
                    'disabled:pointer-events-none disabled:opacity-50',
                  )}
                >
                  Next →
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={saveDisabled}
                  className={cn(
                    'inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all',
                    'gradient-primary text-primary-foreground btn-luxury',
                    'disabled:pointer-events-none disabled:opacity-50',
                  )}
                >
                  {saving ? 'Saving…' : 'Save item'}
                </button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Alias matching product naming in specs. */
export { AddInventoryItemModal as AddItemModal };
