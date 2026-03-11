## Phase 1 — Operations Work Cards Implementation Spec

Aligned with:  
- `docs/operations-inventory-spec.md`  
- `docs/operations-inventory-roadmap.md` (Phase 1)  

Scope: **Phase 1 only** — Operations Work Cards (no inventory integration, no suppliers, no reports).  

---

## 1. Work Card Data Model (Phase 1)

Conceptual entity: `WorkCard` (OperationsWorkCard)

### 1.1 Fields

- **Identity & tenancy**
  - `id: string`
  - `companyId: string`
  - `projectId: string`

- **Stage / context**
  - `stageId?: string | null`
  - `stageIndex?: number | null`
  - `stageName?: string | null`
  - `blockId?: string | null`
  - `blockName?: string | null`

- **Planning**
  - `workTitle: string`
  - `workCategory: string`  
    Examples: `"Spraying"`, `"Weeding"`, `"Fertilizer application"`, `"Watering"`, `"Harvest support"`.
  - `plannedDate: Date | null`
  - `plannedWorkers: number` (>= 0)
  - `plannedRatePerPerson: number` (>= 0)
  - `plannedTotal: number`  
    - Derived as `plannedWorkers * plannedRatePerPerson`, but **stored** for convenience.
  - `notes?: string | null` (planning notes)

- **Execution (manager actuals)**
  - `actualDate?: Date | null`
  - `actualWorkers?: number | null`
  - `actualRatePerPerson?: number | null`
  - `actualTotal?: number | null`  
    - Derived as `actualWorkers * actualRatePerPerson` when both present.
  - `executionNotes?: string | null`
  - `managerId?: string | null` (auth user id that submitted)
  - `managerName?: string | null`

- **Assignment**
  - `allocatedManagerId: string | null`  
    - Employee/user id for the responsible manager.

- **Payment**
  - `payment: {`
    - `isPaid: boolean`
    - `amount?: number | null`  (default from `actualTotal` at payment time; overridable)
    - `method?: 'cash' | 'mpesa' | 'bank' | 'other' | null`
    - `paidAt?: Date | null`
    - `paidByUserId?: string | null`
    - `paidByName?: string | null`
  - `}`

- **Status / workflow**
  - `status: 'planned' | 'submitted' | 'approved' | 'rejected' | 'paid'`
  - `createdByAdminId: string`
  - `createdByAdminName?: string | null`
  - `createdByManagerId?: string | null`
  - `createdAt: Date`
  - `updatedAt?: Date | null`
  - `approvedByUserId?: string | null`
  - `approvedByName?: string | null`
  - `approvedAt?: Date | null`
  - `rejectionReason?: string | null`
  - `rejectedByUserId?: string | null`
  - `rejectedByName?: string | null`
  - `rejectedAt?: Date | null`

---

## 2. Statuses & Allowed Transitions

### 2.1 Statuses

- `planned`
- `submitted`
- `approved`
- `rejected`
- `paid`

### 2.2 Initial State

- On create:
  - `status = 'planned'`
  - `payment.isPaid = false`

### 2.3 Transitions

- **`planned → submitted`**
  - **Actor**: Allocated manager (or user whose manager ids include `allocatedManagerId`).
  - **Preconditions**:
    - `status === 'planned'`
    - `allocatedManagerId` in manager’s ids.
    - `actualWorkers > 0`
    - `actualRatePerPerson > 0`
  - **Effects**:
    - Set `status = 'submitted'`
    - Set execution fields:
      - `actualDate`, `actualWorkers`, `actualRatePerPerson`, `actualTotal`, `executionNotes`, `managerId`, `managerName`
    - `updatedAt = now`

- **`submitted → approved`**
  - **Actor**: Admin with `operations.approveWorkCard`.
  - **Preconditions**:
    - `status === 'submitted'`
    - `actualWorkers`, `actualRatePerPerson` present and > 0
  - **Effects**:
    - `status = 'approved'`
    - `approvedByUserId`, `approvedByName`, `approvedAt = now`
    - `updatedAt = now`

