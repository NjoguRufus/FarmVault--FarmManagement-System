## Inventory (Supabase) – System Audit

This file documents the **current Supabase-based inventory implementation**, how it interacts with the legacy Firebase flows, and the target rebuild direction.

---

### 1. Supabase inventory surfaces (code → DB)

**Core services and hooks**

- `src/services/inventoryReadModelService.ts`
  - **Views (read-only)** (via `db.public()`):
    - `inventory_stock_view` → `InventoryStockRow`
    - `inventory_low_stock_view` → low/out-of-stock subset
    - `inventory_transaction_history_view` → `InventoryTransactionRow`
    - `inventory_usage_report_view` → `InventoryUsageRow`
  - **Tables (direct insert/select)**:
    - `inventory_categories` → `InventoryCategoryRow`
    - `inventory_item_master` → `InventoryItemMasterRow`
  - **RPCs (write-side)**:
    - `record_inventory_stock_in` → stock-in / purchases
    - `record_inventory_usage` → usage / deductions

- `src/hooks/useInventoryReadModels.ts`
  - `useInventoryStock` → `listInventoryStock` (Supabase `inventory_stock_view`)
  - `useInventoryItemStock` → `getInventoryItemStock`
  - `useLowStockInventory` → `listLowStockItems`
  - `useInventoryTransactions` → `listInventoryTransactions`
  - `useInventoryUsage` → `listInventoryUsage`
  - `useInventoryCategories` → `listInventoryCategories`

- `src/services/inventoryService.ts` (Supabase section)
  - **Schema alias**: `db.inventory()` (`supabase.schema('public')` for inventory tables).
  - Tables:
    - `items` (canonical inventory items)
    - `movements` (per-item stock movements)
    - `purchases` (restock purchases)
    - `audit_logs` (inventory audit trails)
  - Operations:
    - `addInventoryItem`, `updateInventoryItem`, `deleteInventoryItem`
    - `restockInventory`, `deductInventoryManual`, `recordInventoryMovement`
    - `getInventoryItems`, `getInventoryItemById`
    - `getInventoryMovementsForItem`, `getInventoryAuditLogs`

**UI entry points (Supabase-backed)**

- `src/pages/InventoryPage.tsx`
  - Uses `useInventoryStock`, `useInventoryCategories`, and `listSuppliers`.
  - Opens:
    - `AddInventoryItemModal` (create category/item/supplier + opening stock)
    - `RecordStockInModal` (stock-in)
    - `RecordUsageModal` (usage/deduction)

- `src/pages/InventoryItemDetailsPage.tsx`
  - Uses:
    - `useInventoryItemStock` → current stock snapshot
    - `useInventoryTransactions` → transaction timeline
    - `useInventoryUsage` → usage history

- `src/pages/InventoryCategoriesPage.tsx`
  - Uses `useInventoryCategories` + `createInventoryCategory`.

- `src/pages/InventorySuppliersPage.tsx`
  - Uses `listSuppliers` (Supabase `suppliers` table).

**Mutating components (Supabase)**

- `src/components/inventory/AddInventoryItemModal.tsx`
  - Resolves `companyId` from Clerk session claims:
    - `const { sessionClaims } = useAuth()`
    - `const sessionCompanyId = (sessionClaims?.company_id as string | undefined)?.trim()`
    - `activeCompanyId = sessionCompanyId || String(companyId ?? '').trim()`
  - Category creation:
    - Calls `createInventoryCategory({ companyId: activeCompanyId, ... })` → `inventory_categories`.
  - Supplier creation:
    - Calls `createSupplier({ companyId: activeCompanyId, name })` → `suppliers`.
  - Item master creation:
    - Calls `createInventoryItem({ companyId: activeCompanyId, ... })` → `inventory_item_master`.
  - Opening stock-in:
    - Calls `recordInventoryStockIn({ companyId: activeCompanyId, itemId, quantity, unitCost, ... })` → RPC `record_inventory_stock_in`.

- `src/components/inventory/RecordStockInModal.tsx`
  - Calls `recordInventoryStockIn` for restocks.

- `src/components/inventory/RecordUsageModal.tsx`
  - Calls `recordInventoryUsage` for usage/deductions.

---

### 2. Supabase schema (from migrations)

**Tables (inventory domain)**

From `supabase/migrations/20240101000001_farmvault_schema.sql`:

- `inventory_categories`
- `inventory_items`
- `inventory_purchases`
- `inventory_usage`
- `inventory_audit_logs`
- `suppliers`

Related tables that tie into inventory economics:

