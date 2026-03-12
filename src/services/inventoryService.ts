import { db, requireCompanyId } from '@/lib/db';
import { resolveCompanyIdForWrite } from '@/lib/tenant';
import type {
  InventoryItem,
  InventoryCategory,
  ChemicalPackagingType,
  FuelType,
  CropType,
} from '@/types';

const ITEMS_TABLE = 'inventory_items';
const PURCHASES_TABLE = 'inventory_purchases';
const AUDIT_LOGS_TABLE = 'inventory_audit_logs';

type DbInventoryItemRow = {
  id: string;
  company_id: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  current_quantity: number;
  price_per_unit: number | null;
  packaging_type: ChemicalPackagingType | null;
  units_per_box: number | null;
  fuel_type: FuelType | null;
  containers: number | null;
  litres: number | null;
  bags: number | null;
  kgs: number | null;
  box_size: 'big' | 'medium' | 'small' | null;
  scope: 'project' | 'crop' | 'all' | null;
  project_id: string | null;
  crop_type: CropType | 'all' | null;
  crop_types: CropType[] | null;
  supplier_id: string | null;
  supplier_name: string | null;
  pickup_date: string | null;
  min_threshold: number | null;
  last_updated: string;
  created_at: string;
};

export type InventoryMovementDirection = 'in' | 'out';

export type InventoryMovementSource =
  | 'restock'
  | 'manual'
  | 'correction'
  | 'system';

// NOTE: there is currently no dedicated inventory_movements table in the SQL schema.
// The movement type and helpers remain for potential future use but are not persisted.
type DbInventoryMovementRow = never;

export type InventoryAuditAction =
  | 'ADD_ITEM'
  | 'EDIT_ITEM'
  | 'RESTOCK'
  | 'DEDUCT'
  | 'DELETE'
  | 'TRANSFER'
  | 'ADD_NEEDED'
  | 'STATUS_CHANGE';

type DbInventoryAuditLogRow = {
  id: string;
  company_id: string;
  action: string;
  inventory_item_id: string | null;
  quantity: number | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
};

export type InventoryMovement = never;

export type InventoryAuditLog = {
  id: string;
  companyId: string;
  action: InventoryAuditAction;
  inventoryItemId?: string;
  quantity?: number;
  metadata?: Record<string, unknown>;
  createdByUserId?: string;
  createdByName?: string;
  createdAt: string;
};

type ActorInfo = {
  actorUserId: string;
  actorName?: string | null;
};

export type AddInventoryItemInput = {
  companyId: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  quantity?: number;
  pricePerUnit?: number;
  packagingType?: ChemicalPackagingType;
  unitsPerBox?: number;
  fuelType?: FuelType;
  containers?: number;
  litres?: number;
  bags?: number;
  kgs?: number;
  boxSize?: 'big' | 'medium' | 'small';
  scope?: 'project' | 'crop' | 'all';
  projectId?: string | null;
  cropType?: CropType | 'all';
  cropTypes?: CropType[];
  supplierId?: string;
  supplierName?: string;
  pickupDate?: string;
  minThreshold?: number;
};

export type UpdateInventoryItemInput = {
  id: string;
  companyId: string;
  name?: string;
  category?: InventoryCategory;
  unit?: string;
  pricePerUnit?: number | null;
  packagingType?: ChemicalPackagingType | null;
  unitsPerBox?: number | null;
  fuelType?: FuelType | null;
  containers?: number | null;
  litres?: number | null;
  bags?: number | null;
  kgs?: number | null;
  boxSize?: 'big' | 'medium' | 'small' | null;
  scope?: 'project' | 'crop' | 'all' | null;
  projectId?: string | null;
  cropType?: CropType | 'all' | null;
  cropTypes?: CropType[] | null;
  supplierId?: string | null;
  supplierName?: string | null;
  pickupDate?: string | null;
  minThreshold?: number | null;
};

export type RestockInventoryInput = {
  companyId: string;
  itemId: string;
  quantity: number;
  unit?: string;
  totalCost: number;
  projectId?: string | null;
  supplierId?: string | null;
  date: string;
} & ActorInfo;

export type DeductInventoryManualInput = {
  companyId: string;
  itemId: string;
  quantity: number;
  reason?: string;
} & ActorInfo;

