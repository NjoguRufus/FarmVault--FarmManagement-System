# FarmVault: Phased Migration Plan (Firebase → Supabase)

This document defines a phased migration that keeps Firebase fully functional until Supabase parity is proven. **No refactors or Firebase removal until the final phase.**

---

## Fallback toggle: data provider

Introduce a single switch so the app can read/write from either backend:

- **Env:** `VITE_DATA_PROVIDER=firebase` | `supabase` (default: `firebase` until migration complete).
- **Pattern:** A small provider layer (e.g. `getDataProvider()`) returns Firebase or Supabase client/services. All feature code calls the provider instead of importing Firebase or Supabase directly. When `VITE_DATA_PROVIDER=supabase`, the provider returns Supabase-backed implementations; when `firebase`, existing Firebase implementations.
- **Behavior:** No change to UI or feature behavior; only the backing store changes per env.

---

## Phase 0: Add Supabase client + env + non-blocking Firebase flags

**Goal:** Supabase is available in the repo; app still uses only Firebase.

1. **Env**
   - Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (already present in `.env`).
   - Add `VITE_DATA_PROVIDER=firebase` (default). Do not read it in app logic yet.

2. **Supabase client**
   - Keep/use `src/lib/supabase.js` (or equivalent) that creates the Supabase client from env. No calls from feature code yet.

3. **Migrations**
   - Apply Supabase migrations (`0001_farmvault_schema.sql`, `0002_rls_policies.sql`, `0003_indexes.sql`) in a Supabase project (dev/staging). Confirm schema and RLS work.

4. **No behavior change**
   - No component or service is refactored. Firebase remains the single source of truth.

**Exit criteria:** Supabase project exists, migrations applied, client loads without errors; app still 100% Firebase.

---

## Phase 1: Auth strategy (parallel or keep Firebase Auth)

**Goal:** Decide and implement auth for the transition period.

**Option A — Keep Firebase Auth temporarily (recommended for least risk)**  
- Continue using Firebase Auth for sign-in/sign-up and session.  
- When writing to Supabase, either:
  - Use a Supabase service role key from a backend/Edge Function that verifies Firebase ID token and maps to a Supabase user, or
  - Create Supabase users in sync (e.g. on first login) and use Supabase anon key with a custom JWT that encodes Firebase UID and company_id so RLS can use them.  
- Profiles in Supabase are filled from Firebase `users` (and optionally `employees`) during sync or first read.

**Option B — Move to Supabase Auth**  
- Implement sign-in/sign-up with Supabase Auth (email/password).  
- Migrate Firebase users to `auth.users` and `profiles` (one-time script).  
- App uses Supabase session; RLS uses `auth.uid()` and `current_company_id()` from `profiles`.  
- Firebase Auth can be removed in a later phase once all features use Supabase.

**Exit criteria:** Auth strategy documented and implemented; Supabase RLS can identify user and company (either via synced profile or Supabase Auth).

---

## Phase 2: Move low-risk reads first (companies, projects, stages)

**Goal:** Read companies, projects, and project_stages from Supabase when provider is `supabase`; writes can still go to Firebase initially if desired.

1. **Provider**
   - Implement `VITE_DATA_PROVIDER`: when `supabase`, feature code that today reads companies/projects/project_stages uses Supabase client and new tables `companies`, `projects`, `project_stages`.

2. **Data**
   - One-time or recurring sync from Firestore `companies`, `projects`, `projectStages` into Supabase (script or Edge Function). Keep Firebase as source of truth until Phase 3 writes are moved.

3. **Read paths**
   - Settings (company), project list, project detail, stage list: if provider is `supabase`, query Supabase; else Firebase. Same UI and props.

4. **Firebase**
   - Leave all Firebase read/write code in place; only bypassed when provider is `supabase` for these collections.

**Exit criteria:** With `VITE_DATA_PROVIDER=supabase`, company and project/stage reads come from Supabase; Firebase still used for everything else. No UI change.

---

## Phase 3: Move writes (expenses, work logs, inventory)

**Goal:** Writes for expenses, work logs, and inventory go to Supabase when provider is `supabase`; reads for these entities from Supabase.

1. **Provider**
   - For `expenses`, `work_logs`, `inventory_*` (categories, items, purchases, usage, audit logs): when provider is `supabase`, all reads and writes use Supabase.

2. **Sync / dual-write (optional)**
   - Optionally dual-write to Firebase during Phase 3 for rollback, or one-way sync Supabase → Firebase for reporting. Prefer single-write to Supabase and retire Firebase for these collections once stable.

3. **Budget / project**
   - `expense_budget_service`-style logic: when deducting from project budget, update `projects.budget` (or budget pool) in Supabase.

4. **Firebase**
   - No longer read/write expenses, work logs, inventory from app when provider is `supabase`. Keep Firebase code paths for when provider is `firebase`.

