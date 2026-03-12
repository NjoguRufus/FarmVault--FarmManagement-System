# Inventory Control, Audit Trail, Soft Delete, and Notifications

## Overview

This implementation adds comprehensive inventory control features to FarmVault including:
- Inventory Audit view with color-coded timeline
- Deduct stock action
- Soft Delete (Archive) functionality
- Restore capability for archived items
- Automatic notifications for all inventory actions
- Color-coded audit events

## IMPORTANT: Database Migration Required

Before using the Inventory Audit feature, you must run the migration to create the `inventory_audit_logs` table:

**Run this SQL in Supabase SQL Editor:**
```
docs/migrations/001_inventory_audit_logs.sql
```

This migration creates:
- `inventory_audit_logs` table with proper schema
- RLS policies for company-scoped access
- Archive fields on `inventory_item_master`
- Helper function for logging audit events

## Files Modified

### New Components

1. **`src/components/inventory/InventoryAuditModal.tsx`**
   - Timeline view of all inventory events
   - Color-coded action badges (Green/Blue/Orange/Red/Purple)
   - Stats summary (Total, Today, This Week, Archived)
   - Restore button for archived items
   - Legend showing action types

2. **`src/components/inventory/DeductStockModal.tsx`**
   - Quantity validation (cannot exceed available stock)
   - Reason/notes field for tracking
   - Shows remaining stock after deduction
   - Clear error messages

3. **`src/components/inventory/ArchiveConfirmDialog.tsx`**
   - Confirmation dialog before archiving
   - Shows item details and current stock
   - Warning if item has stock
   - Explains what happens when archiving

### Modified Components

4. **`src/components/inventory/InventoryStatsCards.tsx`**
   - Added "Inventory Audit" button
   - New `onOpenAudit` prop

5. **`src/components/inventory/InventoryTable.tsx`**
   - Added Edit, Deduct, Delete actions to dropdown menu
   - New props: `onEditItem`, `onDeductStock`, `onArchiveItem`
   - Card view now shows actions menu on hover

6. **`src/components/inventory/RecordStockInModal.tsx`**
   - Added audit logging on stock in
   - Added notification trigger

7. **`src/components/inventory/RecordUsageModal.tsx`**
   - Added audit logging on usage
   - Added notification trigger

8. **`src/components/inventory/AddInventoryItemModal.tsx`**
   - Added audit logging on item creation
   - Added notification trigger

### Services

9. **`src/services/inventoryReadModelService.ts`**
   - Added `deductInventoryStock()` - Manual stock deduction
   - Added `archiveInventoryItem()` - Soft delete
   - Added `restoreInventoryItem()` - Restore archived items
   - Added `listArchivedInventoryItems()` - Get archived items
   - Added `listInventoryAuditLogs()` - Get audit logs
   - Added `logInventoryAuditEvent()` - Log audit events

### Hooks

10. **`src/hooks/useInventoryAudit.ts`**
    - `useInventoryAuditLogs()` - Fetch and transform audit logs
    - `useInventoryActions()` - Deduct, archive, restore mutations
    - `useInventoryNotifications()` - Notification helpers

### Pages

11. **`src/pages/InventoryPage.tsx`**
    - Integrated all new modals
    - Added state management for new features
    - Connected audit, deduct, archive, restore actions

## Audit Log Structure

### Database Schema (inventory_audit_logs)

```sql
CREATE TABLE inventory_audit_logs (
    id UUID PRIMARY KEY,
    company_id UUID NOT NULL,
    inventory_item_id UUID,
    action_type TEXT NOT NULL,  -- See action types below
    item_name TEXT,             -- Snapshot of item name
    quantity NUMERIC,
    unit TEXT,
    actor_user_id UUID,
    actor_name TEXT,
    actor_role TEXT,
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ
);
```

### TypeScript Interface

```typescript
interface AuditLogEntry {
  id: string;
  action: AuditAction;
  itemId?: string;
  itemName?: string;
  quantity?: number;
  actorId?: string;
  actorName?: string;
  timestamp: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  isArchived?: boolean;
}
```

### Action Types (Database → UI Mapping)

| Database action_type | UI Action | Color | Description |
|---------------------|-----------|-------|-------------|
| ITEM_CREATED | ADD_ITEM | Green | New item created |
| STOCK_IN | STOCK_IN | Green | Stock added |
| ITEM_EDITED | EDIT_ITEM | Blue | Item details updated |
| STOCK_DEDUCTED | DEDUCT | Orange | Stock deducted |
| USAGE_RECORDED | USAGE | Orange | Usage recorded |
| ITEM_ARCHIVED | ARCHIVE | Red | Item archived (soft delete) |
| ITEM_DELETED | DELETE | Red | Item deleted |
| ITEM_RESTORED | RESTORE | Purple | Item restored |

## Notification Trigger Logic

Notifications are triggered for:

