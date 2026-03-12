import React, { useMemo, useState } from 'react';
import { 
  ChevronDown, 
  ChevronUp, 
  Package, 
  Wheat, 
  Boxes, 
  Wine, 
  PackageOpen,
  Box,
  Coins,
  Calculator
} from 'lucide-react';
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
  logInventoryAuditEvent,
} from '@/services/inventoryReadModelService';
import { createSupplier } from '@/services/suppliersService';
import { toast } from 'sonner';
import { useAuth } from '@clerk/react';
import { useAuth as useAppAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';

type PackagingType = 'single' | 'sack' | 'box' | 'bottle' | 'pack' | 'other';
type UnitType = 'kg' | 'g' | 'litres' | 'ml' | 'pieces' | 'metres';

const packagingConfig: Record<PackagingType, { 
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
}> = {
  single: { 
    icon: Box, 
    label: 'Single Item', 
    singularLabel: 'item',
    pluralLabel: 'items',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    stockLabel: 'Number of items',
    unitsPerLabel: 'Amount per item',
    priceLabel: 'Price per item',
    showUnitsPerField: false,
    exampleCalc: '10 items = 10 pieces'
  },
  sack: { 
    icon: Wheat, 
    label: 'Sack / Bag', 
    singularLabel: 'sack',
    pluralLabel: 'sacks',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    stockLabel: 'Number of sacks',
    unitsPerLabel: 'Content per sack',
    priceLabel: 'Price per sack',
    showUnitsPerField: false,
    exampleCalc: '5 sacks × 50kg = 250kg'
  },
  box: { 
    icon: Boxes, 
    label: 'Box / Carton', 
    singularLabel: 'box',
    pluralLabel: 'boxes',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    stockLabel: 'Number of boxes',
    unitsPerLabel: 'Units per box',
    priceLabel: 'Price per box',
    showUnitsPerField: true,
    exampleCalc: '5 boxes × 24 pieces = 120 pieces'
  },
  bottle: { 
    icon: Wine, 
    label: 'Bottle / Container', 
    singularLabel: 'bottle',
    pluralLabel: 'bottles',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    stockLabel: 'Number of bottles',
    unitsPerLabel: 'Content per bottle',
    priceLabel: 'Price per bottle',
    showUnitsPerField: false,
    exampleCalc: '6 bottles × 2L = 12L'
  },
  pack: { 
    icon: PackageOpen, 
    label: 'Pack / Bundle', 
    singularLabel: 'pack',
    pluralLabel: 'packs',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    stockLabel: 'Number of packs',
    unitsPerLabel: 'Units per pack',
    priceLabel: 'Price per pack',
    showUnitsPerField: true,
    exampleCalc: '4 packs × 10 pieces = 40 pieces'
  },
  other: { 
    icon: Package, 
    label: 'Other', 
    singularLabel: 'unit',
    pluralLabel: 'units',
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    stockLabel: 'Number of units',
    unitsPerLabel: 'Amount per unit',
    priceLabel: 'Price per unit',
    showUnitsPerField: true,
    exampleCalc: '3 units × 1 = 3 total'
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

  const predefinedCategories = useMemo(
    () => [
      { value: 'template:fertilizer', label: 'Fertilizer', defaultUnit: 'kg' as UnitType },
      { value: 'template:chemical', label: 'Chemical', defaultUnit: 'ml' as UnitType },
      { value: 'template:fuel', label: 'Fuel', defaultUnit: 'litres' as UnitType },
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
    const predefined = predefinedCategories.find(c => c.value === catId);
    if (predefined?.defaultUnit) return predefined.defaultUnit;
    
    const name = catName?.toLowerCase() || '';
    if (name.includes('fertilizer') || name.includes('fertiliser')) return 'kg';
    if (name.includes('chemical') || name.includes('pesticide') || name.includes('herbicide') || name.includes('fungicide')) return 'ml';
    if (name.includes('fuel') || name.includes('diesel') || name.includes('petrol')) return 'litres';
    if (name.includes('seed')) return 'g';
    
    return null;
  };

  const handleCategoryChange = (newCategoryId: string) => {
    setCategoryId(newCategoryId);
    
    const matchedCategory = categories.find(c => c.id === newCategoryId);
    const defaultUnit = getCategoryDefaultUnit(newCategoryId, matchedCategory?.name ?? undefined);
    
    if (defaultUnit) {
      setUnit(defaultUnit);
    }
  };

  const currentPackaging = packagingConfig[packagingType];
  const PackagingIcon = currentPackaging.icon;

  const getUnitDisplayName = (u: UnitType): string => {
    switch (u) {
      case 'kg': return 'kgs';
      case 'g': return 'grams';
      case 'litres': return 'litres';
      case 'ml': return 'ml';
      case 'pieces': return 'pieces';
      case 'metres': return 'meters';
      default: return u;
    }
  };

  const getAmountPlaceholder = (): string => {
    const unitName = getUnitDisplayName(unit);
    const packagingName = currentPackaging.singularLabel;
    
    return `How many ${unitName} per ${packagingName}`;
  };

  const getAmountExample = (): string => {
    switch (packagingType) {
      case 'sack': return unit === 'kg' ? '50' : '25';
      case 'bottle': return unit === 'litres' ? '2' : unit === 'ml' ? '500' : '1';
      case 'box': return '24';
      case 'pack': return '10';
      case 'single': return '1';
      default: return '1';
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

  const getSummaryText = (): string => {
    const packs = Number(numberOfPacks);
    if (!Number.isFinite(packs) || packs <= 0) {
      return currentPackaging.exampleCalc;
    }

    const packLabel = getPackLabel(packs);

    if (needsUnitsPerField) {
      const upp = Number(unitsPerPack);
      if (!Number.isFinite(upp) || upp <= 0) {
        return `${packs} ${packLabel} (enter units per ${currentPackaging.singularLabel} for total)`;
      }
      const total = packs * upp;
      return `${packs} ${packLabel} × ${upp} pieces = ${total.toLocaleString()} pieces`;
    } else {
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt <= 0) {
        if (packagingType === 'single') {
          return `${packs} ${packLabel} = ${packs} pieces`;
        }
        return `${packs} ${packLabel} (set amount in Item Setup for total)`;
      }
      const total = packs * amt;
      const unitLabel = getUnitLabel(unit, total);
      return `${packs} ${packLabel} × ${amt}${unit === 'litres' ? 'L' : unit} = ${total.toLocaleString()} ${unitLabel}`;
    }
  };

  const resetForm = () => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        averageCost: avgCost,
        itemCode: (showAdvanced ? (itemCode || sku || undefined) : undefined) ?? undefined,
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
        type: 'success',
      });

      toast.success('Inventory item created.');
      resetForm();
      onOpenChange(false);
      onCreated?.();
    } catch (error: any) {
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
      <DialogContent className="max-w-2xl w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Add Inventory Item</DialogTitle>
          <DialogDescription>
            Add an item in under 30 seconds. Only fill what you know — you can edit later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 1: ITEM SETUP
          ═══════════════════════════════════════════════════════════════════ */}
          <div className={`rounded-xl border-2 border-border/40 ${currentPackaging.bgColor} p-4 sm:p-5 transition-colors duration-300`}>
            <div className="flex gap-4">
              <div className={`hidden sm:flex shrink-0 w-16 h-16 rounded-xl ${currentPackaging.bgColor} border-2 border-current/10 items-center justify-center transition-all duration-300`}>
                <PackagingIcon className={`w-8 h-8 ${currentPackaging.color} transition-all duration-300`} strokeWidth={1.5} />
              </div>
              
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-2">
                  <PackagingIcon className={`sm:hidden w-5 h-5 ${currentPackaging.color}`} strokeWidth={1.5} />
                  <h3 className="text-base font-semibold text-foreground">Item Setup</h3>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Item Name</label>
                  <Input
                    className="fv-input bg-white/80"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. DAP Fertilizer, Dithane, Diesel"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Category</label>
                    <Select value={categoryId} onValueChange={handleCategoryChange}>
                      <SelectTrigger className="fv-input bg-white/80">
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

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Packaging Type</label>
                    <Select
                      value={packagingType}
                      onValueChange={(v) => {
                        setPackagingType(v as PackagingType);
                        setUnitsPerPack('');
                      }}
                    >
                      <SelectTrigger className="fv-input bg-white/80">
                        <SelectValue placeholder="How is it packaged?" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(packagingConfig).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            <span className="flex items-center gap-2">
                              <config.icon className={`w-4 h-4 ${config.color}`} />
                              {config.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {categoryId === 'add_new' && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">New Category Name</label>
                    <Input
                      className="fv-input bg-white/80"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="e.g. Seeds, Equipment, Packaging"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Unit</label>
                    <Select value={unit} onValueChange={(v) => setUnit(v as UnitType)}>
                      <SelectTrigger className="fv-input bg-white/80">
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

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">
                      Amount <span className="text-muted-foreground font-normal">(per {currentPackaging.singularLabel})</span>
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        className="fv-input bg-white/80 pr-14"
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
                    <p className="text-xs text-muted-foreground">
                      {getAmountPlaceholder()}
                    </p>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 2: STOCK DETAILS
          ═══════════════════════════════════════════════════════════════════ */}
          <div className={`rounded-xl border-2 border-border/40 ${currentPackaging.bgColor.replace('50', '50')} bg-gradient-to-br from-${currentPackaging.color.replace('text-', '').replace('-600', '-50')} to-white p-4 sm:p-5 transition-colors duration-300`}
               style={{ background: `linear-gradient(to bottom right, ${currentPackaging.bgColor === 'bg-blue-50' ? '#eff6ff' : currentPackaging.bgColor === 'bg-amber-50' ? '#fffbeb' : currentPackaging.bgColor === 'bg-orange-50' ? '#fff7ed' : currentPackaging.bgColor === 'bg-emerald-50' ? '#ecfdf5' : currentPackaging.bgColor === 'bg-purple-50' ? '#faf5ff' : '#f9fafb'}, white)` }}>
            <div className="flex gap-4">
              <div className={`hidden sm:flex shrink-0 w-16 h-16 rounded-xl border-2 items-center justify-center transition-all duration-300`}
                   style={{ backgroundColor: currentPackaging.bgColor === 'bg-blue-50' ? '#dbeafe' : currentPackaging.bgColor === 'bg-amber-50' ? '#fef3c7' : currentPackaging.bgColor === 'bg-orange-50' ? '#ffedd5' : currentPackaging.bgColor === 'bg-emerald-50' ? '#d1fae5' : currentPackaging.bgColor === 'bg-purple-50' ? '#f3e8ff' : '#f3f4f6', borderColor: 'rgba(0,0,0,0.05)' }}>
                <PackagingIcon className={`w-8 h-8 ${currentPackaging.color} transition-all duration-300`} strokeWidth={1.5} />
              </div>
              
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-2">
                  <PackagingIcon className={`sm:hidden w-5 h-5 ${currentPackaging.color}`} strokeWidth={1.5} />
                  <h3 className="text-base font-semibold text-foreground">Stock Details</h3>
                </div>

                <div className={`grid grid-cols-1 ${needsUnitsPerField ? 'sm:grid-cols-2' : ''} gap-3`}>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">{currentPackaging.stockLabel}</label>
                    <Input
                      type="number"
                      className="fv-input bg-white/80"
                      value={numberOfPacks}
                      onChange={(e) => handleNumberOfPacksChange(e.target.value)}
                      placeholder={`How many ${currentPackaging.pluralLabel}?`}
                      min={0}
                      required
                    />
                  </div>

                  {needsUnitsPerField && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-foreground">
                        {currentPackaging.unitsPerLabel}
                      </label>
                      <div className="relative">
                        <Input
                          type="number"
                          className="fv-input bg-white/80 pr-16"
                          value={unitsPerPack}
                          onChange={(e) => setUnitsPerPack(e.target.value)}
                          placeholder={packagingType === 'box' ? '24' : '10'}
                          min={0}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          pieces
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-lg bg-white/60 border border-current/10 p-3">
                  <p className="text-sm text-muted-foreground flex items-start gap-2">
                    <Calculator className={`w-4 h-4 mt-0.5 ${currentPackaging.color} shrink-0`} />
                    <span>{getSummaryText()}</span>
                  </p>
                  {calculatedTotal !== null && !calculatedTotal.isPackCount && (
                    <p className={`mt-2 text-sm font-medium ${currentPackaging.color} flex items-center gap-2`}>
                      <span className="inline-block w-4" />
                      Total: {calculatedTotal.value.toLocaleString()} {calculatedTotal.unit === 'pieces' ? 'pieces' : getUnitLabel(calculatedTotal.unit as UnitType, calculatedTotal.value)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              SECTION 3: COST & SUPPLIER (OPTIONAL)
          ═══════════════════════════════════════════════════════════════════ */}
          <div className="rounded-xl border-2 border-border/40 bg-gradient-to-br from-amber-50 to-yellow-50 p-4 sm:p-5">
            <div className="flex gap-4">
              <div className="hidden sm:flex shrink-0 w-16 h-16 rounded-xl bg-amber-100 border-2 border-amber-200/50 items-center justify-center">
                <Coins className="w-8 h-8 text-amber-600" strokeWidth={1.5} />
              </div>
              
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-2">
                  <Coins className="sm:hidden w-5 h-5 text-amber-600" strokeWidth={1.5} />
                  <h3 className="text-base font-semibold text-foreground">
                    Cost & Supplier <span className="text-muted-foreground font-normal text-sm">(optional)</span>
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">{currentPackaging.priceLabel}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        KSh
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        className="fv-input bg-white/80 pl-12"
                        value={pricePerPack}
                        onChange={(e) => handlePricePerPackChange(e.target.value)}
                        placeholder="e.g. 2,500"
                        min={0}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">
                      Total Price <span className="text-muted-foreground font-normal">(auto-calculated)</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        KSh
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        className="fv-input bg-white/80 pl-12"
                        value={totalPrice}
                        onChange={(e) => handleTotalPriceChange(e.target.value)}
                        placeholder={`Total for all ${currentPackaging.pluralLabel}`}
                        min={0}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Supplier</label>
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger className="fv-input bg-white/80">
                      <SelectValue placeholder="Select supplier (optional)" />
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
                      className="fv-input bg-white/80 mt-2"
                      value={newSupplierName}
                      onChange={(e) => setNewSupplierName(e.target.value)}
                      placeholder="Supplier name (e.g. Agrovet mjini)"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              ADVANCED OPTIONS (Collapsible)
          ═══════════════════════════════════════════════════════════════════ */}
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? (
              <>
                <ChevronUp className="h-4 w-4" />
                Hide advanced options
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" />
                Show advanced options
              </>
            )}
          </button>

          {showAdvanced && (
            <div className="rounded-xl border border-border/60 bg-muted/10 p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">SKU</label>
                  <Input className="fv-input" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Optional" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Item Code</label>
                  <Input className="fv-input" value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="Optional" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Minimum Stock Level</label>
                  <Input type="number" className="fv-input" value={minStockLevel} onChange={(e) => setMinStockLevel(e.target.value)} placeholder="e.g. 10" min={0} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-muted-foreground">Reorder Quantity</label>
                  <Input type="number" className="fv-input" value={reorderQuantity} onChange={(e) => setReorderQuantity(e.target.value)} placeholder="e.g. 50" min={0} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Notes</label>
                <Textarea className="fv-input resize-none" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any extra details you want to remember" />
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              FOOTER
          ═══════════════════════════════════════════════════════════════════ */}
          <DialogFooter className="pt-2">
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
              disabled={saving || !name.trim() || !categoryId || !unit.trim() || !numberOfPacks}
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