- **`submitted → rejected`**
  - **Actor**: Admin with `operations.approveWorkCard`.
  - **Preconditions**:
    - `status === 'submitted'`
    - `rejectionReason` non-empty
  - **Effects**:
    - `status = 'rejected'`
    - `rejectionReason`, `rejectedByUserId`, `rejectedByName`, `rejectedAt = now`
    - `updatedAt = now`

- **`approved → paid`**
  - **Actor**: Admin/Finance with `operations.markWorkCardPaid`.
  - **Preconditions**:
    - `status === 'approved'`
    - `payment.isPaid === false`
    - `payment.amount > 0` (from actuals or overridden)
    - `payment.method` set
  - **Effects**:
    - `status = 'paid'`
    - `payment.isPaid = true`
    - Set `payment.amount`, `payment.method`, `payment.paidAt`, `payment.paidByUserId`, `payment.paidByName`
    - Create labour `Expense` linked to `workCardId`
    - `updatedAt = now`

### 2.4 Forbidden Transitions

- Disallow direct jumps:
  - `planned → approved`, `planned → paid`
  - `rejected → approved`, `rejected → submitted`
  - Any transition **from** `paid`
- Editing planned fields when `status !== 'planned'` (Phase 1: blocked by default).

---

## 3. Admin Workflow (Exact)

Persona: Company admin / operations manager.

### 3.1 Plan Work

1. Go to `/operations`.
2. In `Work cards` tab, click **“Add work card”**.
3. Fill:
   - Project
   - Stage (optional but recommended)
   - Block (optional)
   - Title
   - Category
   - Planned date
   - Planned workers, planned rate per person (total auto-calculated)
   - Notes (optional)
   - Allocated manager (required)
4. Hit **Save** → card stored as `planned`.

### 3.2 Monitor Cards

- Use filters (project, stage, status, manager, date, search).
- View cards grouped or listed by status with key fields visible.

### 3.3 Review & Approve/Reject

1. Filter by status `submitted` (or use “Needs approval” view).
2. Open card:
   - See planned vs actual:
     - planned workers/rate/total vs actual workers/rate/total.
     - execution notes.
   - See project, stage, manager.
3. Decide:
   - **Approve**:
     - Click “Approve”.
     - Confirm.
   - **Reject**:
     - Click “Reject”.
     - Enter reason.
     - Confirm.

### 3.4 Mark Paid

1. Filter by status `approved` (or “Awaiting payment” view).
2. Open card, click **“Mark as paid”**.
3. In modal:
   - Default amount = `actualWorkers * actualRatePerPerson` (or `plannedTotal` if missing).
   - Choose method, date (defaults to today).
   - Optionally adjust amount and add note.
4. Confirm:
   - Card becomes `paid`.
   - Expense created.

---

## 4. Manager Workflow (Exact)

Persona: Field manager or operations manager.

### 4.1 View Assigned Work

1. Go to `/manager/operations`.
2. Default view: **My Work cards**:
   - Only cards where `allocatedManagerId` matches manager’s ids.
3. Use filters:
   - Status (Planned, Submitted, Approved, Paid, Rejected, All)
   - Project
   - Date range
   - Stage (optional)
   - Search (title/category)

### 4.2 Submit Execution

1. In “Planned” list, open a card.
2. Fill execution form:
   - Actual date (default today)
   - Actual workers
   - Actual rate
   - Execution notes (optional)
3. Submit:
   - If validations pass, card moves to `submitted`.
   - Admin now sees it in approvals.

### 4.3 View Status & History

- Manager can:
  - See status of each card.
  - For submitted cards: view details read-only.
  - For approved/paid/rejected cards: see decision, amounts, and notes.
- Manager **cannot**:
  - Approve or mark paid.
  - Edit actuals after submission (Phase 1).

---

## 5. Admin Operations Page UI (Exact Sections)

Page: `/operations` (admin).

### 5.1 Header