**Exit criteria:** With `VITE_DATA_PROVIDER=supabase`, expenses, work logs, and inventory are read and written only in Supabase. Firebase unchanged for harvest, wallet, auth (if still Firebase), etc.

---

## Phase 4: Move harvest collections + wallet (highest risk)

**Goal:** Harvest collections, pickers, weigh entries, payment batches, and project wallet (ledger, meta, harvest wallets) use Supabase when provider is `supabase`.

1. **Harvest flows**
   - Create/update harvest collections, pickers, weigh entries, payment batches; link harvests and sales. All via Supabase when provider is `supabase`.

2. **Wallet**
   - Replace client-side `payPickersFromWalletBatchFirestore` with either:
     - A Supabase RPC (Postgres function) that runs the batch pay in a transaction, or
     - An Edge Function that does the same with service role.  
   - Project wallet ledger and meta: reads/writes via Supabase. Legacy `harvest_wallets` and `collection_cash_usage` in Supabase; migration from Firebase data if needed.

3. **Testing**
   - Full regression: create collection, add pickers, weigh, close collection, pay from wallet, check ledger and balances.

4. **Firebase**
   - Harvest/wallet code paths only used when provider is `firebase`. No removal yet.

**Exit criteria:** With `VITE_DATA_PROVIDER=supabase`, harvest and wallet operations work end-to-end in Supabase; billing and balances match expectations.

---

## Phase 5: Replace realtime listeners

**Goal:** All live updates use Supabase Realtime instead of Firestore `onSnapshot`.

1. **Map listeners (see `/docs/supabase-mapping.md` and audit)**
   - `useCollection` → Supabase Realtime on the corresponding table(s) with filters (e.g. `company_id=eq.{id}`).
   - Project wallet ledger → channel on `project_wallet_ledger` (company_id, project_id).
   - Admin subscription payments → channel on `subscription_payments` with filters.
   - Activity logs → channel on `activity_logs`.
   - Crop catalog → channel on `crop_catalog`.
   - Connectivity check → single select or channel with limit 1 on `projects`.

2. **Provider**
   - When provider is `supabase`, all these flows use Supabase Realtime; when `firebase`, keep `onSnapshot`.

3. **Cleanup**
   - Unsubscribe/cancel channels on unmount; mirror existing Firestore cleanup behavior.

**Exit criteria:** With `VITE_DATA_PROVIDER=supabase`, no Firestore realtime listeners are used; all live data comes from Supabase Realtime.

---

## Phase 6: Decommission Firestore reads after parity proven

**Goal:** Supabase is the single source of truth; Firebase is optional or removed.

1. **Parity**
   - Confirm every feature works with `VITE_DATA_PROVIDER=supabase` in dev and staging (auth, companies, projects, stages, expenses, work logs, inventory, harvest, wallet, records, feedback, audit, subscriptions, backups, code red, etc.).

2. **Default provider**
   - Set default `VITE_DATA_PROVIDER=supabase` for new deployments. Keep `firebase` as opt-in for rollback or legacy envs.

3. **Firebase**
   - Option A: Leave Firebase in codebase behind the provider; no Firestore reads/writes in production when provider is `supabase`.  
   - Option B: Remove Firebase dependencies and Firestore code paths once rollback is no longer required.

4. **Auth**
   - If Phase 1 kept Firebase Auth, complete move to Supabase Auth (or keep Firebase Auth as identity provider with token verification in Supabase). Remove Firebase Auth when no longer needed.

5. **Cloud Functions**
   - Harvest wallet Cloud Functions are already unused by client (replaced by Firestore batch path). Reimplement any required logic in Supabase (RPC or Edge Function) and remove Firebase Functions when appropriate.

**Exit criteria:** Production runs on Supabase with `VITE_DATA_PROVIDER=supabase`; Firebase is either unused or removed; auth and wallet logic live in Supabase.

---

## Summary table

| Phase | Focus | Firebase | Supabase |
|-------|--------|----------|----------|
| 0 | Client + env + migrations | Only backend | Schema + RLS + indexes applied |
| 1 | Auth | Optional keep | Profile/company for RLS |
| 2 | Low-risk reads | Rest of app | companies, projects, project_stages |
| 3 | Writes | Harvest, wallet, rest | expenses, work_logs, inventory_* |
| 4 | Harvest + wallet | Rest | harvest_*, wallet ledger/meta |
| 5 | Realtime | — | All listeners → Realtime |
| 6 | Decommission | Optional/removed | Single source of truth |

---

## Rollback

- Every phase keeps `VITE_DATA_PROVIDER=firebase` as a valid option. If issues appear with Supabase, set provider back to `firebase` and deploy; no schema or Firebase code should have been removed in Phases 0–5.
- Phase 6 rollback may require re-enabling Firebase code paths if they were removed; prefer keeping them behind the provider until fully confident.

---

*Used with `/docs/firebase-audit.md` and `/docs/supabase-mapping.md`.*
