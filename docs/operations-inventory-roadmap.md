## FarmVault Operations & Inventory — Implementation Roadmap

Aligned with: `docs/operations-inventory-spec.md`  
Focus: Ship usable value quickly, then deepen features.  

---

## Phase 1 — Operations Work Cards (Core Task Engine)

### Features implemented

- **Work Card lifecycle (MVP)**:
  - Create work cards for a project + stage:
    - Fields: title, category, planned date, stage, planned workers, planned rate, notes.
  - Assign cards to a manager (`allocatedManagerId`).
  - Manager can submit **actuals**:
    - Actual date, actual workers, actual rate, actual total, notes.
  - Admin can:
    - Approve submitted cards.
    - Reject with reason.
    - Mark approved cards as **paid** (with payment info).
- **Operations views**:
  - Admin `/operations`:
    - List of Work Cards by **status** (planned / submitted / approved / paid / rejected).
    - Filters: project, stage, manager, date range, status.
  - Manager `/manager/operations`:
    - “Assigned to me”: cards where `allocatedManagerId` matches.
    - Filters: status, project, date.
- **Basic audit**:
  - For each Work Card, minimal audit events:
    - `CREATE`, `SUBMIT`, `APPROVE`, `REJECT`, `MARK_PAID`.
  - Stored in lightweight `operationsAuditLogs` (or similar).
- **Work Logs**:
  - Keep existing Work Logs but **de-emphasize**:
    - Put them under a “Legacy logs” or secondary tab.
    - No new features or dependencies.

### Database changes

- **Short-term canonical store**: keep Work Cards in **Firestore** to minimize risk.
- **Collections**:
  - `operationsWorkCards` (existing, cleaned up):
    - Ensure fields at least:
      - Identity: `id`, `companyId`, `projectId`, timestamps.
      - Stage/context: `stageId?`, `stageIndex?`, `stageName?`, `blockId?`, `blockName?`.
      - Planning: `workTitle`, `workCategory`, `plannedDate`, `plannedWorkers`, `plannedRatePerPerson`, `plannedTotal`.
      - Execution: `actualDate?`, `actualWorkers?`, `actualRatePerPerson?`, `actualTotal?`, `notes?`, `managerId?`, `managerName?`.
      - Assignment: `allocatedManagerId`.
      - Payment: `payment.isPaid`, `payment.amount`, `payment.method`, `payment.paidAt`, `payment.paidByUserId?`.
      - Status: `status` (`planned | submitted | approved | rejected | paid`).
      - Audit: `createdByAdminId`, `createdByManagerId?`, `approvedByUserId?`, `approvedAt?`, `rejectionReason?`.
  - `expenses` (existing):
    - Continue using labour expenses:
      - `category='labour'`, `workCardId`, `amount`, `date`, `projectId`, `stageIndex?`, `stageName?`.
  - **New (optional)**: `operationsAuditLogs`:
    - `id`, `companyId`, `projectId?`, `operationId`, `operationType='workCard'`, `action`, `metadata`, `userId`, `userName?`, `createdAt`.

> **Deferral:** Do **not** use Supabase `operations_work_cards` table in this phase; plan a migration later once flows are stable.

### UI components

- **Admin `/operations`**
  - `OperationsWorkCardsPage` (wraps existing `OperationsPage` logic but card-focused):
    - `WorkCardsFilterBar` (project, stage, status, manager, date).
    - `WorkCardsList`:
      - Renders cards grouped or filtered by status.
      - Action buttons: View, Edit (planned fields), Approve, Reject, Mark Paid.
    - `WorkCardFormModal`:
      - Create/edit planned data.
    - `WorkCardApprovalDialog`:
      - Shows execution details and allows approve/reject with reason.
    - `WorkCardPaymentDialog`:
      - Payment amount + method + date.
  - Legacy:
    - A secondary tab or section: `LegacyWorkLogsTab` using current Work Logs UI, but clearly marked as “legacy”.
- **Manager `/manager/operations`**
  - `ManagerWorkCardsPage`:
    - `ManagerWorkCardsFilterBar` (status, project, date).
    - `ManagerWorkCardsList`:
      - Focused on cards allocated to this manager.
    - `WorkCardExecutionForm`:
      - Simple, mobile-friendly actuals form.

### Services/hooks

- **Hooks** (most exist; may just need tidy signatures):
  - `useWorkCardsForCompany(companyId, projectId?)`.
  - `useWorkCardsForManager(companyId, managerIds, projectId?)`.