- Project selector (if multiple projects).
- Primary button: **“Add work card”**.
- Tabs:
  - `Work cards` (default).
  - `Legacy work logs` (existing UI, secondary).

### 5.2 Work Cards Tab

- **Filter bar**
  - Project
  - Stage
  - Status (All, Planned, Submitted, Approved, Paid, Rejected)
  - Manager
  - Date range
  - Search (title/category)

- **Content section**
  - `WorkCardsList`:
    - Layout:
      - Simple list/table (MVP), with columns:
        - Title
        - Category
        - Project
        - Stage
        - Planned date
        - Manager
        - Status
        - Planned total, Actual total (when present)
        - Actions
      - Or Kanban columns by status (future).
    - Row actions (depending on status & permissions):
      - View details
      - Edit (only when `planned`)
      - Approve / Reject (when `submitted`)
      - Mark Paid (when `approved`)

- **Optional stats**
  - Count of cards per status.
  - Sum of `approved` and `paid` amounts.

### 5.3 Legacy Work Logs Tab

- Existing Work Logs UI (moved here).
- Marked clearly as “Legacy Work Logs”.

---

## 6. Manager Operations Page UI (Exact Sections)

Page: `/manager/operations`.

### 6.1 Header

- Project selector.
- Filter bar (simple).

### 6.2 Filter Bar

- Status filter: Planned / Submitted / Approved / Paid / Rejected / All.
- Date range.
- Stage (optional).
- Search (title/category).

### 6.3 Content

- **My Work Cards list**
  - Cards assigned to this manager.
  - Columns (or card layout) showing:
    - Title, category, stage, planned date.
    - Status pill.
    - Short summary: planned vs actual when available.
    - Action buttons:
      - If `planned`: “Submit execution”.
      - Else: “View”.

- **Optional History section**
  - Filtered list of submitted/approved/paid/rejected cards.

---

## 7. Modals & Forms (Exact)

### 7.1 `WorkCardFormModal` (Admin create/edit)

- **Fields**
  - Project (dropdown) – required.
  - Stage (dropdown) – optional.
  - Block (dropdown or free text) – optional.
  - Title – required.
  - Category – required (dropdown or typeahead).
  - Planned date – required.
  - Planned workers – required, integer ≥ 0.
  - Planned rate per person – required, number ≥ 0.
  - Planned total – read-only, `plannedWorkers * plannedRatePerPerson`.
  - Notes – optional.
  - Allocated manager – required (select from employees/managers).

- **Actions**
  - Save
  - Cancel

### 7.2 `WorkCardExecutionForm` (Manager)

- **Fields**
  - Actual date – required, defaults to today.
  - Actual workers – required, > 0.
  - Actual rate per person – required, > 0.
  - Actual total – read-only, derived.
  - Execution notes – optional.

- **Actions**
  - Submit execution.
  - Cancel.

### 7.3 `WorkCardApprovalDialog` (Admin)

- **Display**
  - Project, stage, manager.
  - Planned:
    - Date, workers, rate, total.
  - Actual:
    - Date, workers, rate, total.
  - Execution notes.

- **Actions**
  - Approve.
  - Reject (opens rejection reason input or separate modal).
  - Close.

### 7.4 `WorkCardRejectModal` (Admin)

- **Field**
  - Rejection reason (textarea, required).

- **Actions**
  - Confirm reject.
  - Cancel.

### 7.5 `WorkCardPaymentDialog` (Admin/Finance)

- **Fields**
  - Payment amount – default actualTotal (or plannedTotal); required, > 0.
  - Payment method – select: `cash | mpesa | bank | other`.
  - Payment date – default today; required.
  - Optional note for Expense metadata.

- **Actions**
  - Confirm payment.
  - Cancel.

---

## 8. Services & Hooks (Exact API)

### 8.1 Hooks (`src/hooks/useWorkCards.ts`)

- `useWorkCardsForCompany(companyId: string, projectId?: string)`
  - Returns:
    - `workCards: WorkCard[]`
    - `isLoading: boolean`
    - `error: Error | null`

