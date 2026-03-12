import { db, requireCompanyId } from '@/lib/db';
import { resolveCompanyIdForWrite } from '@/lib/tenant';

/**
 * Inventory read models & RPC integration for the new Supabase schema.
 *
 * Assumptions (align these with your DB schema / views):
 * - Inventory tables & views live in the `public` schema in production.
 * - `inventory_stock_view` exposes:
 *   - id (item id), company_id, name, category, category_name?,
 *     supplier_id, supplier_name, unit, current_stock, min_stock_level,
 *     reorder_quantity, average_cost, total_value, stock_status ('ok' | 'low' | 'out' | string).
 * - `inventory_low_stock_view` exposes a subset of the above for low/out-of-stock items.
 * - `inventory_transaction_history_view` exposes:
 *   - id, company_id, inventory_item_id, occurred_at, quantity, balance_after,
 *     unit_cost, total_cost, transaction_type, source, reference, notes, created_by_name.
 * - `inventory_usage_report_view` exposes:
 *   - id, company_id, inventory_item_id, project_id, project_name?, crop_stage?,
 *     used_on, quantity, unit, purpose, notes.
 * - `inventory_item_master` canonical columns (as per production):
 *   - id, company_id, name, category_id, supplier_id,
 *     min_stock_level, reorder_quantity, average_cost,
 *     item_code, description,
 *     unit_size, unit_size_label,
 *     default_project_id, default_crop_stage_id
 * - RPCs `record_inventory_stock_in` and `record_inventory_usage` are defined in
 *   the `public` schema and accept parameter objects matching the TypeScript
 *   payloads below (field names should be updated if your RPC signature differs).
 */

export type InventoryStockStatus = 'ok' | 'low' | 'out' | string;

export type PackagingType = 'single' | 'sack' | 'box' | 'bottle' | 'pack' | 'other';

export interface InventoryStockRow {
  id: string;
  company_id: string;
  name: string;
  category: string;
  category_name?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  unit: string;
  current_stock: number;
  min_stock_level?: number | null;
  reorder_quantity?: number | null;
  average_cost?: number | null;
  total_value?: number | null;
  stock_status?: InventoryStockStatus | null;
  unit_size?: number | null;
  unit_size_label?: string | null;
  packaging_type?: PackagingType | null;
}

export interface InventoryTransactionRow {
  id: string;
  company_id: string;
  inventory_item_id: string;
  occurred_at: string;
  quantity: number;
  balance_after?: number | null;
  unit_cost?: number | null;
  total_cost?: number | null;
  transaction_type?: string | null;
  source?: string | null;
  reference?: string | null;
  notes?: string | null;
  created_by_name?: string | null;
}

export interface InventoryUsageRow {
  id: string;
  company_id: string;
  inventory_item_id: string;
  project_id?: string | null;
  project_name?: string | null;
  crop_stage?: string | null;
  used_on: string;
  quantity: number;
  unit: string;
  purpose?: string | null;
  notes?: string | null;
}

export interface InventoryCategoryRow {
  id: string;
  company_id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  is_active?: boolean | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
}

export interface InventoryItemMasterRow {
  id: string;
  company_id: string;
  name: string;
  category_id: string;
  supplier_id?: string | null;
  item_code?: string | null;
  description?: string | null;
  min_stock_level?: number | null;
  reorder_quantity?: number | null;
  average_cost?: number | null;
  unit_size?: number | null;
  unit_size_label?: string | null;
  packaging_type?: PackagingType | null;
  default_project_id?: string | null;
  default_crop_stage_id?: string | null;
}

export interface CreateInventoryItemInput {
  companyId: string;
  name: string;
  categoryId: string;
  supplierId?: string;
  unit: string;
  minStockLevel?: number;
  reorderQuantity?: number;
  averageCost?: number;
  itemCode?: string;
  description?: string;
  unitSize?: number;
  unitSizeLabel?: string;
  packagingType?: PackagingType;
  defaultProjectId?: string;
  defaultCropStageId?: string;
}

