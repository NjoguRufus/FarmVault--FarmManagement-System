# French Beans Harvest Collections — Audit and Fix Plan

## Phase 1 — Database Introspection (READ-ONLY)

- **File:** `docs/harvest_collections_introspection.sql`
- **How to run:** Open Supabase Dashboard → SQL Editor → paste the full file → Run. Results appear as multiple result sets; use the `section` column (A1_TABLES_VIEWS, A2_COLUMNS, A3_PK, A3_FK, A4_RLS_POLICIES, A5_RLS_ENABLED, A6_FUNCTIONS, A7_VIEWS, A7_PUBLIC_COMPANY_SUB_TYPE) to identify each part.
- **Purpose:** Confirm actual tables, columns, PK/FK, RLS policies, and functions before changing code or DB.

---

## Phase 2 — Repo Audit: Related Files and Truth Table

### Files involved

| Area | File | Purpose |
|------|------|--------|
| **UI** | `src/pages/HarvestCollectionsPage.tsx` | Main French beans collections page: list collections, pickers, intake, payments; create collection; add picker; record intake; record cash payments (including partial). |
| **UI** | `src/pages/HarvestDetailsPage.tsx` | Harvest details (may link to collections). |
| **UI** | `src/pages/ExpensesPage.tsx` | Uses `getHarvestPickersByIds` from harvest service for picker names. |
| **Service** | `src/services/harvestCollectionsService.ts` | Canonical Supabase service: `harvest.harvest_collections`, `harvest.harvest_pickers`, `harvest.picker_intake_entries`, `harvest.picker_payment_entries`. No Firebase. |
| **Service** | `src/services/harvestCollectionService.ts` | Legacy Firebase-backed; deprecated for harvest collections; do not use for new code. |
| **Service** | `src/services/projectsService.ts` | Uses `db.projects().from('projects')` → `projects.projects`. Correct. |
| **Auth** | `src/contexts/AuthContext.tsx` | Uses `current_context()` RPC for `company_id` and `role` (from `core.company_members`). |
| **Debug** | `src/components/debug/DevAuthDebugPanel.tsx` | Shows `active_company_id` and memberships/role from `core.company_members`. |
| **DB** | `src/lib/db.ts` | Schema helpers: `db.harvest()`, `db.projects()`, etc. Never `supabase.from('table')` without schema. |

### Query paths (no guessing)

- **Collections:** `db.harvest().from('harvest_collections')` → `harvest.harvest_collections`
- **Pickers:** `db.harvest().from('harvest_pickers')` → `harvest.harvest_pickers`
- **Intake:** `db.harvest().from('picker_intake_entries')` → `harvest.picker_intake_entries`
- **Payments:** `db.harvest().from('picker_payment_entries')` → `harvest.picker_payment_entries`
- **Projects:** `db.projects().from('projects')` → `projects.projects` (not `public.projects`)

### Truth Table (UI name → service field → DB column → table/schema)

| UI name | Service field | DB column | Table / schema |
|--------|----------------|-----------|-----------------|
| harvest date | `harvestDate` | `collection_date` | `harvest.harvest_collections` |
| crop type | `cropType` | `crop_type` | `harvest.harvest_collections` |
| picker rate (KES/kg) | `pricePerKgPicker` | `price_per_kg` | `harvest.harvest_collections` |
| notes | `name` / `notes` | `notes` | `harvest.harvest_collections` |
| status | `status` | `status` | `harvest.harvest_collections` (open/closed) |
| total kg (picker) | `totalKg` | derived: sum of `quantity` | `harvest.picker_intake_entries` |
| total pay (picker) | `totalPay` | derived: sum of `amount_paid` | `harvest.picker_payment_entries` |
| weight per entry | `weightKg` | `quantity` | `harvest.picker_intake_entries` |
| payment amount | `amount` / `payAmount` | `amount_paid` | `harvest.picker_payment_entries` |
| recorded at | `recordedAt` | `recorded_at` | `harvest.picker_intake_entries` |
| paid at | — | `paid_at` | `harvest.picker_payment_entries` |