- `useWorkCardsForManager(companyId: string, managerIds: string[], projectId?: string)`
  - Returns:
    - `workCards: WorkCard[]` (where `allocatedManagerId` in `managerIds`)
    - `isLoading`, `error`

### 8.2 Services (`src/services/operationsWorkCardService.ts`)

- `createWorkCard(input: CreateWorkCardInput): Promise<WorkCard>`
- `updateWorkCard(id: string, changes: Partial<WorkCard>): Promise<void>`
- `submitExecution(params: {`
  - `id: string`
  - `actualDate: Date`
  - `actualWorkers: number`
  - `actualRatePerPerson: number`
  - `executionNotes?: string`
  - `managerId: string`
  - `managerName: string`
  - `}): Promise<void>`
- `approveWorkCard(params: {`
  - `id: string`
  - `approverUserId: string`
  - `approverName: string`
  - `}): Promise<void>`
- `rejectWorkCard(params: {`
  - `id: string`
  - `approverUserId: string`
  - `approverName: string`
  - `rejectionReason: string`
  - `}): Promise<void>`
- `markWorkCardPaid(params: {`
  - `id: string`
  - `amount?: number`
  - `method: 'cash' | 'mpesa' | 'bank' | 'other'`
  - `paidAt: Date`
  - `paidByUserId: string`
  - `paidByName: string`
  - `}): Promise<void>`

- Guards:
  - `canManagerSubmit(card: WorkCard, managerIds: string[]): boolean`
  - `canAdminApproveOrReject(card: WorkCard): boolean`
  - `canMarkAsPaid(card: WorkCard): boolean`

- Optional audit:
  - `logOperationsAuditEvent(event: {`
    - `companyId: string`
    - `projectId?: string`
    - `operationId: string`
    - `action: string`
    - `userId: string`
    - `userName?: string`
    - `metadata?: any`
    - `}): Promise<void>`

---

## 9. Permissions (Exact)

Define/confirm the following permission keys in `PermissionMap`:

- Module-level:
  - `operations.view` – can view admin Operations page.
  - `operations.viewManager` – can view manager Operations page.

- Actions:
  - `operations.createWorkCard`
  - `operations.editWorkCard`
  - `operations.assignWorkCard`
  - `operations.submitWorkCard`
  - `operations.approveWorkCard`
  - `operations.markWorkCardPaid`

Suggested mapping:

- **Company Admin**:
  - All of the above.
- **Manager**:
  - `operations.viewManager`
  - `operations.submitWorkCard`
  - (optionally `operations.createWorkCard` if you want managers to plan their own work)
- **Finance**:
  - `operations.view`
  - `operations.markWorkCardPaid`
- **Viewer**:
  - `operations.view`

---

## 10. Edge Cases & Validation Rules

- **Create/Edit**
  - Required: `projectId`, `companyId`, `workTitle`, `workCategory`, `allocatedManagerId`, `plannedDate`, `plannedWorkers`, `plannedRatePerPerson`.
  - Constraints:
    - `plannedWorkers >= 0`
    - `plannedRatePerPerson >= 0`
  - After `status !== 'planned'`:
    - Block edits to planning fields (only notes may be editable if desired).

- **Submit Execution**
  - Only when `status === 'planned'`.
  - Only for managers whose ids include `allocatedManagerId`.
  - Required:
    - `actualDate`
    - `actualWorkers > 0`
    - `actualRatePerPerson > 0`
  - Derived:
    - `actualTotal = actualWorkers * actualRatePerPerson`.

- **Approve**
  - Only when `status === 'submitted'`.
  - Block if `actualWorkers` or `actualRatePerPerson` missing or 0.

- **Reject**
  - Only when `status === 'submitted'`.
  - Require non-empty `rejectionReason`.

- **Mark Paid**
  - Only when `status === 'approved'` and `payment.isPaid === false`.
  - Requires:
    - `payment.amount > 0`.
    - `payment.method` set.
  - Must ensure idempotence (no double-payment).

---

## 11. Firestore Document Shape (Recommended)

