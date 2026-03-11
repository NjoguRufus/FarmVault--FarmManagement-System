## FarmVault Operations & Inventory — Product & Technical Spec

Audit aligned as of: 2026-03-10  
Scope: Operations module, Inventory module, and their integration (approvals, audit trails, low stock alerts, stage-based tracking, supplier integration, and related workflows).  

---

## 1. Purpose & Outcomes

- **Primary goal**: Make FarmVault’s Operations + Inventory the single, reliable system of record for:
  - Day-to-day farm work (who did what, where, when, and with what).
  - All consumable inputs and materials (stock levels, movements, and suppliers).
  - Approvals, payments, and audit trails around both.
- **Outcomes**:
  - Any farm manager can answer, with confidence:
    - *“What work was done today/yesterday/this week on this project and stage?”*
    - *“Which items were used for that operation, and how much stock is left?”*
    - *“Who approved it, who paid it, and when?”*
    - *“Which supplier did we buy this from, at what cost, and how often do we reorder?”*

---

## 2. High-Level Concepts

- **Work Card**: Planned or structured farm operation with lifecycle statuses and explicit assignment.
- **Work Log**: Direct daily log of work (labour-centric). May be demoted or merged into cards over time.
- **Inventory Item**: Any tracked consumable or material (fertilizer, chemical, seeds, fuel, crates, sacks, ropes, etc.).
- **Inventory Movement**:
  - **Stock-in**: Restock/purchase.
  - **Stock-out**: Usage tied to an operation (or explicit adjustment).
- **Inventory Usage**: Ledger row for each usage event, with links to operations/harvest and projects/stages.
- **Expense**: Financial record (labour, input purchase, other costs).
- **Season Challenge & Needed Item**: Operational risks/issues and the inventory needed to resolve them.

---

## 3. Roles & Permissions (Conceptual)

- **Company Admin**
  - Full read/write for Operations & Inventory within company.
  - Can create/assign work cards, approve/reject, mark paid.
  - Can create/edit inventory items, restock, deduct, delete.
  - Can manage suppliers, needed items, and override adjustments.
- **Manager**
  - Sees work cards allocated to them and project-specific operations.
  - Can submit execution for work cards, record work logs, propose operations.
  - Can record inventory usage for their operations (within limits).
- **Field Operator / Employee (future)**
  - Mobile-first task list of assigned work cards.
  - Can mark tasks as started/completed, optionally log simple usage.
  - No approvals, restock, or delete powers.
- **Finance / Accountant**
  - Read access to Operations & Inventory data.
  - Can mark payments, reconcile expenses, run reports.
- **Viewer**
  - Read-only across operations, inventory, and suppliers.

Permissions will be enforced via a dedicated `PermissionMap` (existing) and route/component guards:
- **Critical actions requiring explicit permission**:
  - Approve/reject operations.
  - Mark operations as paid.
  - Restock inventory and create expenses.
  - Deduct inventory and perform manual adjustments.
  - Delete items or operations.

---

## 4. Data Model (Target Shape)

> Note: This spec describes the **target canonical model**, independent of current Firestore/Supabase split. Implementation may start with Firestore and migrate to Supabase, but the shape stays the same.

### 4.1 Operations

#### 4.1.1 Work Card (OperationsWorkCard)

- **Identity & tenancy**
  - `id`
  - `companyId`
  - `projectId`
  - `cropType`
  - `stageId`
  - `stageIndex`
  - `stageName`
  - Optional `blockId`, `blockName`
- **Planning**
  - `workTitle`
  - `workCategory` (e.g. spraying, fertilizer application, weeding, watering, harvesting support).
  - `plannedDate`
  - `plannedWorkers`
  - `plannedRatePerPerson`
  - `plannedTotal` (derived)
  - Optional **planned inputs**:
    - `plannedItems[]`:
      - `inventoryItemId`
      - `category`
      - `plannedQuantity`
      - `unit`