- **Services** (refine existing `operationsWorkCardService`):
  - `createWorkCard(input)`.
  - `updateWorkCard(id, changes)`.
  - `submitExecution(id, actualPayload)`.
  - `approveWorkCard(id, approverUser)`.
  - `rejectWorkCard(id, reason, approverUser)`.
  - `markWorkCardPaid(id, paymentDetails)`.
  - Guards:
    - `canManagerSubmit(card, managerIds)`.
    - `canAdminApproveOrReject(card)`.
    - `canMarkAsPaid(card)`.
  - Optional:
    - `logOperationsAuditEvent(event)`.

### Estimated complexity

- **Backend/services**: **Medium** (refactor + tighten rules, not a greenfield).
- **Frontend**: **Medium–High** (splitting large pages into focused card-centric UIs).

### Dependencies

- Auth & roles/permissions.
- Projects & stages available.
- Expenses creation for labour already functioning.

---

## Phase 2 — Inventory Core (Items, Stock & Movements)

### Features implemented

- **Inventory items CRUD**:
  - Add/edit/delete items with:
    - Name, category, quantity, unit, price per unit, optional min threshold.
  - Support basic category metadata only where necessary (e.g. chemicals `unitsPerBox`).
- **Stock movements**:
  - **Restock**:
    - Increase quantity.
    - Record an `InventoryPurchase` entry with total cost and derived price per unit.
  - **Deduct (manual adjustment)**:
    - Decrease quantity.
    - Record an `InventoryUsage` with `source='manual-adjustment'`.
- **Inventory audit log**:
  - Record actions:
    - `ADD_ITEM`, `RESTOCK`, `DEDUCT`, `DELETE`.
- **Low stock indication**:
  - Simple rule:
    - Low if `quantity < (minThreshold || defaultThreshold)`.
  - Surface low-stock items in the inventory list and small dashboard widget.

### Database changes

- **Canonical store**: keep Inventory in **Firestore** for now.
- **Collections**:
  - `inventoryItems`:
    - `id`, `companyId`, `name`, `category`, `quantity`, `unit`, `pricePerUnit?`, `minThreshold?`, `lastUpdated`, `createdAt`.
    - Optional early category fields: `packagingType`, `unitsPerBox`, `boxSize`, etc., but not required for all categories in Phase 2.
  - `inventoryPurchases`:
    - `id`, `companyId`, `inventoryItemId`, `quantityAdded`, `unit`, `totalCost`, `pricePerUnit`, `projectId?`, `date`, `expenseId?`, `createdAt`.
  - `inventoryUsage`:
    - `id`, `companyId`, `projectId?`, `inventoryItemId`, `category`, `quantity`, `unit`, `source`, `date`, `createdAt`.
  - `inventoryAuditLogs`:
    - `id`, `companyId`, `action`, `inventoryItemId?`, `quantity?`, `metadata`, `createdBy`, `createdAt`.

> **Bug fix to plan for implementation:**  
> Update `restockInventoryAndCreateExpense` so it increments `quantity` instead of setting it to `undefined`.

### UI components

- **`/inventory`**
  - `InventoryPage` refactor into:
    - `InventoryFilterBar`:
      - Search, category filter, crop filter (simple for now).
    - `InventoryList`:
      - Items grouped by category, with low-stock badges.
      - Actions per item: View, Edit, Restock, Deduct, Delete.
    - `InventoryItemFormModal`:
      - Create/edit item with the minimal Phase 2 fields.
    - `InventoryRestockModal`.
    - `InventoryDeductModal`.
    - `InventoryAuditDrawer`:
      - Lists audit entries for company, with item names and actions.
    - `InventoryItemUsageDrawer`:
      - Shows recent `InventoryUsage` rows for a selected item.
- **Dashboard**
  - Strengthen `InventoryOverview` widget:
    - Use price per unit * quantity for approximate value.
    - Show count of low-stock items.

### Services/hooks

- **Hooks**
  - `useInventoryItems(companyId, filters)`.
  - `useInventoryItem(itemId)`.
  - `useInventoryUsageForItem(companyId, itemId, {limit})`.
  - `useInventoryAuditLogs(companyId, {limit})`.
- **Services**
  - `addInventoryItem(input)`, `updateInventoryItem(id, changes)`, `deleteInventoryItem(id)`.
  - `restockInventory(input)`:
    - Increment quantity.
    - Create `inventoryPurchases` row.
    - Optional `Expense`.
    - `InventoryAuditLog` `RESTOCK`.
  - `deductInventoryManual(input)`:
    - Decrement quantity.
    - Create `InventoryUsage` `source='manual-adjustment'`.
    - `InventoryAuditLog` `DEDUCT`.
  - `createInventoryAuditLog(entry)`.