Collection: `operationsWorkCards`  
Document id: `id`

Example document (showing full shape for a paid card):

```json
{
  "companyId": "abc123",
  "projectId": "proj123",

  "stageId": "stage1",
  "stageIndex": 2,
  "stageName": "Vegetative growth",
  "blockId": null,
  "blockName": null,

  "workTitle": "First fertilizer application",
  "workCategory": "Fertilizer",
  "plannedDate": "2026-03-15T00:00:00.000Z",
  "plannedWorkers": 5,
  "plannedRatePerPerson": 500,
  "plannedTotal": 2500,
  "notes": "Use NPK at recommended dose",

  "actualDate": "2026-03-15T00:00:00.000Z",
  "actualWorkers": 4,
  "actualRatePerPerson": 500,
  "actualTotal": 2000,
  "executionNotes": "Rain started early; only 4 workers worked",
  "managerId": "user_mgr_1",
  "managerName": "Mary Manager",

  "allocatedManagerId": "user_mgr_1",

  "payment": {
    "isPaid": true,
    "amount": 2000,
    "method": "mpesa",
    "paidAt": "2026-03-16T08:30:00.000Z",
    "paidByUserId": "user_admin_1",
    "paidByName": "Admin A"
  },

  "status": "paid",

  "createdByAdminId": "user_admin_1",
  "createdByAdminName": "Admin A",
  "createdByManagerId": null,
  "createdAt": "2026-03-10T10:00:00.000Z",
  "updatedAt": "2026-03-16T08:30:00.000Z",

  "approvedByUserId": "user_admin_1",
  "approvedByName": "Admin A",
  "approvedAt": "2026-03-15T17:00:00.000Z",
  "rejectionReason": null,
  "rejectedByUserId": null,
  "rejectedByName": null,
  "rejectedAt": null
}
```

Notes:
- Timestamps should be stored as Firestore `Timestamp` types in implementation.
- Nulls can be omitted at write time; they are shown here for clarity.

---

## 12. Suggested Component/File Structure

### 12.1 Pages

- `src/pages/OperationsPage.tsx`
  - Wrapper page for admin:
    - Renders `OperationsWorkCardsView` (new).
    - Renders `LegacyWorkLogsView` in a secondary tab.

- `src/pages/ManagerOperationsPage.tsx`
  - Wrapper page for manager:
    - Renders `ManagerWorkCardsView` (new).

### 12.2 Components (Operations)

- `src/components/operations/OperationsWorkCardsView.tsx`
  - Top-level admin Work Cards view:
    - Filter bar.
    - List.
    - Stats.

- `src/components/operations/WorkCardsFilterBar.tsx`
  - Props: filters state + callbacks.

- `src/components/operations/WorkCardsList.tsx`
  - Props: `workCards`, `onView`, `onEdit`, `onApprove`, `onReject`, `onMarkPaid`.

- `src/components/operations/WorkCardRow.tsx` or `WorkCardCard.tsx`
  - Renders a single work card row/card with status pill and actions.

- `src/components/operations/WorkCardFormModal.tsx`
  - Admin create/edit modal.

- `src/components/operations/WorkCardExecutionForm.tsx`
  - Form for managers to submit execution.

- `src/components/operations/WorkCardApprovalDialog.tsx`
  - Approval UI for admins.

- `src/components/operations/WorkCardPaymentDialog.tsx`
  - Payment UI for admins/finance.

- `src/components/operations/WorkCardDetailsDrawer.tsx` (optional)
  - Read-only detail view for a card.

- `src/components/operations/ManagerWorkCardsView.tsx`
  - Manager-specific list + filters + integration with execution form.

### 12.3 Services & Hooks

- `src/services/operationsWorkCardService.ts`
  - Expose the service functions described above.

- `src/hooks/useWorkCards.ts`
  - Export `useWorkCardsForCompany` and `useWorkCardsForManager`.

This file is intended to be the **build-ready spec** for Phase 1; engineers can implement directly against it without having to re-interpret the higher-level roadmap.

