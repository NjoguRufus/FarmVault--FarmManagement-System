# Inventory Stock Display Fix

## Problem Summary

The Inventory page was showing 0 stock and "Out of Stock" status for all items, even when:
- Items were created with opening stock
- Stock-in/restock operations were performed
- Audit logs correctly showed the stock movements

## Root Cause Analysis

After tracing the data flow end-to-end, the root cause was identified:

### The Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ WRITE PATH (Working)                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ AddInventoryItemModal                                                        │
│   → createInventoryItem() → inventory_item_master (INSERT) ✓                │
│   → recordInventoryStockIn() → RPC record_inventory_stock_in ✗ (MISSING!)   │
│   → logInventoryAuditEvent() → inventory_audit_logs (INSERT) ✓              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ READ PATH (Broken)                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ inventory_stock_view                                                         │
│   - Calculates current_stock from inventory_transactions table ✗ (MISSING!) │
│   - Joins with inventory_item_master ✗ (MISSING!)                           │
│   - Returns 0 for all items because no transactions exist                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Missing Components

1. **`inventory_item_master` table** - The view references this table, but it didn't exist in the database. The original schema only had `inventory_items`.

2. **`inventory_transactions` table** - The view calculates `current_stock` by summing transactions from this table, but it didn't exist.

3. **`record_inventory_stock_in` RPC** - The frontend calls this RPC to record stock additions, but it wasn't defined in the database.

4. **`record_inventory_usage` RPC** - The frontend calls this RPC to record stock usage/deductions, but it wasn't defined.

### Why Audit Logs Worked But Stock Didn't

The audit log system writes directly to `inventory_audit_logs` table via a simple INSERT, which worked because that table existed (or was created by migration 001).

However, the stock system relied on:
1. RPC functions that didn't exist
2. A transactions table that didn't exist
3. A view that queried non-existent tables

## The Fix

### Migration: `docs/migrations/002_inventory_stock_fix.sql`

This migration creates all missing components:

1. **`inventory_item_master` table** - Canonical table for inventory items with:
   - Proper foreign keys to companies, categories, suppliers
   - Packaging type support (single, sack, box, bottle, pack, other)
   - Unit size and label fields
   - Soft delete (archive) support
   - company_id as TEXT (matching the companies table)

2. **`inventory_transactions` table** - Source of truth for all stock movements:
   - Tracks all inflows and outflows
   - Supports multiple transaction types
   - Records balance after each transaction
   - Links to items, suppliers, projects

3. **`record_inventory_stock_in` RPC** - Function that:
   - Inserts a transaction record
   - Calculates running balance
   - Updates average cost on the item
   - Returns the transaction ID

4. **`record_inventory_usage` RPC** - Function that:
   - Inserts a usage/deduction transaction
   - Calculates running balance
   - Returns the transaction ID

5. **Updated `inventory_stock_view`** - View that:
   - Calculates `current_stock` from transactions (inflows - outflows)
   - Calculates `stock_status` based on current stock vs min level
   - Includes all item metadata for display
   - Excludes archived items

6. **`inventory_transaction_history_view`** - View for transaction history display

## How to Apply the Fix

### Step 1: Run the Migration

1. Open Supabase SQL Editor
2. Copy the contents of `docs/migrations/002_inventory_stock_fix.sql`
3. Execute the SQL

### Step 2: Verify the Fix

Run these verification queries:

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('inventory_item_master', 'inventory_transactions');

-- Check RPCs exist
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE 'record_inventory%';

-- Check views exist
SELECT table_name FROM information_schema.views 
WHERE table_schema = 'public' 
AND table_name LIKE 'inventory%';
```

### Step 3: Test End-to-End

1. Create a new inventory item with opening stock
2. Check the browser console for debug logs:
   - `[inventory] createInventoryItem` - Item creation
   - `[inventory] record_inventory_stock_in` - Stock transaction
   - `[useInventoryStock] Raw data` - View query results
3. Verify the Inventory page shows the correct stock

## Debug Logging

The fix includes temporary debug logging in development mode:

- `src/services/inventoryReadModelService.ts` - Logs RPC calls and responses
- `src/hooks/useInventoryReadModels.ts` - Logs raw data from the view

These logs help verify:
- RPC calls are succeeding
- Transactions are being created
- View is returning correct stock values

## Single Source of Truth

After this fix, the stock data flow is:

```
inventory_transactions (WRITE)
         │
         ▼
inventory_stock_view (READ - calculates from transactions)
         │
         ▼
useInventoryStock hook (FRONTEND)
         │
         ▼
InventoryPage / InventoryTable (DISPLAY)
```

The `inventory_transactions` table is now the single source of truth for all stock quantities.

## Files Changed

1. `docs/migrations/002_inventory_stock_fix.sql` - NEW: Complete migration
2. `docs/migrations/001_inventory_audit_logs.sql` - Fixed company_id type (TEXT not UUID)
3. `src/services/inventoryReadModelService.ts` - Added debug logging
4. `src/hooks/useInventoryReadModels.ts` - Added debug logging

## Migration Dependencies

Run migrations in this order:
1. `001_inventory_audit_logs.sql` - Creates audit logs table
2. `002_inventory_stock_fix.sql` - Creates stock tables, RPCs, and views