### Estimated complexity

- **Backend/services**: **Medium** (fix and unify restock/deduct logic).
- **Frontend**: **Medium–High** (decomposing the monolithic Inventory page).

### Dependencies

- Company context and permissions.
- Basic operations (Phase 1) exist but no hard dependency on them for this phase.

---

## Phase 3 — Operations ↔ Inventory Integration

### Features implemented

- **Work Card → Inventory consumption**:
  - **Execution**:
    - In `WorkCardExecutionForm`, manager can specify **one or more items used**:
      - Each item: `inventoryItemId`, `quantity`, `unit`.
  - **Approval**:
    - When admin approves:
      - System checks stock for all items.
      - If insufficient:
        - Show warning with required vs available.
        - Optionally block approval (strict mode) or allow override (configurable).
      - On proceed:
        - Deduct stock from `inventoryItems.quantity` (with any required unit conversions).
        - Create `InventoryUsage` rows for each item:
          - `source='workCard'`, `workCardId`, `projectId`, `stageIndex`, `stageName`, `managerName`, `date`.
- **UI visibility**:
  - **On a Work Card**:
    - “Inventory used” section showing items, quantities, and links to Inventory.
  - **On an Inventory Item**:
    - In usage drawer, label entries by source:
      - Work Cards, Work Logs, Manual adjustments, Harvest.
      - Allow filtering by source.

> **Simplification:**  
> Limit this phase to **Work Cards** as the only source that **automatically deducts** inventory. Keep Work Logs as optional usage logs without deduction until later.

### Database changes

- No new collections — just populate relationships consistently:
  - `inventoryUsage.workCardId` must be populated for each deduction.
  - Ensure `inventoryItems.quantity` always reflects stock after operations.

### UI components

- **Operations**
  - Extend `WorkCardExecutionForm`:
    - Add `ActualInputsSection` with:
      - Item search dropdown (by name/category).
      - Quantity and unit fields.
      - Ability to add/remove rows.
  - Extend `WorkCardApprovalDialog`:
    - Show summary table of actual inputs + available stock.
    - Display validation messages for insufficiency.
  - `WorkCardDetails` view:
    - “Inventory used” tab or section pulling from `inventoryUsage` by `workCardId`.
- **Inventory**
  - `InventoryItemUsageDrawer`:
    - Section for “Used in operations” (source = `workCard`).
    - Click-through to corresponding Work Card.

### Services/hooks

- **Operations services**
  - Extend `submitExecution` to accept and store `actualItems[]`.
  - Extend `approveWorkCard`:
    - For all `actualItems[]`, call:
      - `checkStockForItems`, and if okay:
      - `deductInventoryForWorkCardItems`.
  - Add `getInventoryUsageForWorkCard(workCardId)` helper for detail view.
- **Inventory services**
  - Generalize `deductInventoryForWorkCard` logic to work with multiple items.
  - Ensure all deductions create corresponding `InventoryUsage` entries and `InventoryAuditLogs` where appropriate.

### Estimated complexity

- **Backend/services**: **High** (touches critical approval paths and stock).
- **Frontend**: **Medium** (forms + detail panels).

### Dependencies

- Phase 1 Work Cards must be solid.
- Phase 2 Inventory items and basic flows must be trusted.

---

## Phase 4 — Suppliers & Needed Items

### Features implemented

- **Suppliers module (practical)**:
  - Manage suppliers (name, contact, email, categories, rating, notes).
  - See list of inventory items per supplier.
- **Needed Items pipeline**:
  - From season challenges:
    - Editing `itemsUsed` with `needsPurchase` creates a canonical `NeededItem`.
  - From Inventory:
    - Manually create `NeededItem` when stock is missing or recurrent purchases are planned.
  - Handling Needed Items:
    - View list of needed items per project/company.
    - Mark as `ordered` / `received` / `canceled`.
    - On `received`, prompt to:
      - Create new `InventoryItem` or
      - Restock existing one.
- **Light supplier integration**:
  - When adding/restocking an item, user can pick a supplier.
  - Supplier detail shows:
    - Items supplied.
    - Basic aggregated metrics (count of items, rough spend if available).

### Database changes