export interface RecordStockInInput {
  companyId: string;
  itemId: string;
  quantity: number;
  unitCost: number;
  transactionType: string;
  supplierId?: string;
  date: string; // ISO date (YYYY-MM-DD) or full ISO timestamp
  notes?: string;
}

export interface RecordUsageInput {
  companyId: string;
  itemId: string;
  quantity: number;
  projectId?: string;
  cropStage?: string;
  usedOn: string; // ISO date
  purpose?: string;
  notes?: string;
}

// --- Read models ------------------------------------------------------------

export async function listInventoryStock(params: {
  companyId: string;
  search?: string;
  categoryId?: string;
  supplierId?: string;
  stockStatus?: InventoryStockStatus | 'all';
}): Promise<InventoryStockRow[]> {
  const tenant = requireCompanyId(params.companyId);

  // NOTE: inventory_* views currently live in the public schema (see Supabase lints),
  // but hold inventory data. We therefore read them via db.public().
  let query = db
    .public()
    .from('inventory_stock_view')
    .select('*')
    .eq('company_id', tenant);

  if (params.categoryId) {
    query = query.eq('category', params.categoryId);
  }
  if (params.supplierId) {
    query = query.eq('supplier_id', params.supplierId);
  }
  if (params.stockStatus && params.stockStatus !== 'all') {
    query = query.eq('stock_status', params.stockStatus);
  }
  if (params.search && params.search.trim()) {
    const term = params.search.trim();
    // Assumes the view has a tsvector or ILIKE-searchable name/sku/item_code fields.
    query = query.or(
      [
        `name.ilike.%${term}%`,
        `item_code.ilike.%${term}%`,
        `sku.ilike.%${term}%`,
        `supplier_name.ilike.%${term}%`,
      ].join(','),
    );
  }

  const { data, error } = await query.returns<InventoryStockRow[]>();
  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[inventory] listInventoryStock error:', {
        message: error.message,
        code: (error as any).code,
        details: (error as any).details,
      });
    }
    throw error;
  }
  
  // DEBUG: Log raw response from Supabase
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[inventory] listInventoryStock raw response:', {
      rowCount: data?.length ?? 0,
      sample: data?.slice(0, 2).map(row => ({
        id: row.id,
        name: row.name,
        current_stock: row.current_stock,
        stock_status: row.stock_status,
        unit: row.unit,
      })),
    });
  }
  
  return data ?? [];
}

export async function getInventoryItemStock(params: {
  companyId: string;
  itemId: string;
}): Promise<InventoryStockRow | null> {
  const tenant = requireCompanyId(params.companyId);
  const { data, error } = await db
    .public()
    .from('inventory_stock_view')
    .select('*')
    .eq('company_id', tenant)
    .eq('id', params.itemId)
    .maybeSingle<InventoryStockRow>();

  if (error) {
    throw error;
  }
  return data ?? null;
}