export type RecordInventoryMovementInput = {
  companyId: string;
  itemId: string;
  delta: number;
  reason?: string;
  source?: InventoryMovementSource;
  metadata?: Record<string, unknown>;
} & ActorInfo;

function mapRowToInventoryItem(row: DbInventoryItemRow): InventoryItem {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    category: row.category,
    quantity: row.current_quantity,
    unit: row.unit,
    pricePerUnit: row.price_per_unit ?? undefined,
    packagingType: row.packaging_type ?? undefined,
    unitsPerBox: row.units_per_box ?? undefined,
    fuelType: row.fuel_type ?? undefined,
    containers: row.containers ?? undefined,
    litres: row.litres ?? undefined,
    bags: row.bags ?? undefined,
    kgs: row.kgs ?? undefined,
    boxSize: row.box_size ?? undefined,
    scope: row.scope ?? undefined,
    cropType: row.crop_type ?? undefined,
    cropTypes: row.crop_types ?? undefined,
    supplierId: row.supplier_id ?? undefined,
    supplierName: row.supplier_name ?? undefined,
    pickupDate: row.pickup_date ?? undefined,
    minThreshold: row.min_threshold ?? undefined,
    lastUpdated: new Date(row.last_updated),
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
  };
}

function mapRowToMovement(row: DbInventoryMovementRow): InventoryMovement {
  return row as never;
}

function mapRowToAuditLog(row: DbInventoryAuditLogRow): InventoryAuditLog {
  return {
    id: row.id,
    companyId: row.company_id,
    action: row.action as InventoryAuditAction,
    inventoryItemId: row.inventory_item_id ?? undefined,
    quantity: row.quantity ?? undefined,
    metadata: row.metadata ?? undefined,
    createdByUserId: row.created_by ?? undefined,
    createdByName: undefined,
    createdAt: row.created_at,
  };
}

async function logAuditEvent(params: {
  companyId: string;
  action: InventoryAuditAction;
  inventoryItemId?: string;
  quantity?: number;
  metadata?: Record<string, unknown>;
  actor: ActorInfo;
  severity?: 'normal' | 'high' | 'critical';
}): Promise<void> {
  const companyId = requireCompanyId(params.companyId);

  const { error } = await db
    .inventory()
    .from(AUDIT_LOGS_TABLE)
    .insert({
      company_id: companyId,
      action: params.action,
      inventory_item_id: params.inventoryItemId ?? null,
      quantity: params.quantity ?? null,
      metadata: params.metadata ?? null,
      created_by: params.actor.actorUserId,
    });

  if (error && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error('[inventory] Failed to log audit event', params.action, error);
  }

  // Create admin alert for important inventory actions
  const isHighRisk = params.action === 'EDIT_ITEM' || params.action === 'DELETE' || params.action === 'DEDUCT';
  const isNotableAction = params.action === 'CREATE' || params.action === 'STOCK_IN' || params.action === 'RESTORE' || params.action === 'USAGE';
  const shouldAlert = isHighRisk || isNotableAction;

  if (shouldAlert) {
    const { createAdminAlert } = await import('@/services/adminAlertService');
    const label = (params.metadata as { name?: string })?.name ?? params.inventoryItemId ?? 'Item';
    const severity = params.severity ?? (isHighRisk ? 'high' : 'normal');

    createAdminAlert({
      companyId,
      severity,
      module: 'inventory',
      action: params.action,
      actorUserId: params.actor.actorUserId,
      actorName: params.actor.actorName ?? undefined,
      targetId: params.inventoryItemId ?? undefined,
      targetLabel: label,
      metadata: params.metadata ?? undefined,
      detailPath: params.inventoryItemId ? `/inventory?highlight=${params.inventoryItemId}` : '/inventory',
    }).catch((err) => {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[inventory] Admin alert create failed', err);
      }
    });
  }
}