- **Canonical store** for `NeededItem` (pick one, Firestore for now):
  - `neededItems`:
    - `id`, `companyId`, `projectId?`, `itemName`, `category`, `quantity`, `unit`, `sourceChallengeId?`, `sourceChallengeTitle?`, `status`, `createdAt`, `updatedAt?`.
- Ensure Season Challenges flows write to this single `neededItems` collection (avoid double-writing to Supabase + Firestore until migration).

### UI components

- **`/suppliers`**
  - Refine `SuppliersPage`:
    - List + card views.
    - Supplier form modal (name, contact, email, categories).
    - Detail drawer:
      - Linked inventory items.
      - Rating & review notes.
- **`/inventory`**
  - `NeededItemsSection`:
    - Table of needed items filtered by project/status.
    - Actions: mark ordered, mark received, cancel.
    - On “mark received”:
      - Trigger flow to create/restock inventory item.
- **Challenges page**
  - Ensure `SeasonChallengesPage`:
    - When `itemsUsed` has `needsPurchase`, automatically calls `createNeededItem`.

### Services/hooks

- `useSuppliers(companyId)`.
- `useNeededItems(companyId, projectId?)`.
- `createNeededItem(input)`, `updateNeededItemStatus(id, status)`.
- Season challenges service:
  - Call `createNeededItem` when appropriate.

### Estimated complexity

- **Backend/services**: **Medium** (glue code + a new canonical collection).
- **Frontend**: **Medium** (small screens & flows).

### Dependencies

- Season Challenges page + service.
- Inventory items and restock flows (for turning needed items into real items).

---

## Phase 5 — Reporting & Analytics

### Features implemented

- **Project-level operations & inventory summary**:
  - For each project:
    - Operations:
      - Number of operations per category.
      - Labour cost per stage.
      - Paid vs unpaid operations count and amount.
    - Inventory:
      - Quantity & cost of items used (from `InventoryUsage`) per stage.
      - Top items by usage.
      - Current low-stock + open needed items.
- **High-level dashboards**:
  - Simple pre-built reports, for a date range:
    - “Operations & Inputs by Stage”:
      - Stage rows; columns for operations count, labour cost, key items used.
    - “Inventory Usage per Item”:
      - Items; columns for quantity, approximate cost, number of operations.
    - “Spend per Supplier” (if enough data):
      - Suppliers; sum of purchase `totalCost`.
- **Drill-down**:
  - From any metric row, allow navigation to:
    - Filtered Work Cards list.
    - Filtered Inventory Usage list.
    - Relevant Expenses.

### Database changes

- Mostly none; rely on existing collections:
  - `operationsWorkCards`, `workLogs` (if still used), `inventoryUsage`, `expenses`, `inventoryPurchases`, `neededItems`.
- Optional: add indexes for common queries (date-range + project filters).

### UI components

- **Project details page**
  - Strengthen `ProjectOperationsSummary`:
    - Add more metrics (inventory usage counts, labour cost by stage).
    - Link to near-term reports.
- **`/reports` (or similar)**
  - `ReportsHome`:
    - Cards for key reports (Operations by Stage, Inventory Usage, Supplier Spend).
  - Simple report components:
    - Table-based, with export to CSV/Excel.

### Services/hooks

- Aggregation hooks that compute metrics in JS over Firestore queries (initially):
  - `useProjectOperationsSummary(projectId, dateRange)`.
  - `useProjectInventorySummary(projectId, dateRange)`.
  - `useSupplierSpendSummary(companyId, dateRange)`.
- These can be moved to Supabase/SQL in a later optimization phase.

### Estimated complexity

- **Backend/services**: **Medium** (aggregation logic).
- **Frontend**: **Medium** (new views, mostly read-only).

### Dependencies

- Accurate data from Phases 1–4.
- Decided rules on valuation (purchase-cost only vs usage-cost, etc.).

---

## Simplifications vs Full Spec

- **Work Cards first, Work Logs later**:
  - Treat Work Cards as the primary operations object.
  - Keep Work Logs as legacy/simple logs until you see a strong need to invest in them.
- **Basic category logic in Phase 2**:
  - Defer advanced packaging and mixed-unit modelling where not absolutely necessary.
  - Start with clear, intuitive units per category.
- **Single backend per domain initially**:
  - Keep Operations & Inventory on Firestore in early phases.
  - Use Supabase schemas later, once flows are validated and stable.
- **Few, opinionated reports** instead of general analytics:
  - Focus on 3–5 reports that farm managers actually need day-to-day.

This roadmap should be kept in sync with `operations-inventory-spec.md` and used as the planning reference for sequencing work, tickets, and releases.