- **Execution (Actual)**
  - `actualDate`
  - `actualWorkers`
  - `actualRatePerPerson`
  - `actualTotal` (derived).
  - `actualItems[]` (supports **multiple items per operation**):
    - `inventoryItemId`
    - `category`
    - `quantity`
    - `unit` (logical usage unit, e.g. litres, units, bags; conversion done by inventory layer).
  - `managerId`
  - `managerName`
  - `notes`
- **Payment**
  - `payment.isPaid`
  - `payment.amount` (defaults to `actualWorkers * actualRatePerPerson`).
  - `payment.method` (cash, M-Pesa, bank, other).
  - `payment.paidAt`
  - `payment.paidByUserId`
  - Optional linkage:
    - `payment.expenseId`
    - `payment.walletLedgerEntryId`
- **Status & Workflow**
  - `status`: `planned | in_progress | submitted | approved | rejected | paid | canceled`.
  - `allocatedManagerId`
  - `createdByAdminId`
  - `createdByManagerId?`
  - `createdAt`
  - `updatedAt`
  - `approvedByUserId?`, `approvedAt?`
  - `rejectedByUserId?`, `rejectedAt?`, `rejectionReason?`
  - `canceledByUserId?`, `canceledAt?`, `cancelReason?`
- **Audit / metadata**
  - `origin` (manual / plan / imported / template).
  - `sourceChallengeId?` (if spawned from a season challenge).

#### 4.1.2 Work Log (WorkLog – future position)

- **Purpose**:
  - Either:
    - A simplified, labour-only logger when Work Cards are too heavy, or
    - A legacy shape to be migrated into Work Cards.
- **Fields (subset)**:
  - `id`, `companyId`, `projectId`, `cropType`
  - `stageIndex`, `stageName`
  - `date`
  - `workCategory`, `workType`
  - `numberOfPeople`, `ratePerPerson`, `totalPrice`
  - `employeeIds[]`, `employeeName?`
  - `notes`
  - Optional `inputs[]` (multiple inventory items; same shape as `actualItems`).
  - `managerId`, `managerName`
  - Payment: `paid`, `paidAt`, `paidByUserId`
  - Approval: optional `approvedByUserId`, `approvedAt`

### 4.2 Inventory

#### 4.2.1 Inventory Item

- **Identity & tenancy**
  - `id`
  - `companyId`
- **Core**
  - `name`
  - `category` (`fertilizer | chemical | fuel | diesel | materials | sacks | ropes | wooden-crates | seeds | other-*`)
  - `quantity` (stored in **canonical unit**; see below).
  - `unit` (stored unit label; e.g. `boxes`, `units`, `bags`, `kg`, `containers`, `litres`, `crates`).
  - `pricePerUnit` (last or weighted-average; see valuation rules).
- **Category-specific descriptors**
  - Chemicals:
    - `packagingType` (`box | single`)
    - `unitsPerBox`
  - Fuel:
    - `fuelType` (`diesel | petrol`)
    - `containers`
    - `litresTotal?` (optional descriptive)
  - Fertilizer:
    - `bags`
    - `kgsTotal?`
  - Wooden crates:
    - `boxSize` (`big | medium | small`)
  - Seeds:
    - `cropTypes[]`
    - `seedType`, `vendorBrand?`
- **Scope**
  - `scope` (`company | project | crop`)
  - `projectId?`
  - `cropType?`
  - `cropTypes?[]`
- **Supplier & planning**
  - `supplierId?`
  - `supplierName?`
  - `pickupDate?`
  - `minThreshold` (low-stock threshold).
- **Timestamps**
  - `lastUpdated`
  - `createdAt`

#### 4.2.2 Inventory Usage

- **Identity & tenancy**
  - `id`
  - `companyId`
  - `projectId`
- **Item & quantity**
  - `inventoryItemId`
  - `category`
  - `quantity` (usage quantity in **logical usage unit**).
  - `unit`
- **Source context**
  - `source`: `workCard | workLog | harvest | manual-adjustment | system-correction`.
  - `workCardId?`
  - `workLogId?`
  - `harvestId?`
  - `stageIndex?`, `stageName?`
  - `managerId?`, `managerName?`
  - `recordedByUserId`
  - `date` (usage date)
  - `createdAt` (record creation timestamp)

