import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { InventoryItem, InventoryPurchase, InventoryUsage, InventoryCategory } from '@/types';

type RestockInput = {
  companyId: string;
  inventoryItemId: string;
  quantityAdded: number;
  unit: string;
  totalCost: number;
  projectId?: string;
  date: Date;
};

export async function restockInventoryAndCreateExpense(input: RestockInput) {
  const { companyId, inventoryItemId, quantityAdded, unit, totalCost, projectId, date } = input;

  const batch = writeBatch(db);

  const itemRef = doc(db, 'inventoryItems', inventoryItemId);
  batch.update(itemRef, {
    quantity: (quantityAdded || 0) ? undefined : undefined,
    lastUpdated: serverTimestamp(),
  });

  const purchaseRef = doc(collection(db, 'inventoryPurchases'));
  const purchase: Omit<InventoryPurchase, 'id'> = {
    companyId,
    inventoryItemId,
    quantityAdded,
    unit,
    totalCost,
    pricePerUnit: quantityAdded ? totalCost / quantityAdded : undefined,
    projectId,
    date,
    expenseId: undefined,
    createdAt: new Date(),
  };

  batch.set(purchaseRef, {
    ...purchase,
    date,
    createdAt: serverTimestamp(),
  });

  await batch.commit();
}

type RecordUsageInput = {
  companyId: string;
  projectId: string;
  inventoryItemId: string;
  category: InventoryCategory;
  quantity: number;
  unit: string;
  source: 'workLog' | 'manual-adjustment';
  workLogId?: string;
  stageIndex?: number;
  stageName?: string;
  date: Date;
};

export async function recordInventoryUsage(input: RecordUsageInput) {
  const usage: Omit<InventoryUsage, 'id'> = {
    ...input,
    createdAt: new Date(),
  };

  await addDoc(collection(db, 'inventoryUsage'), {
    ...usage,
    date: input.date,
    createdAt: serverTimestamp(),
  });
}

export type DeductForWorkCardInput = {
  companyId: string;
  projectId: string;
  inventoryItemId: string;
  quantity: number;
  stageName?: string;
  workCardId: string;
  date: Date;
  /** Manager who submitted the work (for usage record). */
  managerName?: string;
};

function isSingleUnitLabel(unit: string | undefined): boolean {
  if (!unit) return false;
  const u = unit.toLowerCase();
  return u === 'units' || u === 'pieces' || u === 'unit' || u === 'piece';
}

/** True when work card quantity is in single units (we deduct in units or convert from units to boxes). */
function itemUsesUnitConversion(item: InventoryItem & { packagingType?: string; unitsPerBox?: number }): boolean {
  const upb = item.unitsPerBox ?? 0;
  if (upb > 0) return true;
  if (isSingleUnitLabel(item.unit)) return true;
  // "Boxes" used as count (e.g. Belt): 2 = 2 items, stock stored as count
  if (item.unit && item.unit.toLowerCase() === 'boxes') return true;
  return false;
}

/**
 * Deduct inventory for a work card (after admin approves).
 * - When item has unitsPerBox: work card quantity = single UNITS (items); we convert to stock and deduct.
 *   E.g. 1 box = 12 units, quantity 24 → deduct 2 from stock (boxes). Stock is stored in base unit (boxes).
 * - When item has no unitsPerBox: work card quantity and stock use the same unit (item.unit); deduct as-is.
 */
export async function deductInventoryForWorkCard(input: DeductForWorkCardInput): Promise<void> {
  const { companyId, projectId, inventoryItemId, quantity, stageName, workCardId, date, managerName } = input;
  if (!inventoryItemId || quantity <= 0) return;

  const itemSnap = await getDoc(doc(db, 'inventoryItems', inventoryItemId));
  if (!itemSnap.exists()) throw new Error('Inventory item not found');
  const item = { id: itemSnap.id, ...itemSnap.data() } as InventoryItem;
  if (item.companyId !== companyId) throw new Error('Item does not belong to company');

  const it = item as InventoryItem & { packagingType?: string; unitsPerBox?: number };
  const useUnitConversion = itemUsesUnitConversion(it);
  const unitsPerBox = useUnitConversion ? Math.max(1, Number(it.unitsPerBox)) : 1;

  // When useUnitConversion: quantity = single units used; stock is in base (e.g. boxes). Deduct quantity/unitsPerBox.
  const quantityToDeductFromStock = useUnitConversion ? quantity / unitsPerBox : quantity;
  const currentQty = Number(item.quantity) || 0;
  if (currentQty < quantityToDeductFromStock) {
    const needDisplay = useUnitConversion ? `${quantity} units` : `${quantity} ${item.unit}`;
    const haveDisplay = useUnitConversion
      ? `${Math.floor(currentQty * unitsPerBox)} units`
      : `${currentQty} ${item.unit}`;
    throw new Error(`Insufficient stock: ${item.name} has ${haveDisplay}, need ${needDisplay}`);
  }

  const itemRef = doc(db, 'inventoryItems', inventoryItemId);
  await updateDoc(itemRef, {
    quantity: increment(-quantityToDeductFromStock),
    lastUpdated: serverTimestamp(),
  });

  const quantityForUsage = quantity;
  const unitForUsage = useUnitConversion ? 'units' : item.unit;
  await addDoc(collection(db, 'inventoryUsage'), {
    companyId,
    projectId,
    inventoryItemId,
    category: item.category,
    quantity: quantityForUsage,
    unit: unitForUsage,
    source: 'workCard',
    workCardId,
    managerName: managerName ?? undefined,
    stageName: stageName ?? undefined,
    date,
    createdAt: serverTimestamp(),
  });
}