### Legacy / wrong references to avoid

- **Do not use:** `public.projects`, `harvested_on` (use `collection_date`), `kg` as column name (use `quantity`), `amount` as column (use `amount_paid`), `is_current` on harvest collections.  
- **Firebase:** No `useCollection` or Firestore in the harvest collections flow; `harvestCollectionService.ts` is deprecated for this module.

---

## Phase 3 — Pinpointing Failures

### 1) 403 Forbidden on POST /rest/v1/... (harvest or projects)

- **API call:** e.g. `POST /rest/v1/harvest_collections` (schema `harvest`).
- **RLS:** Insert policy e.g. `harvest_collections_insert_creator_member`: `core.is_company_member(company_id) AND created_by = core.current_user_id()`.
- **Typical cause:** `core.current_user_id()` is null (JWT not forwarded or Supabase anon key used without session). Or `company_id` not sent / wrong company.
- **Fix:** Ensure Supabase client uses the same session as Clerk (e.g. Clerk JWT in Supabase custom header or Supabase Auth synced with Clerk). Ensure inserts include `company_id` and do **not** send `created_by` so DB default `core.current_user_id()` is used.

### 2) “New row violates row-level security policy”

- **API call:** Insert into `harvest.harvest_collections` or `harvest.picker_intake_entries` / `harvest.picker_payment_entries`.
- **RLS:** With check: `core.is_company_member(company_id)` and, for collections, `created_by = core.current_user_id()`.
- **Predicate that can fail:**  
  - `core.current_user_id()` null → `created_by` default fails policy.  
  - `core.is_company_member(company_id)` false → e.g. `active_company_id` not set or user not in `core.company_members` for that company.
- **Fix:** Use RPCs that set context server-side (`harvest.record_intake`, `harvest.record_payment`, `harvest.create_collection`) or ensure JWT and `core.current_user_id()` are set and profile has `active_company_id`; do not require client to send `created_by`/`recorded_by`/`paid_by`.

### 3) “Permission denied” / empty list after insert

- **API call:** `GET /rest/v1/harvest_collections` or list pickers/intake/payments.
- **RLS:** Select policy uses `core.is_company_member(company_id)`.
- **Predicate that can fail:** Same as above; or reading from wrong schema/table (e.g. `public.projects` instead of `projects.projects`).
- **Fix:** Use `db.projects().from('projects')` and `db.harvest().from('harvest_collections')` etc.; ensure `company_id` filter and that user has membership and `active_company_id` set.

### 4) “Project not found” although project card appears

- **API call:** e.g. `getProject(projectId)` or single-row select from projects.
- **Cause:** List and get use same `projects.projects`; if list works, get usually works. Possible causes: wrong `projectId` (e.g. collection id), or RLS on `projects.projects` (select by `core.is_company_member(company_id)`) and request not scoped to that company.
- **Fix:** Ensure `companyId` is set (from `current_context()`), and that the same client/role is used for both list and get. Do not use `public.projects`.

### Minimal safe fixes (summary)

- Use **canonical schemas** only: `core`, `projects`, `harvest`, `billing`. Avoid `public.projects` and legacy tables for this module.
- **Do not require** client to send `created_by` / `recorded_by` / `paid_by`; rely on DB defaults.
- Ensure **company_id** on every insert and that **membership** and **active_company_id** are set.
- Prefer **RPCs** for insert path where available (`harvest.create_collection`, `harvest.record_intake`, `harvest.record_payment`, `harvest.close_collection`) so checks and defaults are server-side and RLS issues are avoided.

---

## Phase 4 — Implementation (Long-term Safe)