> **Source of truth for “what was used where”**: `InventoryUsage` is the canonical ledger for all usage events.

#### 4.2.3 Inventory Purchase (Stock-in)

- `id`
- `companyId`
- `inventoryItemId`
- `quantityAdded`
- `unit`
- `totalCost`
- `pricePerUnit`
- `projectId?` (if purchase is project-specific)
- `date`
- `expenseId?`
- `createdAt`

#### 4.2.4 Inventory Audit Log (Structural changes)

- `id`
- `companyId`
- `action` (`ADD_ITEM | EDIT_ITEM | RESTOCK | DEDUCT | DELETE | TRANSFER | ADD_NEEDED | STATUS_CHANGE`)
- `inventoryItemId?`
- `quantity?`
- `metadata` (JSON – before/after snapshots, reason, linked ids).
- `createdByUserId`
- `createdByName?`
- `createdAt`

#### 4.2.5 Needed Item

- `id`
- `companyId`
- `projectId?`
- `itemName`
- `category`
- `quantity`
- `unit`
- `sourceChallengeId?`
- `sourceChallengeTitle?`
- `status` (`pending | ordered | received | canceled`)
- `createdAt`
- `updatedAt?`

#### 4.2.6 Supplier

- `id`
- `companyId`
- `name`
- `contact?`
- `email?`
- `categories[]` (Seeds, Fertilizers, Pesticides, Equipment, etc.)
- `rating` (0–5)
- `status` (`active | paused | archived`)
- `reviewNotes?`
- `createdAt`
- `updatedAt`

---

## 5. Workflow Specifications

### 5.1 Operations Workflows

#### 5.1.1 Plan operation (Work Card)

- **Actor**: Company Admin / Manager (with permission).
- **Steps**:
  1. Choose **project** and (optional) **stage/block**.
  2. Enter **work details**: title, category, planned date.
  3. Specify **planned labour**: planned workers, rate per person.
  4. (Optional but recommended) Add **planned inputs** (one or more inventory items + quantities).
  5. **Allocate manager** responsible for execution.
  6. Save card in `planned` status.
- **Result**:
  - Card appears in:
    - Admin Operations view (Planning tab).
    - Manager’s Operations view (“Assigned to me”).
  - No stock or expenses affected yet.

#### 5.1.2 Execute operation (Manager)

- **Actor**: Assigned Manager.
- **Steps**:
  1. Open assigned card from Manager view.
  2. For each card in `planned`:
     - Mark as **“In progress”** optionally (status `in_progress`).
     - Fill **actuals**:
       - Actual date.
       - Actual workers, rate, total.
       - Actual items used (one or many):
         - For each planned item, confirm/adjust quantity.
         - Add additional items if used.
       - Execution notes.
  3. Submit card → status transitions to `submitted`.
- **Result**:
  - Actual data stored on card.
  - No stock or expenses adjusted yet (pending approval).

#### 5.1.3 Approve / reject operation (Admin)

- **Actor**: Company Admin / designated approver.
- **Rules**:
  - Only cards in `submitted` state can be approved/rejected.
  - Approver must have `canApproveOperations` permission.
- **Approve flow**:
  1. System runs **stock check**:
     - For each `actualItem`:
       - Check `inventoryItem.quantity` (in canonical unit) vs required quantity (with conversions).
     - If any insufficient:
       - Show list of missing stock (item, required, available).
       - Admin can:
         - Abort approval.
         - Or override with explicit confirmation (configurable).
  2. On confirm:
     - Deduct stock:
       - For each item, decrement `inventoryItem.quantity` appropriately.
       - Record `InventoryUsage` with `source='workCard'`.
     - Set card status to `approved`.
     - Record `approvedByUserId`, `approvedAt`.
     - Append **operation-level audit log** (see Audit Trails).