1. **Stock Added** (STOCK_IN, RESTOCK)
   - Type: `success`
   - Message: "{User} added {qty} {units} to {itemName}"

2. **Item Created** (ADD_ITEM)
   - Type: `success`
   - Message: "{User} created new inventory item: {itemName}"

3. **Usage Recorded** (USAGE)
   - Type: `warning`
   - Message: "{User} used {qty} {units} of {itemName}"

4. **Stock Deducted** (DEDUCT)
   - Type: `warning`
   - Message: "{User} deducted {qty} units from {itemName}"

5. **Item Archived** (ARCHIVE)
   - Type: `error`
   - Message: "{User} archived {itemName}"

6. **Item Restored** (RESTORE)
   - Type: `success`
   - Message: "{User} restored {itemName}"

## Soft Delete (Archive) Implementation

### How It Works

1. When user clicks "Delete" on an item:
   - Confirmation dialog appears
   - Shows item details and current stock
   - Warns if item has remaining stock

2. On confirmation:
   - Sets `is_archived = true` on `inventory_item_master`
   - Sets `archived_at` timestamp
   - Sets `archived_by` user ID
   - Logs ARCHIVE audit event
   - Sends notification

3. Item behavior when archived:
   - Hidden from normal inventory list (via view filter)
   - Data preserved in database
   - Appears in audit trail with restore button

### Database Fields

```sql
ALTER TABLE inventory_item_master ADD COLUMN is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE inventory_item_master ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE inventory_item_master ADD COLUMN archived_by UUID;
```

## Restore Implementation

### How It Works

1. In Audit Modal, archived items show "Restore Item" button
2. On click:
   - Sets `is_archived = false`
   - Clears `archived_at` and `archived_by`
   - Logs RESTORE audit event
   - Sends notification
   - Item reappears in inventory list

### Permissions

- Restore is available to users with `inventory.addItem` permission
- Typically admin/manager roles

## Database Migration

See `docs/INVENTORY_AUDIT_SOFT_DELETE.sql` for:
- Archive fields on `inventory_item_master`
- Enhanced audit log columns
- Updated stock view to exclude archived items
- Archived items view
- Helper functions

## UI Flow

### Inventory Page
```
┌─────────────────────────────────────────┐
│ Inventory                    [Add Item] │
├─────────────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐        │
│ │Total│ │ Low │ │ Out │ │Value│        │
│ │Items│ │Stock│ │Stock│ │     │        │
│ └─────┘ └─────┘ └─────┘ └─────┘        │
│                        [Inventory Audit]│
├─────────────────────────────────────────┤
│ [Filters...]                            │
├─────────────────────────────────────────┤
│ Item List with Actions:                 │
│  • View details                         │
│  • Edit                                 │
│  • Stock in                             │
│  • Deduct                               │
│  • Record usage                         │
│  • Delete (Archive)                     │
└─────────────────────────────────────────┘
```

### Audit Modal
```
┌─────────────────────────────────────────┐
│ Inventory Audit Trail              [X]  │
├─────────────────────────────────────────┤
│ Total: 45 │ Today: 3 │ Week: 12 │ Del: 2│
├─────────────────────────────────────────┤
│ ● [GREEN] Stock In                      │
│   DAP Fertilizer                        │
│   Added 10 units to stock               │
│   by John • 2 hours ago                 │
│                                         │
│ ● [ORANGE] Deducted                     │
│   Dithane                               │
│   Deducted 5 units from stock           │
│   by Mary • 3 hours ago                 │
│   Note: Field spraying                  │
│                                         │
│ ● [RED] Archived                        │
│   Irrigation Pipe                       │
│   Archived item (soft delete)           │
│   by Admin • Yesterday                  │
│   [Restore Item]                        │
├─────────────────────────────────────────┤
│ Legend: [+Added] [~Updated] [-Deducted] │
│         [×Archived] [↺Restored]         │
└─────────────────────────────────────────┘
```

## Testing Checklist

- [ ] Add new inventory item → audit log entry + notification
- [ ] Record stock in → audit log entry + notification
- [ ] Record usage → audit log entry + notification
- [ ] Deduct stock → validates quantity, audit log + notification
- [ ] Archive item → confirmation dialog, audit log + notification
- [ ] Archived item hidden from list
- [ ] Restore item → audit log + notification
- [ ] Restored item visible in list
- [ ] Audit modal shows all events with correct colors
- [ ] Notifications appear in notification dropdown
- [ ] Existing features (stock in, record usage) still work

## Future Enhancements

1. **Notification Recipients**
   - Currently: Actor receives notification
   - Future: Admin always receives, managers optionally

2. **Archived Items View**
   - Dedicated page/tab for viewing all archived items
   - Bulk restore capability

3. **Audit Export**
   - Export audit trail to CSV/PDF
   - Date range filtering

4. **Edit Item Modal**
   - Full edit capability from inventory table
   - Currently redirects to item details page
