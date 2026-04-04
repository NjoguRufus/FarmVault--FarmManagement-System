import { collection, addDoc, getDoc, doc, serverTimestamp, db } from '@/lib/documentLayer';
import type { InventoryItem, InventoryCategory } from '@/types';

export type RecordInventoryUsageInput = {
  companyId: string;
  projectId: string;
  inventoryItemId: string;
  category: InventoryCategory;
  quantity: number;
  unit: string;
  source: 'workLog' | 'manual-adjustment' | 'workCard' | 'harvest';
  workLogId?: string;
  workCardId?: string;
  harvestId?: string;
  stageIndex?: number;
  stageName?: string;
  date: Date;
};

export async function recordInventoryUsage(input: RecordInventoryUsageInput) {
  await addDoc(collection(db, 'inventoryUsage'), {
    ...input,
    createdAt: serverTimestamp(),
  });
}

export type CheckStockForWorkCardInput = {
  companyId: string;
  inventoryItemId: string;
  quantity: number;
};

export type CheckStockForWorkCardResult = {
  sufficient: boolean;
  missing?: { itemName: string; unit: string; need: string; have: string }[];
};

export async function checkStockForWorkCard(
  input: CheckStockForWorkCardInput,
): Promise<CheckStockForWorkCardResult> {
  const { companyId, inventoryItemId, quantity } = input;
  if (!inventoryItemId || quantity <= 0) return { sufficient: true };

  const snap = await getDoc(doc(db, 'inventoryItems', inventoryItemId));
  if (!snap.exists()) {
    return {
      sufficient: false,
      missing: [{ itemName: 'Unknown item', unit: '', need: String(quantity), have: '0' }],
    };
  }

  const data = snap.data() as InventoryItem;
  if (data.companyId !== companyId) {
    return {
      sufficient: false,
      missing: [
        {
          itemName: data.name,
          unit: data.unit ?? '',
          need: String(quantity),
          have: '0',
        },
      ],
    };
  }

  const currentQty = Number(data.quantity) || 0;
  if (currentQty >= quantity) {
    return { sufficient: true };
  }

  return {
    sufficient: false,
    missing: [
      {
        itemName: data.name,
        unit: data.unit ?? '',
        need: String(quantity),
        have: String(currentQty),
      },
    ],
  };
}

export type DeductInventoryForHarvestInput = {
  companyId: string;
  projectId: string;
  inventoryItemId: string;
  quantity: number;
  harvestId: string;
  date: Date;
};

/**
 * Legacy shim: deduct crates from inventory when recording a harvest.
 * Prefer Supabase inventory APIs when available.
 */
export async function deductInventoryForHarvest(
  input: DeductInventoryForHarvestInput,
): Promise<void> {
  const { companyId, inventoryItemId, quantity } = input;
  if (!inventoryItemId || quantity <= 0) return;

  const snap = await getDoc(doc(db, 'inventoryItems', inventoryItemId));
  if (!snap.exists()) throw new Error('Inventory item not found');
  const item = snap.data() as InventoryItem;
  if (item.companyId !== companyId) throw new Error('Item does not belong to company');

  const currentQty = Number(item.quantity) || 0;
  if (currentQty < quantity) {
    throw new Error(`Insufficient wooden crates: ${item.name} has ${currentQty}, need ${quantity}`);
  }

  await addDoc(collection(db, 'inventoryUsage'), {
    companyId,
    projectId: input.projectId,
    inventoryItemId,
    category: item.category,
    quantity,
    unit: item.unit ?? 'units',
    source: 'harvest',
    harvestId: input.harvestId,
    date: input.date,
    createdAt: serverTimestamp(),
  });
}