- **Company creator = company_admin:** Role comes from `core.company_members.role` via `current_context()` in AuthContext; no change needed. TenantDebug (DevAuthDebugPanel) already shows role from `core.company_members`.
- **Harvest writes under RLS:** Inserts include `company_id`; do not send `created_by`/`recorded_by`/`paid_by`; use DB defaults. Prefer RPCs for record_intake and record_payment when caller has `picker_id`.
- **Fast cash payments:** Multiple rows in `harvest.picker_payment_entries`; partial payments allowed. View `harvest.collection_picker_totals` provides total_kg, total_due, total_paid, balance per picker (rate = coalesce(price_per_kg, 20) KES/kg).
- **RPCs:** `harvest.record_intake(collection_id, picker_id, quantity, unit)`, `harvest.record_payment(collection_id, picker_id, amount_paid, note)`, `harvest.close_collection(collection_id)` — all security definer, use `core.current_company_id()` and `core.is_company_member()`; no recursion, no public schema dependency.

---

## Phase 5 — Deliverables and Test Checklist

### 1) Introspection SQL

- Content: see `docs/harvest_collections_introspection.sql` (read-only; sections A1–A7).

### 2) Single “apply” migration (apply.sql)

- File: `supabase/migrations/20260305100000_harvest_collections_view_and_rpcs.sql`
- Run in Supabase (Dashboard → SQL Editor or `supabase db push`). Idempotent; no DROP/CASCADE.
- Contents: optional columns `unit` / `currency` on intake and payment tables; view `harvest.collection_picker_totals`; RPC overloads `harvest.record_intake(collection_id, picker_id, quantity, unit)` and `harvest.record_payment(collection_id, picker_id, amount_paid, note)`; `harvest.close_collection(collection_id)`; grants.

### 3) Code changes (file-by-file)

| File | Change |
|------|--------|
| `docs/harvest_collections_introspection.sql` | Added “How to run” block at top (read-only; run in Supabase SQL Editor; use `section` column to identify result sets). |
| `src/services/harvestCollectionsService.ts` | Import `supabase`. `addPickerIntake`: prefer `supabase.schema('harvest').rpc('record_intake', { p_collection_id, p_picker_id, p_quantity, p_unit })`, fallback to direct insert. `recordPickerPayment`: prefer `supabase.schema('harvest').rpc('record_payment', { p_collection_id, p_picker_id, p_amount_paid, p_note })`, fallback to direct insert. New `closeCollection(collectionId)` calling `harvest.close_collection` RPC. Do not send `created_by`/`recorded_by`/`paid_by`; rely on DB defaults. |
| `HarvestCollectionsPage.tsx` | No change required for this phase; already uses `companyId`/`projectId` from context and `pickerAmountsById` for batch payment. |
| `AuthContext.tsx` / `DevAuthDebugPanel.tsx` | No change; role from `current_context()` (core.company_members). |

### 4) Test checklist

- [ ] **Create collection:** As company_admin, create a French beans collection for a project; verify row in `harvest.harvest_collections` with correct `company_id`, `project_id`, `collection_date`, `crop_type`, `price_per_kg` (e.g. 20), `status = 'open'`.
- [ ] **Add pickers:** Add two pickers to the collection; verify rows in `harvest.harvest_pickers`.
- [ ] **Record intake (fast):** Add several intake entries (quantity in kg) per picker; verify in `harvest.picker_intake_entries`; totals on UI match sum of `quantity` per picker.
- [ ] **Record cash payments (full):** Pay one picker in full; verify `harvest.picker_payment_entries` and that balance for that picker is 0 (or minimal rounding).
- [ ] **Record partial payment (“short of coins”):** Pay part of another picker’s due; verify new payment row; balance = total_due - total_paid carried forward.
- [ ] **Balances per picker:** Confirm UI shows total_kg, total_due, total_paid, balance per picker (from view or client derivation).
- [ ] **Close collection:** Call close (or set status closed); verify `status = 'closed'` and `closed_at` set; no new intake/payment allowed unless reopened by admin.
- [ ] **No 403/RLS errors:** All actions as company_admin and as member complete without “new row violates RLS” or “permission denied”.
- [ ] **Project list and project detail:** List projects and open project detail for the same project; no “project not found” when using `projects.projects` and same company context.
