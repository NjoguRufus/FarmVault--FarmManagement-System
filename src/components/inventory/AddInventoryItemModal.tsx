import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Package,
  Wheat,
  Boxes,
  Wine,
  PackageOpen,
  Box,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  logInventoryAuditEvent,
} from '@/services/inventoryReadModelService';
import { createSupplier } from '@/services/suppliersService';
import { toast } from 'sonner';
import { useAuth } from '@clerk/react';
import { useAuth as useAppAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { cn } from '@/lib/utils';

type PackagingType = 'single' | 'sack' | 'box' | 'bottle' | 'pack' | 'other';
type UnitType = 'kg' | 'g' | 'litres' | 'ml' | 'pieces' | 'metres';
type WizardStep = 1 | 2 | 3;

const DRAFT_STORAGE_PREFIX = 'fv-add-inv-draft:v1:';

type AddInventoryDraft = {
  step: WizardStep;
  slideDir: 1 | -1;
  name: string;
  categoryId: string;
  newCategoryName: string;
  packagingType: PackagingType;
  unit: UnitType;
  amount: string;
  numberOfPacks: string;
  unitsPerPack: string;
  pricePerPack: string;
  totalPrice: string;
  supplierId: 'none' | 'add_new' | string;
  newSupplierName: string;
  showAdvanced: boolean;
  sku: string;
  itemCode: string;
  minStockLevel: string;
  reorderQuantity: string;
  notes: string;
};

const packagingConfig: Record<
  PackagingType,
  {
    icon: React.ElementType;
    label: string;
    singularLabel: string;
    pluralLabel: string;
    color: string;
    bgColor: string;
    stockLabel: string;
    unitsPerLabel: string;
    priceLabel: string;
    showUnitsPerField: boolean;
    exampleCalc: string;
  }
> = {
  single: {
    icon: Box,
    label: 'Single Item',
    singularLabel: 'item',
    pluralLabel: 'items',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    stockLabel: 'Number of items',
    unitsPerLabel: 'Amount per item',
    priceLabel: 'Price per item',
    showUnitsPerField: false,
    exampleCalc: '10 items = 10 pieces',
  },
  sack: {
    icon: Wheat,
    label: 'Sack / Bag',
    singularLabel: 'sack',
    pluralLabel: 'sacks',
    color: 'text-fv-gold',
    bgColor: 'bg-fv-gold-soft/50',
    stockLabel: 'Number of sacks',
    unitsPerLabel: 'Content per sack',
    priceLabel: 'Price per sack',
    showUnitsPerField: false,
    exampleCalc: '5 sacks × 50kg = 250kg',
  },
  box: {
    icon: Boxes,
    label: 'Box / Carton',
    singularLabel: 'box',
    pluralLabel: 'boxes',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    stockLabel: 'Number of boxes',
    unitsPerLabel: 'Units per box',
    priceLabel: 'Price per box',
    showUnitsPerField: true,
    exampleCalc: '5 boxes × 24 pieces = 120 pieces',
  },
  bottle: {
    icon: Wine,
    label: 'Bottle / Container',
    singularLabel: 'bottle',
    pluralLabel: 'bottles',
    color: 'text-fv-success',
    bgColor: 'bg-fv-success/10',
    stockLabel: 'Number of bottles',
    unitsPerLabel: 'Content per bottle',
    priceLabel: 'Price per bottle',
    showUnitsPerField: false,
    exampleCalc: '6 bottles × 2L = 12L',
  },
  pack: {
    icon: PackageOpen,
    label: 'Pack / Bundle',
    singularLabel: 'pack',
    pluralLabel: 'packs',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    stockLabel: 'Number of packs',
    unitsPerLabel: 'Units per pack',
    priceLabel: 'Price per pack',
    showUnitsPerField: true,
    exampleCalc: '4 packs × 10 pieces = 40 pieces',
  },
  other: {
    icon: Package,
    label: 'Other',
    singularLabel: 'unit',
    pluralLabel: 'units',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/40',
    stockLabel: 'Number of units',
    unitsPerLabel: 'Amount per unit',
    priceLabel: 'Price per unit',
    showUnitsPerField: true,
    exampleCalc: '3 units × 1 = 3 total',
  },
};

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
  const { user } = useAppAuth();
  const { addNotification } = useNotifications();
  const reducedMotion = useReducedMotion();

  const [step, setStep] = useState<WizardStep>(1);
  const [slideDir, setSlideDir] = useState<1 | -1>(1);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const unitSelectTriggerRef = useRef<HTMLButtonElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [newCategoryName, setNewCategoryName] = useState('');

  const [packagingType, setPackagingType] = useState<PackagingType>('single');
  const [unit, setUnit] = useState<UnitType>('kg');
  const [amount, setAmount] = useState('');
  const [numberOfPacks, setNumberOfPacks] = useState('');
  const [unitsPerPack, setUnitsPerPack] = useState('');
  const [pricePerPack, setPricePerPack] = useState('');
  const [totalPrice, setTotalPrice] = useState('');

  const [supplierId, setSupplierId] = useState<'none' | 'add_new' | string>('none');
  const [newSupplierName, setNewSupplierName] = useState('');

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sku, setSku] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [minStockLevel, setMinStockLevel] = useState('');
  const [reorderQuantity, setReorderQuantity] = useState('');
  const [notes, setNotes] = useState('');

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
      { value: 'template:fertilizer', label: 'Fertilizer', defaultUnit: 'kg' as UnitType },
      { value: 'template:chemical', label: 'Chemical / Pesticide', defaultUnit: 'ml' as UnitType },
      { value: 'template:fuel', label: 'Fuel', defaultUnit: 'litres' as UnitType },
      { value: 'template:tying-ropes-sacks', label: 'Tying Ropes / Sacks', defaultUnit: 'pieces' as UnitType },
      { value: 'add_new', label: '+ Add new category…', defaultUnit: null },
    ],
    [],
  );

  const predefinedUnits = useMemo(
    () => [
      { value: 'kg', label: 'kg' },
      { value: 'g', label: 'g' },
      { value: 'litres', label: 'litre' },
      { value: 'ml', label: 'ml' },
      { value: 'pieces', label: 'pieces' },
      { value: 'metres', label: 'meters' },
    ],
    [],
  );

  const getCategoryDefaultUnit = (catId: string, catName?: string): UnitType | null => {
    const predefined = predefinedCategories.find((c) => c.value === catId);
    if (predefined?.defaultUnit) return predefined.defaultUnit;

    const n = catName?.toLowerCase() || '';
    if (n.includes('fertilizer') || n.includes('fertiliser')) return 'kg';
    if (n.includes('chemical') || n.includes('pesticide') || n.includes('herbicide') || n.includes('fungicide')) return 'ml';
    if (n.includes('fuel') || n.includes('diesel') || n.includes('petrol')) return 'litres';
    if (n.includes('rope') || n.includes('sack') || n.includes('tying')) return 'pieces';
    if (n.includes('seed')) return 'g';

    return null;
  };

  const handleCategoryChange = (newCategoryId: string) => {
    setCategoryId(newCategoryId);

    const matchedCategory = categories.find((c) => c.id === newCategoryId);
    const defaultUnit = getCategoryDefaultUnit(newCategoryId, matchedCategory?.name ?? undefined);

    if (defaultUnit) {
      setUnit(defaultUnit);
    }
  };

  const currentPackaging = packagingConfig[packagingType];

  const getUnitDisplayName = (u: UnitType): string => {
    switch (u) {
      case 'kg':
        return 'kgs';
      case 'g':
        return 'grams';
      case 'litres':
        return 'litres';
      case 'ml':
        return 'ml';
      case 'pieces':
        return 'pieces';
      case 'metres':
        return 'meters';
      default:
        return u;
    }
  };

  const getAmountPlaceholder = (): string => {
    const unitName = getUnitDisplayName(unit);
    const packagingName = currentPackaging.singularLabel;

    return `How many ${unitName} per ${packagingName}`;
  };

  const getAmountExample = (): string => {
    switch (packagingType) {
      case 'sack':
        return unit === 'kg' ? '50' : '25';
      case 'bottle':
        return unit === 'litres' ? '2' : unit === 'ml' ? '500' : '1';
      case 'box':
        return '24';
      case 'pack':
        return '10';
      case 'single':
        return '1';
      default:
        return '1';
    }
  };

  const getUnitLabel = (u: UnitType, value: number): string => {
    if (u === 'litres') return value === 1 ? 'litre' : 'litres';
    if (u === 'pieces') return value === 1 ? 'piece' : 'pieces';
    if (u === 'metres') return value === 1 ? 'meter' : 'meters';
    return u;
  };

  const getPackLabel = (count: number): string => {
    return count === 1 ? currentPackaging.singularLabel : currentPackaging.pluralLabel;
  };

  const needsUnitsPerField = currentPackaging.showUnitsPerField;

  const calculatedTotal = useMemo(() => {
    const packs = Number(numberOfPacks);
    if (!Number.isFinite(packs) || packs <= 0) return null;

    if (needsUnitsPerField) {
      const upp = Number(unitsPerPack);
      if (!Number.isFinite(upp) || upp <= 0) return { value: packs, unit: 'pieces' as const, isPackCount: true };
      return { value: packs * upp, unit: 'pieces' as const, isPackCount: false };
    } else {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        if (packagingType === 'single') {
          return { value: packs, unit: 'pieces' as const, isPackCount: true };
        }
        return { value: packs, unit, isPackCount: true };
      }
      return { value: packs * amt, unit, isPackCount: false };
    }
  }, [numberOfPacks, amount, unit, unitsPerPack, needsUnitsPerField, packagingType]);

  const handlePricePerPackChange = (value: string) => {
    setPricePerPack(value);
    const packs = Number(numberOfPacks);
    const ppk = Number(value);
    if (Number.isFinite(ppk) && ppk > 0 && Number.isFinite(packs) && packs > 0) {
      setTotalPrice(String(packs * ppk));
    } else if (!value) {
      setTotalPrice('');
    }
  };

  const handleTotalPriceChange = (value: string) => {
    setTotalPrice(value);
    const packs = Number(numberOfPacks);
    const tp = Number(value);
    if (Number.isFinite(tp) && tp > 0 && Number.isFinite(packs) && packs > 0) {
      setPricePerPack(String(Math.round((tp / packs) * 100) / 100));
    } else if (!value) {
      setPricePerPack('');
    }
  };

  const handleNumberOfPacksChange = (value: string) => {
    setNumberOfPacks(value);
    const packs = Number(value);
    const ppk = Number(pricePerPack);
    if (Number.isFinite(ppk) && ppk > 0 && Number.isFinite(packs) && packs > 0) {
      setTotalPrice(String(packs * ppk));
    }
  };

  /** Centered live line for Step 2 */
  const liveQuantityLine = (() => {
    const packs = Number(numberOfPacks);
    if (!Number.isFinite(packs) || packs <= 0) return null;
    if (!calculatedTotal) return null;

    const packLabel = getPackLabel(packs);

    if (calculatedTotal.isPackCount) {
      if (needsUnitsPerField) {
        return `${packs} ${packLabel} — enter ${currentPackaging.unitsPerLabel.toLowerCase()}`;
      }
      if (packagingType === 'single') {
        return `${packs} ${packLabel} = ${packs} pieces`;
      }
      return `${packs} ${packLabel} — set amount per ${currentPackaging.singularLabel}`;
    }

    const total = calculatedTotal.value;
    const unitStr =
      calculatedTotal.unit === 'pieces'
        ? total === 1
          ? 'piece'
          : 'pieces'
        : getUnitLabel(calculatedTotal.unit as UnitType, total);

    return `${packs} ${packLabel} = ${total.toLocaleString()} ${unitStr}`;
  })();

  const canGoToStep2 = Boolean(
    name.trim() && categoryId && (categoryId !== 'add_new' || newCategoryName.trim()),
  );

  const packsNumForGate = Number(numberOfPacks);
  const canGoToStep3 = Boolean(
    Number.isFinite(packsNumForGate) &&
      packsNumForGate > 0 &&
      (!needsUnitsPerField || (Number(unitsPerPack) > 0 && Number.isFinite(Number(unitsPerPack)))),
  );

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

  const applyDraft = useCallback((d: AddInventoryDraft) => {
    setStep(d.step ?? 1);
    setSlideDir(d.slideDir === -1 ? -1 : 1);
    setName(d.name ?? '');
    setCategoryId(d.categoryId ?? '');
    setNewCategoryName(d.newCategoryName ?? '');
    setPackagingType((d.packagingType as PackagingType) ?? 'single');
    setUnit((d.unit as UnitType) ?? 'kg');
    setAmount(d.amount ?? '');
    setNumberOfPacks(d.numberOfPacks ?? '');
    setUnitsPerPack(d.unitsPerPack ?? '');
    setPricePerPack(d.pricePerPack ?? '');
    setTotalPrice(d.totalPrice ?? '');
    setSupplierId((d.supplierId as 'none' | 'add_new' | string) ?? 'none');
    setNewSupplierName(d.newSupplierName ?? '');
    setShowAdvanced(Boolean(d.showAdvanced));
    setSku(d.sku ?? '');
    setItemCode(d.itemCode ?? '');
    setMinStockLevel(d.minStockLevel ?? '');
    setReorderQuantity(d.reorderQuantity ?? '');
    setNotes(d.notes ?? '');
  }, []);

  const resetForm = () => {
    setStep(1);
    setSlideDir(1);
    setName('');
    setCategoryId('');
    setNewCategoryName('');
    setPackagingType('single');
    setUnit('kg');
    setAmount('');
    setNumberOfPacks('');
    setUnitsPerPack('');
    setPricePerPack('');
    setTotalPrice('');
    setSupplierId('none');
    setNewSupplierName('');
    setShowAdvanced(false);
    setSku('');
    setItemCode('');
    setMinStockLevel('');
    setReorderQuantity('');
    setNotes('');
  };

  /** Restore wizard draft before paint so the debounced save effect does not overwrite with empty state. */
  useLayoutEffect(() => {
    if (!open || !companyId) return;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<AddInventoryDraft>;
      if (parsed && typeof parsed === 'object') {
        applyDraft(parsed as AddInventoryDraft);
      }
    } catch {
      /* ignore */
    }
  }, [open, companyId, draftKey, applyDraft]);

  /** Debounced draft save while the modal is open. */
  useEffect(() => {
    if (!open || !companyId) return;
    const id = window.setTimeout(() => {
      const draft: AddInventoryDraft = {
        step,
        slideDir,
        name,
        categoryId,
        newCategoryName,
        packagingType,
        unit,
        amount,
        numberOfPacks,
        unitsPerPack,
        pricePerPack,
        totalPrice,
        supplierId,
        newSupplierName,
        showAdvanced,
        sku,
        itemCode,
        minStockLevel,
        reorderQuantity,
        notes,
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
    packagingType,
    unit,
    amount,
    numberOfPacks,
    unitsPerPack,
    pricePerPack,
    totalPrice,
    supplierId,
    newSupplierName,
    showAdvanced,
    sku,
    itemCode,
    minStockLevel,
    reorderQuantity,
    notes,
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

  const handleSubmit = async () => {
    if (step !== 3) return;
    if (!name.trim() || !categoryId || !unit) return;

    const activeCompanyId = sessionCompanyId || String(companyId ?? '').trim();
    if (!activeCompanyId) {
      toast.error('Cannot create item: companyId is missing. Please re-login or switch company.');
      return;
    }

    const normalizedUnit = unit.trim();
    if (!normalizedUnit) {
      toast.error('Please select a unit for this item.');
      return;
    }

    const packsNum = Number(numberOfPacks);
    if (!Number.isFinite(packsNum) || packsNum <= 0) {
      toast.error(`Please enter how many ${currentPackaging.pluralLabel} you have.`);
      return;
    }

    let qty: number;
    let effectiveUnitsPerPack: number;

    if (needsUnitsPerField) {
      const upp = Number(unitsPerPack);
      effectiveUnitsPerPack = Number.isFinite(upp) && upp > 0 ? upp : 1;
      qty = packsNum * effectiveUnitsPerPack;
    } else {
      const amt = Number(amount);
      effectiveUnitsPerPack = Number.isFinite(amt) && amt > 0 ? amt : 1;
      qty = packsNum * effectiveUnitsPerPack;
    }

    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Quantity must be greater than zero.');
      return;
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

      let avgCost: number | undefined = undefined;
      const pricePerPackNum = pricePerPack ? Number(pricePerPack) : NaN;
      const totalPriceNum = totalPrice ? Number(totalPrice) : NaN;

      let effectiveTotal: number | undefined;

      if (Number.isFinite(pricePerPackNum)) {
        effectiveTotal = packsNum * pricePerPackNum;
      } else if (Number.isFinite(totalPriceNum)) {
        effectiveTotal = totalPriceNum;
      }

      if (effectiveTotal != null && Number.isFinite(effectiveTotal) && qty > 0) {
        avgCost = effectiveTotal / qty;
      }

      const finalInsertPayload = {
        companyId: activeCompanyId,
        name,
        categoryId: resolvedCategoryUuid,
        supplierId: resolvedSupplierId,
        unit: normalizedUnit,
        minStockLevel: showAdvanced && minStockLevel ? Number(minStockLevel) : undefined,
        reorderQuantity: showAdvanced && reorderQuantity ? Number(reorderQuantity) : undefined,
        // DB constraint: inventory_item_master.average_cost is NOT NULL.
        // Step 3 is optional, so default to 0 when the user doesn't provide cost.
        averageCost: avgCost ?? 0,
        itemCode: (showAdvanced ? itemCode || sku || undefined : undefined) ?? undefined,
        description: showAdvanced ? notes || undefined : undefined,
        unitSize: effectiveUnitsPerPack,
        unitSizeLabel: normalizedUnit,
        packagingType,
        defaultProjectId: undefined,
        defaultCropStageId: undefined,
      } as const;

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

      await logInventoryAuditEvent({
        companyId: activeCompanyId,
        action: 'ITEM_CREATED',
        inventoryItemId: created.id,
        itemName: name,
        quantity: qty,
        unit: normalizedUnit,
        actorUserId: user?.id ?? createdBy,
        actorName: user?.name ?? user?.email,
        notes: showAdvanced ? notes || undefined : undefined,
        metadata: {
          category: resolvedCategoryUuid,
          packagingType,
          unit: normalizedUnit,
        },
      });

      addNotification({
        title: 'Item Created',
        message: `${user?.name ?? 'User'} created new inventory item: ${name}`,
        toastType: 'success',
      });

      toast.success('Inventory item created.');
      handleDialogOpenChange(false);
      onCreated?.();
    } catch (error: any) {
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
      // Prevent accidental save when pressing Enter inside price/supplier fields.
      // Save should happen only through the explicit "Save item" button.
      e.preventDefault();
    }
  };

  const stepTitle = step === 1 ? 'What are you adding?' : step === 2 ? 'How much do you have?' : 'Optional cost info';

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
          'bg-card border border-border/60 shadow-lg',
          'rounded-xl p-5 sm:p-6',
        )}
      >
        <DialogHeader className="space-y-3 pb-4 text-left">
          <DialogTitle className="sr-only">Add Inventory Item</DialogTitle>

          <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-[11px] font-semibold tracking-wide text-muted-foreground sm:text-xs">
            {([1, 2, 3] as const).map((n, i) => (
              <React.Fragment key={n}>
                {i > 0 && <span className="text-border">—</span>}
                <span
                  className={cn(
                    'rounded-md px-2 py-0.5 transition-colors',
                    step === n
                      ? 'bg-fv-gold-soft/60 text-fv-olive'
                      : step > n
                        ? 'text-foreground/80'
                        : 'text-muted-foreground',
                  )}
                >
                  [{n} {n === 1 ? 'Item' : n === 2 ? 'Quantity' : 'Cost'}]
                </span>
              </React.Fragment>
            ))}
          </div>

          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{stepTitle}</h2>
            <p className="text-xs text-muted-foreground">
              Your progress is saved automatically. Complete all steps and tap Save item — you won’t create the item until
              then.
            </p>
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
                className="space-y-4"
              >
                {step === 1 && (
                  <div className="space-y-4">
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

                    <div className="h-px w-full bg-border/50" />

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">Packaging type</label>
                      <Select
                        value={packagingType}
                        onValueChange={(v) => {
                          setPackagingType(v as PackagingType);
                          setUnitsPerPack('');
                        }}
                      >
                        <SelectTrigger className="fv-input h-11">
                          <SelectValue placeholder="How is it packaged?" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(packagingConfig).map(([key, config]) => (
                            <SelectItem key={key} value={key}>
                              <span className="flex items-center gap-2">
                                <config.icon className={`h-4 w-4 ${config.color}`} />
                                {config.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4 text-center">
                    <div className="space-y-1.5 text-left">
                      <label className="text-sm font-medium text-foreground">Unit</label>
                      <Select value={unit} onValueChange={(v) => setUnit(v as UnitType)}>
                        <SelectTrigger ref={unitSelectTriggerRef} className="fv-input h-11">
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

                    <div className="space-y-1.5 text-left">
                      <label className="text-sm font-medium text-foreground">
                        {needsUnitsPerField ? currentPackaging.unitsPerLabel : 'Amount per item'}
                      </label>
                      {needsUnitsPerField ? (
                        <div className="relative">
                          <Input
                            type="number"
                            className="fv-input pr-16"
                            value={unitsPerPack}
                            onChange={(e) => setUnitsPerPack(e.target.value)}
                            placeholder={packagingType === 'box' ? '24' : '10'}
                            min={0}
                            step="any"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            pieces
                          </span>
                        </div>
                      ) : (
                        <div className="relative">
                          <Input
                            type="number"
                            className="fv-input pr-14"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder={getAmountExample()}
                            min={0}
                            step="any"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            {unit}
                          </span>
                        </div>
                      )}
                      {!needsUnitsPerField && (
                        <p className="text-xs text-muted-foreground">{getAmountPlaceholder()}</p>
                      )}
                    </div>

                    <div className="space-y-1.5 text-left">
                      <label className="text-sm font-medium text-foreground">{currentPackaging.stockLabel}</label>
                      <Input
                        type="number"
                        className="fv-input"
                        value={numberOfPacks}
                        onChange={(e) => handleNumberOfPacksChange(e.target.value)}
                        placeholder={`How many ${currentPackaging.pluralLabel}?`}
                        min={0}
                        required
                      />
                    </div>

                    <div className="mx-auto max-w-xs pt-1">
                      <p className="text-sm font-medium text-primary">
                        {liveQuantityLine ?? <span className="font-normal text-muted-foreground">Enter numbers to see total</span>}
                      </p>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5 sm:col-span-1">
                        <label className="text-sm font-medium text-foreground">{currentPackaging.priceLabel}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            KSh
                          </span>
                          <Input
                            ref={priceInputRef}
                            type="number"
                            step="0.01"
                            className="fv-input pl-12"
                            value={pricePerPack}
                            onChange={(e) => handlePricePerPackChange(e.target.value)}
                            placeholder="e.g. 2500"
                            min={0}
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5 sm:col-span-1">
                        <label className="text-sm font-medium text-foreground">
                          Auto total <span className="font-normal text-muted-foreground">(editable)</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            KSh
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            className="fv-input pl-12"
                            value={totalPrice}
                            onChange={(e) => handleTotalPriceChange(e.target.value)}
                            placeholder="Total"
                            min={0}
                          />
                        </div>
                      </div>
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
                  disabled={saving || !name.trim() || !categoryId || !unit.trim() || !numberOfPacks}
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