- **Reject flow**:
  - Require `rejectionReason`.
  - Set card status to `rejected`.
  - Record `rejectedByUserId`, `rejectedAt`.
  - No stock or expense changes.

#### 5.1.4 Payment (Mark as paid)

- **Actor**: Admin / Finance with `canMarkOperationsPaid`.
- **Rules**:
  - Only `approved` cards may be marked as `paid`.
- **Steps**:
  1. Confirm payment amount (default `actualWorkers * actualRatePerPerson` with override allowed).
  2. Choose payment method and date.
  3. On confirm:
     - Create **Expense** (`category='labour'`, `workCardId`).
     - Mark `payment.isPaid = true`, `status = 'paid'`.
     - Optionally create a **wallet ledger entry** for project budgets.
     - Append operation-level audit log.

#### 5.1.5 Work Logs (simplified path)

- **Use cases**:
  - Quick, low-friction records where Work Cards are overkill.
  - Possibly: *Phase 1* fallback until cards are fully adopted.
- **Rules**:
  - Work Logs can optionally be **auto-wrapped** into virtual Work Cards in the future.
  - When inputs are recorded on a Work Log:
    - Either:
      - Deduct immediately via `InventoryUsage + quantity decrement`, or
      - Only record `InventoryUsage` and rely on manual deduction.
  - This is a product choice to finalize.

### 5.2 Inventory Workflows

#### 5.2.1 Add inventory item

- **Actor**: Admin / Manager with inventory permission.
- **Steps**:
  1. Enter name, category, initial quantity, unit, price per unit.
  2. Choose scope (company/project/crop).
  3. Link supplier (optional) and pickup/delivery date.
  4. Set `minThreshold` or accept default.
  5. Save:
     - Create `InventoryItem`.
     - Create `InventoryAuditLog` `ADD_ITEM`.
     - (Optional) create `InventoryPurchase` + `Expense` if this is a purchased stock-in.

#### 5.2.2 Restock (stock-in)

- **Actor**: Admin / Manager with restock permission.
- **Steps**:
  1. Choose item.
  2. Enter `quantityAdded`, `unit`, `totalCost`, `date`.
  3. Save:
     - Increment item `quantity`.
     - Create `InventoryPurchase` with `pricePerUnit = totalCost / quantityAdded`.
     - Optionally create `Expense` (`category = inventory category`, `projectId`).
     - Append `InventoryAuditLog` `RESTOCK`.

#### 5.2.3 Deduct (stock-out) via manual adjustment

- **Actor**: Admin / Manager (with dedicated permission).
- **Use cases**:
  - Corrections (shrinkage, damage, miscount).
  - Non-operation-specific uses (e.g. “office use”).
- **Steps**:
  1. Choose item.
  2. Enter `quantity`, `unit` (if not canonical), and `reason` (required).
  3. Save:
     - Validate available stock.
     - Decrement `InventoryItem.quantity`.
     - Create `InventoryUsage` (`source = 'manual-adjustment'`, `reason` in metadata).
     - Append `InventoryAuditLog` `DEDUCT`.

#### 5.2.4 Low stock alerts

- **Definition**:
  - Item is **low stock** if `quantity < (minThreshold || defaultThreshold)`.
  - `defaultThreshold` configurable per company (e.g. 10 units or category-specific).
- **Behavior**:
  - Inventory list visually highlights low-stock items.
  - Dashboard displays **Low stock items** widget.
  - Optional notifications:
    - Daily/weekly summary.
    - Per-project/crop view of critical items.

#### 5.2.5 Needed items & supplier integration

- **From Season Challenges**:
  - When editing a challenge’s `itemsUsed`:
    - If item does not exist in inventory and `needsPurchase = true`:
      - Create `NeededItem` in canonical store.
      - Link `sourceChallengeId` and `sourceChallengeTitle`.
      - Append `InventoryAuditLog` `ADD_NEEDED`.
- **From Inventory page**:
  - Manual creation of `NeededItem` for items not tied to a challenge.