export async function listLowStockItems(companyId: string): Promise<InventoryStockRow[]> {
  const tenant = requireCompanyId(companyId);
  const { data, error } = await db
    .public()
    .from('inventory_low_stock_view')
    .select('*')
    .eq('company_id', tenant)
    .returns<InventoryStockRow[]>();

  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function listInventoryTransactions(params: {
  companyId: string;
  itemId: string;
  limit?: number;
}): Promise<InventoryTransactionRow[]> {
  const tenant = requireCompanyId(params.companyId);
  const { data, error } = await db
    .public()
    .from('inventory_transaction_history_view')
    .select('*')
    .eq('company_id', tenant)
    .eq('inventory_item_id', params.itemId)
    .order('occurred_at', { ascending: false })
    .limit(params.limit ?? 100)
    .returns<InventoryTransactionRow[]>();

  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function listInventoryUsage(params: {
  companyId: string;
  itemId: string;
  limit?: number;
}): Promise<InventoryUsageRow[]> {
  const tenant = requireCompanyId(params.companyId);
  const { data, error } = await db
    .public()
    .from('inventory_usage_report_view')
    .select('*')
    .eq('company_id', tenant)
    .eq('inventory_item_id', params.itemId)
    .order('used_on', { ascending: false })
    .limit(params.limit ?? 100)
    .returns<InventoryUsageRow[]>();

  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function listInventoryCategories(companyId: string): Promise<InventoryCategoryRow[]> {
  const tenant = requireCompanyId(companyId);
  const { data, error } = await db
    .public()
    .from('inventory_categories')
    .select('*')
    .eq('company_id', tenant)
    .order('name', { ascending: true })
    .returns<InventoryCategoryRow[]>();

  if (error) {
    throw error;
  }
  return data ?? [];
}

export async function createInventoryCategory(input: {
  companyId: string;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  isActive?: boolean;
}): Promise<InventoryCategoryRow> {
  const tenant = await resolveCompanyIdForWrite(input.companyId);
  const payload = {
    company_id: tenant,
    name: input.name.trim(),
    description: input.description ?? null,
    color: input.color ?? null,
    icon: input.icon ?? null,
    is_active: input.isActive ?? true,
  };

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[inventory] createInventoryCategory payload', payload);
    // eslint-disable-next-line no-console
    console.log('[inventory] createInventoryCategory activeCompanyId', { companyId: tenant });
  }

  const { data, error } = await db
    .public()
    .from('inventory_categories')
    .insert(payload)
    .select('*')
    .single<InventoryCategoryRow>();

  if (error) {
    const code = (error as any).code as string | undefined;
    if (code === '23505') {
      // Unique constraint: inventory_categories_company_id_name_key
      const normalizedName = input.name.trim();
      const { data: existing } = await db
        .public()
        .from('inventory_categories')
        .select('*')
        .eq('company_id', tenant)
        .ilike('name', normalizedName)
        .maybeSingle<InventoryCategoryRow>();
      if (existing) {
        return existing;
      }
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[inventory] createInventoryCategory error', {
        message: error.message,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
      });
    }
    throw error;
  }
  return data;
}

export async function createInventoryItem(input: CreateInventoryItemInput): Promise<InventoryItemMasterRow> {
  const tenant = await resolveCompanyIdForWrite(input.companyId);

  const unit = input.unit?.trim();

  const payload: Record<string, unknown> = {
    company_id: tenant,
    name: input.name.trim(),
    category_id: input.categoryId,
    supplier_id: input.supplierId ?? null,
    unit,
    min_stock_level: input.minStockLevel ?? 0,
    reorder_quantity: input.reorderQuantity ?? null,
    average_cost: input.averageCost ?? null,
    item_code: input.itemCode?.trim() || null,
    description: input.description?.trim() || null,
    unit_size: input.unitSize ?? null,
    unit_size_label: input.unitSizeLabel?.trim() || null,
    packaging_type: input.packagingType ?? null,
    default_project_id: input.defaultProjectId ?? null,
    default_crop_stage_id: input.defaultCropStageId ?? null,
  };

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[inventory] createInventoryItem (public.inventory_item_master) payload', payload);
  }

  const { data, error } = await db
    .public()
    .from('inventory_item_master')
    .insert(payload)
    .select('*')
    .single<InventoryItemMasterRow>();

  if (error) {
    const code = (error as any).code as string | undefined;
    const message = (error as any).message as string | undefined;
    if (code === '23502' && message && message.includes('"unit"')) {
      throw new Error('Inventory item is missing a required unit. Please select a unit and try again.');
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[inventory] createInventoryItem error', {
        message: error.message,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
      });
    }
    throw error;
  }
  return data;
}

// --- RPC wrappers -----------------------------------------------------------