async function applyStockChange(params: {
  companyId: string;
  itemId: string;
  delta: number;
  reason?: string;
  source: InventoryMovementSource;
  metadata?: Record<string, unknown>;
  actor: ActorInfo;
}): Promise<{ item: InventoryItem; movement: InventoryMovement | null }> {
  const companyId = requireCompanyId(params.companyId);
  if (!params.itemId) {
    throw new Error('Missing inventory item id');
  }
  if (!Number.isFinite(params.delta) || params.delta === 0) {
    throw new Error('Stock change delta must be non-zero');
  }

  const { data: existing, error: fetchError } = await db
    .inventory()
    .from(ITEMS_TABLE)
    .select('*')
    .eq('company_id', companyId)
    .eq('id', params.itemId)
    .maybeSingle<DbInventoryItemRow>();

  if (fetchError) {
    throw fetchError;
  }
  if (!existing) {
    throw new Error('Inventory item not found');
  }

  const newQuantity = (existing.current_quantity ?? 0) + params.delta;
  if (newQuantity < 0) {
    throw new Error('Insufficient stock for this adjustment');
  }

  const { data: updatedRow, error: updateError } = await db
    .inventory()
    .from(ITEMS_TABLE)
    .update({
      current_quantity: newQuantity,
      last_updated: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', params.itemId)
    .select('*')
    .single<DbInventoryItemRow>();

  if (updateError) {
    throw updateError;
  }

  let movement: InventoryMovement | null = null;

  // Movement rows are not persisted until a dedicated movements table exists.

  const item = mapRowToInventoryItem(updatedRow);
  return { item, movement };
}

export async function addInventoryItem(
  input: AddInventoryItemInput & ActorInfo,
): Promise<InventoryItem> {
  const companyId = await resolveCompanyIdForWrite(input.companyId);

  const payload = {
    company_id: companyId,
    name: input.name.trim(),
    category: input.category,
    unit: input.unit,
    current_quantity: input.quantity ?? 0,
    price_per_unit: input.pricePerUnit ?? null,
    packaging_type: input.packagingType ?? null,
    units_per_box: input.unitsPerBox ?? null,
    fuel_type: input.fuelType ?? null,
    containers: input.containers ?? null,
    litres: input.litres ?? null,
    bags: input.bags ?? null,
    kgs: input.kgs ?? null,
    box_size: input.boxSize ?? null,
    scope: input.scope ?? null,
    project_id: input.projectId ?? null,
    crop_type: input.cropType ?? null,
    crop_types: input.cropTypes ?? null,
    supplier_id: input.supplierId ?? null,
    supplier_name: input.supplierName ?? null,
    pickup_date: input.pickupDate ?? null,
    min_threshold: input.minThreshold ?? null,
  };

  const { data, error } = await db
    .inventory()
    .from(ITEMS_TABLE)
    .insert(payload)
    .select('*')
    .single<DbInventoryItemRow>();

  if (error) {
    throw error;
  }

  await logAuditEvent({
    companyId,
    action: 'ADD_ITEM',
    inventoryItemId: data.id,
    quantity: data.current_quantity ?? 0,
    metadata: { name: data.name, category: data.category },
    actor: { actorUserId: input.actorUserId, actorName: input.actorName },
  });

  return mapRowToInventoryItem(data);
}

export async function updateInventoryItem(
  input: UpdateInventoryItemInput & ActorInfo,
): Promise<InventoryItem> {
  const companyId = await resolveCompanyIdForWrite(input.companyId);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.category !== undefined) patch.category = input.category;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.pricePerUnit !== undefined) patch.price_per_unit = input.pricePerUnit;
  if (input.packagingType !== undefined) patch.packaging_type = input.packagingType;
  if (input.unitsPerBox !== undefined) patch.units_per_box = input.unitsPerBox;
  if (input.fuelType !== undefined) patch.fuel_type = input.fuelType;
  if (input.containers !== undefined) patch.containers = input.containers;
  if (input.litres !== undefined) patch.litres = input.litres;
  if (input.bags !== undefined) patch.bags = input.bags;
  if (input.kgs !== undefined) patch.kgs = input.kgs;
  if (input.boxSize !== undefined) patch.box_size = input.boxSize;
  if (input.scope !== undefined) patch.scope = input.scope;
  if (input.projectId !== undefined) patch.project_id = input.projectId;
  if (input.cropType !== undefined) patch.crop_type = input.cropType;
  if (input.cropTypes !== undefined) patch.crop_types = input.cropTypes;
  if (input.supplierId !== undefined) patch.supplier_id = input.supplierId;
  if (input.supplierName !== undefined) patch.supplier_name = input.supplierName;
  if (input.pickupDate !== undefined) patch.pickup_date = input.pickupDate;
  if (input.minThreshold !== undefined) patch.min_threshold = input.minThreshold;

  if (Object.keys(patch).length === 0) {
    const existing = await getInventoryItemById(input.companyId, input.id);
    if (!existing) {
      throw new Error('Inventory item not found');
    }
    return existing;
  }

  const { data, error } = await db
    .inventory()
    .from(ITEMS_TABLE)
    .update({
      ...patch,
      last_updated: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .eq('id', input.id)
    .select('*')
    .single<DbInventoryItemRow>();

  if (error) {
    throw error;
  }

  await logAuditEvent({
    companyId,
    action: 'EDIT_ITEM',
    inventoryItemId: data.id,
    metadata: { patch },
    actor: { actorUserId: input.actorUserId, actorName: input.actorName },
  });

  return mapRowToInventoryItem(data);
}

export async function deleteInventoryItem(
  params: { companyId: string; itemId: string } & ActorInfo,
): Promise<void> {
  const companyId = await resolveCompanyIdForWrite(params.companyId);

  const { data: existing, error: getError } = await db
    .inventory()
    .from(ITEMS_TABLE)
    .select('*')
    .eq('company_id', companyId)
    .eq('id', params.itemId)
    .maybeSingle<DbInventoryItemRow>();

  if (getError) {
    throw getError;
  }

  const { error } = await db
    .inventory()
    .from(ITEMS_TABLE)
    .delete()
    .eq('company_id', companyId)
    .eq('id', params.itemId);

  if (error) {
    throw error;
  }

  await logAuditEvent({
    companyId,
    action: 'DELETE',
    inventoryItemId: params.itemId,
    quantity: existing?.current_quantity ?? undefined,
    metadata: existing ? { name: existing.name, category: existing.category } : undefined,
    actor: { actorUserId: params.actorUserId, actorName: params.actorName },
  });
}

export async function restockInventory(
  input: RestockInventoryInput,
): Promise<InventoryItem> {
  const companyId = await resolveCompanyIdForWrite(input.companyId);
  if (input.quantity <= 0) {
    throw new Error('Quantity must be greater than zero');
  }
  if (input.totalCost <= 0) {
    throw new Error('Total cost must be greater than zero');
  }

  const dateIso = input.date;

  const { item } = await applyStockChange({
    companyId,
    itemId: input.itemId,
    delta: input.quantity,
    reason: 'Restock',
    source: 'restock',
    metadata: {
      totalCost: input.totalCost,
      projectId: input.projectId ?? null,
      supplierId: input.supplierId ?? null,
      date: dateIso,
    },
    actor: { actorUserId: input.actorUserId, actorName: input.actorName },
  });

  const pricePerUnit =
    input.quantity > 0 ? input.totalCost / input.quantity : null;

  const { error: purchaseError } = await db
    .inventory()
    .from(PURCHASES_TABLE)
    .insert({
      company_id: companyId,
      inventory_item_id: input.itemId,
      quantity_added: input.quantity,
      unit: input.unit ?? item.unit,
      total_cost: input.totalCost,
      price_per_unit: pricePerUnit,
      project_id: input.projectId ?? null,
      supplier_id: input.supplierId ?? null,
      date: dateIso,
    });

  if (purchaseError && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error('[inventory] Failed to record purchase', purchaseError);
  }

  await logAuditEvent({
    companyId,
    action: 'RESTOCK',
    inventoryItemId: input.itemId,
    quantity: input.quantity,
    metadata: {
      totalCost: input.totalCost,
      pricePerUnit,
      projectId: input.projectId ?? null,
      supplierId: input.supplierId ?? null,
      date: dateIso,
    },
    actor: { actorUserId: input.actorUserId, actorName: input.actorName },
  });

  return item;
}

export async function deductInventoryManual(
  input: DeductInventoryManualInput,
): Promise<InventoryItem> {
  const companyId = await resolveCompanyIdForWrite(input.companyId);
  if (input.quantity <= 0) {
    throw new Error('Quantity must be greater than zero');
  }

  const { item } = await applyStockChange({
    companyId,
    itemId: input.itemId,
    delta: -Math.abs(input.quantity),
    reason: input.reason ?? 'Manual deduction',
    source: 'manual',
    metadata: undefined,
    actor: { actorUserId: input.actorUserId, actorName: input.actorName },
  });

  await logAuditEvent({
    companyId,
    action: 'DEDUCT',
    inventoryItemId: input.itemId,
    quantity: input.quantity,
    metadata: { reason: input.reason ?? 'Manual deduction' },
    actor: { actorUserId: input.actorUserId, actorName: input.actorName },
  });

  return item;
}

export async function recordInventoryMovement(
  input: RecordInventoryMovementInput,
): Promise<{ item: InventoryItem; movement: InventoryMovement | null }> {
  const companyId = await resolveCompanyIdForWrite(input.companyId);

  const { item, movement } = await applyStockChange({
    companyId,
    itemId: input.itemId,
    delta: input.delta,
    reason: input.reason,
    source: input.source ?? (input.delta > 0 ? 'restock' : 'manual'),
    metadata: input.metadata,
    actor: { actorUserId: input.actorUserId, actorName: input.actorName },
  });

  await logAuditEvent({
    companyId,
    action: input.delta > 0 ? 'RESTOCK' : 'DEDUCT',
    inventoryItemId: input.itemId,
    quantity: Math.abs(input.delta),
    metadata: {
      reason: input.reason,
      source: input.source,
      ...input.metadata,
    },
    actor: { actorUserId: input.actorUserId, actorName: input.actorName },
  });

  return { item, movement };
}

export async function getInventoryItems(
  companyId: string,
): Promise<InventoryItem[]> {
  const tenant = requireCompanyId(companyId);

  const { data, error } = await db
    .inventory()
    .from(ITEMS_TABLE)
    .select('*')
    .eq('company_id', tenant)
    .order('created_at', { ascending: false })
    .returns<DbInventoryItemRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapRowToInventoryItem);
}

export async function getInventoryItemById(
  companyId: string,
  itemId: string,
): Promise<InventoryItem | null> {
  const tenant = requireCompanyId(companyId);

  const { data, error } = await db
    .inventory()
    .from(ITEMS_TABLE)
    .select('*')
    .eq('company_id', tenant)
    .eq('id', itemId)
    .maybeSingle<DbInventoryItemRow>();

  if (error) {
    throw error;
  }

  return data ? mapRowToInventoryItem(data) : null;
}

export async function getInventoryMovementsForItem(params: {
  companyId: string;
  itemId: string;
  limit?: number;
}): Promise<InventoryMovement[]> {
  requireCompanyId(params.companyId);
  // No movements table in schema; return empty list until implemented.
  return [];
}

export async function getInventoryAuditLogs(params: {
  companyId: string;
  itemId?: string;
  limit?: number;
}): Promise<InventoryAuditLog[]> {
  const tenant = requireCompanyId(params.companyId);

  let query = db
    .inventory()
    .from(AUDIT_LOGS_TABLE)
    .select('*')
    .eq('company_id', tenant)
    .order('created_at', { ascending: false });

  if (params.itemId) {
    query = query.eq('inventory_item_id', params.itemId);
  }

  if (params.limit && params.limit > 0) {
    query = query.limit(params.limit);
  }

  const { data, error } = await query.returns<DbInventoryAuditLogRow[]>();

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapRowToAuditLog);
}

// --- Legacy Firestore helpers used by Operations (Phase 1) ---

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
  await addDoc(collection(firestoreDb, 'inventoryUsage'), {
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

  const snap = await getDoc(doc(firestoreDb, 'inventoryItems', inventoryItemId));
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
 * Legacy Firestore helper: deduct wooden crates from inventory when recording a harvest.
 * Phase 1 harvest flows still call this directly.
 */
export async function deductInventoryForHarvest(
  input: DeductInventoryForHarvestInput,
): Promise<void> {
  const { companyId, inventoryItemId, quantity } = input;
  if (!inventoryItemId || quantity <= 0) return;

  const snap = await getDoc(doc(firestoreDb, 'inventoryItems', inventoryItemId));
  if (!snap.exists()) throw new Error('Inventory item not found');
  const item = snap.data() as InventoryItem;
  if (item.companyId !== companyId) throw new Error('Item does not belong to company');

  const currentQty = Number(item.quantity) || 0;
  if (currentQty < quantity) {
    throw new Error(`Insufficient wooden crates: ${item.name} has ${currentQty}, need ${quantity}`);
  }

  await addDoc(collection(firestoreDb, 'inventoryUsage'), {
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