- **From Needed Item to Supplier**:
  - Manager can convert `NeededItem` to a **purchase order** concept (later feature):
    - Select supplier.
    - Create corresponding `InventoryPurchase` + `InventoryItem` (if new) or just restock existing.
    - Update `NeededItem.status` to `ordered`/`received`.

---

## 6. Approvals, Audit Trails, and Stage-Based Tracking

### 6.1 Approvals

- **Operations**:
  - Work Cards: explicit `submitted → approved | rejected` state.
  - Work Logs:
    - Optional: add `approved` flag and `approvedByUserId`, `approvedAt`.
  - Approval is required before:
    - Marking as paid.
    - Considering labour cost as final for reporting.
    - In stricter setups, before inventory deduction (unless configured otherwise).

### 6.2 Audit Trails

- **Operation-level audit** (per card/log):
  - Keep an `operations_audit_logs` collection/table:
    - `operationId`, `operationType` (`workCard | workLog`), `action`, `metadata`, `user`, `timestamp`.
  - Actions:
    - `CREATE`, `EDIT`, `SUBMIT`, `APPROVE`, `REJECT`, `MARK_PAID`, `CANCEL`, `INVENTORY_DEDUCTED`, `INVENTORY_REVERSED`.
- **Inventory-level audit**:
  - `InventoryAuditLog` as defined above: append-only, no update/delete.
  - Links to operations where relevant via metadata (`workCardId`, `workLogId`, `harvestId`).

### 6.3 Stage-Based Tracking

- **Every operation and usage is stage-aware**:
  - Operations: `stageId`, `stageIndex`, `stageName`.
  - InventoryUsage: `stageIndex`, `stageName`.
- **Reporting**:
  - For each stage in a project:
    - Labour cost (sum of expenses linked to operations in that stage).
    - Inventory usage count and cost.
    - Operations counts (by category).
    - Challenges raised/resolved in that stage.

---

## 7. Reporting & Metrics

- **Per project / per season**:
  - Operations:
    - Number of operations per category and stage.
    - Labour cost per stage, per category, per manager.
  - Inventory:
    - Usage volume per item/category per stage.
    - Purchase vs usage curves (are we over-buying?).
  - Challenges:
    - Challenges per stage and their resolution status.
    - Inputs used for resolution.
- **Global dashboards**:
  - Top input-consuming projects.
  - Low stock critical items.
  - Supplier performance (on-time, quality via ratings, number of linked items).

---

## 8. Edge Case Handling (Design Intent)

- **Multiple items per operation**:
  - Work Cards and Work Logs both allow `items[]`, not just a single item.
  - Deduction processes all of them at approval.
- **Inventory used before stock is recorded**:
  - System should:
    - Either forbid deduction (strict mode), or
    - Allow “negative stock” with a warning and require later reconciliation (flexible mode).
  - Mode is a company-level configuration.
- **Partial units**:
  - Support decimal quantities where meaningful (e.g. 0.5 bags, fractional crates if needed).
- **Cross-project usage**:
  - Items can be scoped company-wide.
  - Usage events always specify `projectId`, so cost allocation remains clear.
- **Adjustments & corrections**:
  - Encourage **reversal operations** instead of hard edits:
    - E.g. `INVENTORY_REVERSED` event plus an opposite `DEDUCT`/`RESTOCK`.
  - Ensure audit trail clearly shows original vs correction.

---

## 9. Implementation Notes (Non-Binding)

- **Backend convergence**:
  - Long-term: migrate Operations & Inventory fully to Supabase tables already defined.
  - In the interim: keep data model consistent across Firestore and Supabase via dual-write or phased migration.
- **Separation of concerns**:
  - Extract business logic into services/hooks, keeping pages slim.
  - Keep conversion logic (units, packaging) centralized in inventory helpers.
- **Feature flags**:
  - Consider flags for:
    - “Work Cards only” vs “Work Logs + Work Cards”.
    - “Strict inventory deduction on approval”.
    - “Negative stock allowed”.

This file is the **source-of-truth specification** for Operations + Inventory behavior going forward and should be updated whenever we refine product decisions or add major capabilities.