export async function recordInventoryStockIn(input: RecordStockInInput): Promise<void> {
  const tenant = await resolveCompanyIdForWrite(input.companyId);

  const rpcPayload = {
    company_id: tenant,
    inventory_item_id: input.itemId,
    quantity: input.quantity,
    unit_cost: input.unitCost,
    transaction_type: input.transactionType,
    supplier_id: input.supplierId ?? null,
    occurred_on: input.date,
    notes: input.notes ?? null,
  };

  // eslint-disable-next-line no-console
  console.log('[inventory] record_inventory_stock_in CALLING RPC', {
    payload: rpcPayload,
    inputCompanyId: input.companyId,
    resolvedTenant: tenant,
    itemId: input.itemId,
    quantity: input.quantity,
  });

  const { data: rpcResult, error } = await db.public().rpc('record_inventory_stock_in', rpcPayload);

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[inventory] record_inventory_stock_in FAILED', {
      message: error.message,
      code: (error as any).code,
      details: (error as any).details,
      hint: (error as any).hint,
      payload: rpcPayload,
    });
    throw error;
  }
  
  // eslint-disable-next-line no-console
  console.log('[inventory] record_inventory_stock_in SUCCESS', {
    transactionId: rpcResult,
    payload: rpcPayload,
  });
}

export async function recordInventoryUsage(input: RecordUsageInput): Promise<void> {
  const tenant = await resolveCompanyIdForWrite(input.companyId);

  const rpcPayload = {
    company_id: tenant,
    inventory_item_id: input.itemId,
    quantity: input.quantity,
    project_id: input.projectId ?? null,
    crop_stage: input.cropStage ?? null,
    used_on: input.usedOn,
    purpose: input.purpose ?? null,
    notes: input.notes ?? null,
  };

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[inventory] record_inventory_usage payload', rpcPayload);
  }

  const { error } = await db.public().rpc('record_inventory_usage', rpcPayload);

  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[inventory] record_inventory_usage error', {
        message: error.message,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
      });
    }
    throw error;
  }
}

// --- Deduct Stock (Manual Deduction) ------------------------------------------

export interface DeductStockInput {
  companyId: string;
  itemId: string;
  quantity: number;
  reason?: string;
  actorUserId?: string;
  actorName?: string;
}

export async function deductInventoryStock(input: DeductStockInput): Promise<void> {
  const tenant = await resolveCompanyIdForWrite(input.companyId);

  if (input.quantity <= 0) {
    throw new Error('Quantity must be greater than zero');
  }

  const rpcPayload = {
    company_id: tenant,
    inventory_item_id: input.itemId,
    quantity: input.quantity,
    project_id: null,
    crop_stage: null,
    used_on: new Date().toISOString().split('T')[0],
    purpose: 'manual_deduction',
    notes: input.reason ?? 'Manual stock deduction',
  };

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[inventory] deduct_inventory_stock (via usage) payload', rpcPayload);
  }

  const { error } = await db.public().rpc('record_inventory_usage', rpcPayload);

  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[inventory] deduct_inventory_stock error', {
        message: error.message,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
      });
    }
    throw error;
  }
}

// --- Archive (Soft Delete) ----------------------------------------------------

export interface ArchiveInventoryItemInput {
  companyId: string;
  itemId: string;
  actorUserId?: string;
  actorName?: string;
}

export async function archiveInventoryItem(input: ArchiveInventoryItemInput): Promise<void> {
  const tenant = await resolveCompanyIdForWrite(input.companyId);

  // Note: archived_by stores actor name (TEXT) since Clerk user IDs are not UUIDs.
  // The full audit trail with user ID is captured in inventory_audit_logs.
  const payload = {
    is_archived: true,
    archived_at: new Date().toISOString(),
    archived_by: input.actorName ?? null,
    updated_at: new Date().toISOString(),
  };

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[inventory] archiveInventoryItem payload', { itemId: input.itemId, ...payload });
  }

  const { error } = await db
    .public()
    .from('inventory_item_master')
    .update(payload)
    .eq('company_id', tenant)
    .eq('id', input.itemId);

  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[inventory] archiveInventoryItem error', {
        message: error.message,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
      });
    }
    throw error;
  }
}