- `expenses`
- `work_logs`
- `operations_work_cards`
- Harvest + wallet tables (French beans flows):
  - `harvests`, `harvest_collections`, `harvest_pickers`,
  - `picker_weigh_entries`, `harvest_payment_batches`,
  - `harvest_wallets`, `collection_cash_usage`,
  - `project_wallet_ledger`.

**RLS policies**

From `supabase/migrations/20240101000002_rls_policies.sql`:

- Enables RLS on all inventory tables and applies:
  - `row_company_matches_user(company_id)`
  - `current_company_id()` for inserts (`WITH CHECK company_id = current_company_id() OR is_developer()`).
- Helper functions:
  - `current_company_id()` (reads `profiles.company_id` via `auth.uid()`).
  - `is_developer()`, `is_company_admin()`, `is_manager()`.

Implication: **all inventory writes must use a `company_id` that matches `current_company_id()`** for the current Supabase auth user.

---

### 3. Interaction with legacy Firebase inventory

Even with Supabase in place, some flows still hit Firestore:

- `src/pages/OperationsPage.tsx`
  - Uses `useCollection<InventoryItem>('inventoryItems', 'inventoryItems', scope)` for available inputs.
  - Uses `recordInventoryUsage` / `checkStockForWorkCard` from `inventoryService` (Firestore-based helpers) when saving work logs.

- `src/pages/CropStagesPage.tsx`
  - Uses `useCollection<InventoryUsage>('inventoryUsage', 'inventoryUsage', scope)` to show per-stage chemicals/inputs.
  - Uses `useCollection<InventoryItem>('inventoryItems', 'inventoryItems', scope)` for item names/units.

- `src/pages/ProjectDetailsPage.tsx`
  - Uses `useCollection<InventoryUsage>('inventoryUsage', 'inventoryUsage', ...)` to build project-level `inventoryUsageByItem`.

- `src/services/inventoryService.ts` (bottom, Firestore section)
  - `recordInventoryUsage` → writes to Firestore `inventoryUsage`.
  - `checkStockForWorkCard` → reads from Firestore `inventoryItems`.
  - `deductInventoryForHarvest` → reads `inventoryItems`, writes `inventoryUsage`.

- `src/services/inventoryAuditLogService.ts`
  - Firestore `inventoryAuditLogs` collection (legacy audit).

Result: **new Supabase writes are not visible to Firebase-based analytics**, and vice versa.

---

### 4. Known points of fragility

- **Dual sources of truth**
  - Supabase:
    - Main inventory module: items, categories, suppliers, stock-in, and per-item usage.
  - Firebase:
    - Operations work logs, crop stage analytics, project inventory analytics, some harvest deductions.

- **RLS vs Clerk company ID**
  - Frontend uses Clerk `sessionClaims.company_id` to set `company_id`.
  - Supabase RLS uses `current_company_id()` from `profiles.company_id`.
  - If these drift, Supabase writes/reads for inventory will fail RLS even while Firebase continues to accept writes.

- **Audit log schema mismatch**
  - `inventoryService.logAuditEvent` currently uses `created_by_user_id` / `created_by_name`, but the SQL schema exposes `created_by` only, so inserts into `inventory_audit_logs` may fail until aligned.

- **Operations not wired to Supabase inventory**
  - `OperationsPage` still:
    - Reads `inventoryItems` from Firestore.
    - Records usage in Firestore only.
  - Supabase `inventory_usage` and associated views are not updated when work is logged.

---

### 5. Rebuild direction (high level)

- **Phase 1 – Supabase-first reads**
  - Migrate all inventory **reads** in `ProjectDetailsPage`, `CropStagesPage`, and `OperationsPage` from Firestore to Supabase views:
    - Use `inventory_stock_view` and `inventory_usage_report_view` everywhere.

- **Phase 2 – Supabase-only writes**
  - Replace Firestore inventory writes in `inventoryService` (`recordInventoryUsage`, `checkStockForWorkCard`, `deductInventoryForHarvest`) with Supabase-based logic:
    - `record_inventory_usage` RPC
    - `inventory_stock_view` for stock checks
    - `inventory_items` / `inventory_purchases` / `inventory_usage` for state.

- **Phase 3 – Analytics & dashboards**
  - Rebuild project-level and stage-level analytics off Supabase usage + items.
  - Ensure dashboards and “operations snapshot” components query Supabase exclusively.

- **Phase 4 – Decommission Firebase inventory**
  - Remove `inventoryItems`, `inventoryUsage`, `inventoryAuditLogs` dependencies from app code.
  - Keep legacy data for backup/migration only.

This document is intended to sit alongside `docs/INVENTORY_AUDIT.md` (Firebase-era behaviour) to clearly separate **legacy** vs **Supabase** inventory behaviour during the migration period.