export type CheckStockForWorkCardResult = {
  sufficient: boolean;
  missing?: { itemName: string; unit: string; need: string; have: string }[];
};

export type DeductForHarvestInput = {
  companyId: string;
  projectId: string;
  inventoryItemId: string;
  quantity: number;
  harvestId: string;
  date: Date;
};

/** Deduct wooden crates from inventory when recording a tomato harvest in crates. */
export async function deductInventoryForHarvest(input: DeductForHarvestInput): Promise<void> {
  const { companyId, projectId, inventoryItemId, quantity, harvestId, date } = input;
  if (!inventoryItemId || quantity <= 0) return;

  const itemSnap = await getDoc(doc(db, 'inventoryItems', inventoryItemId));
  if (!itemSnap.exists()) throw new Error('Inventory item not found');
  const item = { id: itemSnap.id, ...itemSnap.data() } as InventoryItem;
  if (item.companyId !== companyId) throw new Error('Item does not belong to company');

  const currentQty = Number(item.quantity) || 0;
  if (currentQty < quantity) {
    throw new Error(`Insufficient wooden crates: ${item.name} has ${currentQty}, need ${quantity}`);
  }

  const itemRef = doc(db, 'inventoryItems', inventoryItemId);
  await updateDoc(itemRef, {
    quantity: increment(-quantity),
    lastUpdated: serverTimestamp(),
  });

  await addDoc(collection(db, 'inventoryUsage'), {
    companyId,
    projectId,
    inventoryItemId,
    category: item.category,
    quantity,
    unit: item.unit ?? 'units',
    source: 'harvest',
    harvestId,
    date,
    createdAt: serverTimestamp(),
  });
}

/** Check if there is enough stock for a work card (same logic as deduct). Use before approve. */
export async function checkStockForWorkCard(input: DeductForWorkCardInput): Promise<CheckStockForWorkCardResult> {
  const { companyId, inventoryItemId, quantity } = input;
  if (!inventoryItemId || quantity <= 0) return { sufficient: true };

  const itemSnap = await getDoc(doc(db, 'inventoryItems', inventoryItemId));
  if (!itemSnap.exists()) return { sufficient: false, missing: [{ itemName: 'Unknown item', unit: '', need: String(quantity), have: '0' }] };
  const item = { id: itemSnap.id, ...itemSnap.data() } as InventoryItem;
  if (item.companyId !== companyId) return { sufficient: false, missing: [{ itemName: item.name, unit: item.unit ?? '', need: String(quantity), have: '0' }] };

  const it = item as InventoryItem & { packagingType?: string; unitsPerBox?: number };
  const useUnitConversion = itemUsesUnitConversion(it);
  const unitsPerBox = useUnitConversion ? Math.max(1, Number(it.unitsPerBox)) : 1;
  const quantityToDeductFromStock = useUnitConversion ? quantity / unitsPerBox : quantity;
  const currentQty = Number(item.quantity) || 0;

  if (currentQty >= quantityToDeductFromStock) return { sufficient: true };

  const needDisplay = useUnitConversion ? `${quantity} units` : `${quantity} ${item.unit ?? ''}`;
  const haveDisplay = useUnitConversion
    ? `${Math.floor(currentQty * unitsPerBox)} units`
    : `${currentQty} ${item.unit ?? ''}`;
  return {
    sufficient: false,
    missing: [{ itemName: item.name, unit: useUnitConversion ? 'units' : (item.unit ?? ''), need: needDisplay, have: haveDisplay }],
  };
}