// --- Restore Archived Item ----------------------------------------------------

export interface RestoreInventoryItemInput {
  companyId: string;
  itemId: string;
  actorUserId?: string;
  actorName?: string;
}

export async function restoreInventoryItem(input: RestoreInventoryItemInput): Promise<void> {
  const tenant = await resolveCompanyIdForWrite(input.companyId);

  const payload = {
    is_archived: false,
    archived_at: null,
    archived_by: null,
    updated_at: new Date().toISOString(),
  };

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[inventory] restoreInventoryItem payload', { itemId: input.itemId, ...payload });
  }

  const { error } = await db
    .public()
    .from('inventory_item_master')
    .update(payload)
    .eq('company_id', tenant)
    .eq('id', input.itemId);

  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[inventory] restoreInventoryItem error', {
        message: error.message,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
      });
    }
    throw error;
  }
}

// --- Get Archived Items -------------------------------------------------------

export async function listArchivedInventoryItems(companyId: string): Promise<InventoryItemMasterRow[]> {
  const tenant = requireCompanyId(companyId);

  const { data, error } = await db
    .public()
    .from('inventory_item_master')
    .select('*')
    .eq('company_id', tenant)
    .eq('is_archived', true)
    .order('archived_at', { ascending: false })
    .returns<InventoryItemMasterRow[]>();

  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[inventory] listArchivedInventoryItems error', error);
    }
    throw error;
  }

  return data ?? [];
}

// --- Inventory Audit Logs -----------------------------------------------------
// 
// IMPORTANT: The inventory_audit_logs table must be created via migration.
// See: docs/migrations/001_inventory_audit_logs.sql
//
// Action types supported:
// - ITEM_CREATED: New inventory item created
// - ITEM_EDITED: Item details updated
// - STOCK_IN: Stock added (purchase, opening balance, adjustment)
// - STOCK_DEDUCTED: Manual stock deduction
// - USAGE_RECORDED: Usage recorded against a project
// - ITEM_ARCHIVED: Item soft-deleted (archived)
// - ITEM_RESTORED: Archived item restored
// - ITEM_DELETED: Item permanently deleted

export type InventoryAuditActionType =
  | 'ITEM_CREATED'
  | 'ITEM_EDITED'
  | 'STOCK_IN'
  | 'STOCK_DEDUCTED'
  | 'USAGE_RECORDED'
  | 'ITEM_ARCHIVED'
  | 'ITEM_RESTORED'
  | 'ITEM_DELETED';

export interface InventoryAuditLogRow {
  id: string;
  company_id: string;
  inventory_item_id?: string | null;
  action_type: string;
  item_name?: string | null;
  quantity?: number | null;
  unit?: string | null;
  actor_user_id?: string | null;
  actor_name?: string | null;
  actor_role?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export async function listInventoryAuditLogs(params: {
  companyId: string;
  itemId?: string;
  limit?: number;
}): Promise<InventoryAuditLogRow[]> {
  const tenant = requireCompanyId(params.companyId);

  try {
    let query = db
      .public()
      .from('inventory_audit_logs')
      .select('*')
      .eq('company_id', tenant)
      .order('created_at', { ascending: false });

    if (params.itemId) {
      query = query.eq('inventory_item_id', params.itemId);
    }

    if (params.limit && params.limit > 0) {
      query = query.limit(params.limit);
    }

    const { data, error } = await query.returns<InventoryAuditLogRow[]>();

    if (error) {
      // Check if table doesn't exist (42P01 = undefined_table)
      const code = (error as any).code as string | undefined;
      if (code === '42P01' || error.message?.includes('does not exist')) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[inventory] inventory_audit_logs table does not exist. Run the migration: docs/migrations/001_inventory_audit_logs.sql');
        }
        return [];
      }
      throw error;
    }

    return data ?? [];
  } catch (err) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[inventory] listInventoryAuditLogs error', err);
    }
    // Return empty array on error to prevent UI crash
    return [];
  }
}

// --- Log Audit Event ----------------------------------------------------------

export interface LogAuditEventInput {
  companyId: string;
  action: InventoryAuditActionType | string;
  inventoryItemId?: string;
  itemName?: string;
  quantity?: number;
  unit?: string;
  actorUserId?: string;
  actorName?: string;
  actorRole?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

export async function logInventoryAuditEvent(input: LogAuditEventInput): Promise<void> {
  const tenant = await resolveCompanyIdForWrite(input.companyId);

  // Map legacy action names to new action types
  const actionTypeMap: Record<string, InventoryAuditActionType> = {
    'ADD_ITEM': 'ITEM_CREATED',
    'CREATED': 'ITEM_CREATED',
    'EDIT_ITEM': 'ITEM_EDITED',
    'STOCK_IN': 'STOCK_IN',
    'RESTOCK': 'STOCK_IN',
    'DEDUCT': 'STOCK_DEDUCTED',
    'USAGE': 'USAGE_RECORDED',
    'ARCHIVE': 'ITEM_ARCHIVED',
    'DELETE': 'ITEM_DELETED',
    'RESTORE': 'ITEM_RESTORED',
  };

  const actionType = actionTypeMap[input.action] ?? input.action;

  const payload = {
    company_id: tenant,
    inventory_item_id: input.inventoryItemId ?? null,
    action_type: actionType,
    item_name: input.itemName ?? null,
    quantity: input.quantity ?? null,
    unit: input.unit ?? null,
    actor_user_id: input.actorUserId ?? null,
    actor_name: input.actorName ?? null,
    actor_role: input.actorRole ?? null,
    notes: input.notes ?? null,
    metadata: input.metadata ?? null,
  };

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[inventory] logInventoryAuditEvent payload', payload);
  }

  try {
    const { error } = await db
      .public()
      .from('inventory_audit_logs')
      .insert(payload);

    if (error) {
      // Check if table doesn't exist
      const code = (error as any).code as string | undefined;
      if (code === '42P01' || error.message?.includes('does not exist')) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[inventory] inventory_audit_logs table does not exist. Audit event not logged. Run migration: docs/migrations/001_inventory_audit_logs.sql');
        }
        return;
      }
      
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error('[inventory] logInventoryAuditEvent error', {
          message: error.message,
          code: (error as any).code,
          details: (error as any).details,
          hint: (error as any).hint,
        });
      }
    }

    // Create admin alert for important inventory actions
    const highRiskActions = ['STOCK_DEDUCTED', 'ITEM_EDITED', 'ITEM_DELETED', 'ITEM_ARCHIVED'];
    const notableActions = ['ITEM_CREATED', 'STOCK_IN', 'ITEM_RESTORED', 'USAGE_RECORDED'];
    const isHighRisk = highRiskActions.includes(actionType);
    const isNotable = notableActions.includes(actionType);

    if (isHighRisk || isNotable) {
      const { createAdminAlert } = await import('@/services/adminAlertService');
      const label = input.itemName ?? input.inventoryItemId ?? 'Item';
      const severity = isHighRisk ? 'high' : 'normal';

      createAdminAlert({
        companyId: tenant,
        severity,
        module: 'inventory',
        action: actionType,
        actorUserId: input.actorUserId ?? undefined,
        actorName: input.actorName ?? undefined,
        targetId: input.inventoryItemId ?? undefined,
        targetLabel: label,
        metadata: input.metadata ?? undefined,
        detailPath: input.inventoryItemId ? `/inventory?highlight=${input.inventoryItemId}` : '/inventory',
      }).catch((err) => {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[inventory] Admin alert create failed', err);
        }
      });
    }
  } catch (err) {
    // Silently fail audit logging to not break main operations
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[inventory] logInventoryAuditEvent exception', err);
    }
  }
}

