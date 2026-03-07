# FarmVault Zero-Operational-Downtime Resilience Architecture

## Goal

Farm work continues when:

- Clerk authentication fails or is slow
- Internet goes offline
- Supabase is slow or temporarily unavailable

## Modes

| Mode | When | Behaviour |
|------|------|-----------|
| **Normal** | Clerk + Supabase + online | Full auth, real-time sync |
| **Emergency Access** | Clerk unavailable; env-gated | Local session, limited routes, banner |
| **Offline Field** | No network or Supabase errors | Local-first: write to IndexedDB, sync when online |

---

## Architecture Chosen

- **Auth**: Clerk when available; on load failure → `ClerkLoadErrorBoundary` shows fallback UI with link to `/emergency-access`. Sign-in does not depend on employee/company bootstrap (AuthContext timeout unblocks UI).
- **Emergency Access**: Env-gated (`VITE_EMERGENCY_ACCESS`), approved email only (`VITE_EMERGENCY_EMAIL`), limited routes; session in `localStorage`; banner in `MainLayout`.
- **Offline**: IndexedDB (Dexie) queue for intake, payment, wallet_entry; `syncQueue()` replays to Supabase on load, on `online`, and on manual sync. Duplicate protection via `client_entry_id` (local UUID) and `created_by` in payload.
- **UX**: No blocking spinners before moving to next picker; local save is instant (queue or try/catch → queue on failure); sync runs in background.

---

## Files / Modules

### Added

| File | Purpose |
|------|---------|
| `src/config/emergencyAccess.ts` | Emergency access feature flag and allowed route prefixes |

### Modified

| File | Purpose |
|------|---------|
| `src/components/auth/ClerkLoadErrorBoundary.tsx` | Explicit `failed_to_load_clerk_js` (and related) detection; fallback UI with `/emergency-access` link; `data-farmvault-fallback` for tests |
| `src/components/layout/MainLayout.tsx` | Uses `EMERGENCY_ALLOWED_PREFIXES` from config; emergency banner |
| `src/pages/Auth/EmergencyAccessPage.tsx` | Uses `isEmergencyAccessEnabled` from config |
| `src/pages/Auth/SignInPage.tsx` | Uses `isEmergencyAccessEnabled` from config; “Use emergency access” link |
| `src/lib/offlineQueue.ts` | Types `intake` \| `payment` \| `wallet_entry`; `created_by`, `sync_status`; `markItemSyncFailed`; Dexie v2 schema |
| `src/services/offlineQueueSync.ts` | Handler for `wallet_entry` (credit/debit); uses `ensureProjectWalletForSync` and `insertWalletLedgerEntry` |
| `src/services/harvestCollectionsService.ts` | Try/catch fallback to queue for intake/payment; `registerHarvestCash` queues on offline or error; exports `ensureProjectWalletForSync`, `insertWalletLedgerEntry` |
| `src/contexts/ConnectivityContext.tsx` | `pendingCount`, `lastSyncFailed`, status `sync_failed`; refresh on queue change and after sync |
| `src/components/status/ConnectivityStatusPill.tsx` | Labels: Online, Offline Mode, Syncing…, Pending count, Sync failed; click to retry |
| `src/components/status/OfflineSyncBanner.tsx` | Offline / Syncing / Sync failed (with Retry) / Pending count |

---

## Offline Queue Schema (IndexedDB via Dexie)

**Database:** `farmvault_offline`  
**Table:** `offline_queue`

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Local UUID (`client_entry_id`); duplicate key for Supabase |
| `type` | `'intake' \| 'payment' \| 'wallet_entry'` | Operation type |
| `payload` | object | Type-specific payload; always includes `client_entry_id`, `created_by` when set |
| `created_at` | number | Timestamp (ms) |
| `created_by` | string? | User id for audit; duplicate protection |
| `synced` | boolean | false = pending or failed (retry on next sync) |
| `sync_status` | `'pending' \| 'synced' \| 'failed'`? | Set to `failed` when sync throws; item stays for retry |

**Payload shapes:**

- **intake:** `client_entry_id`, `collection_id`, `picker_id`, `kg`, `unit`, `recorded_by`, `company_id`, …
- **payment:** `client_entry_id`, `collection_id`, `picker_id`, `amount`, `note`, `paid_by`, `company_id`, `project_id`, …
- **wallet_entry:** `client_entry_id`, `company_id`, `project_id`, `entry_type` ('credit'|'debit'), `amount`, `note`, `ref_type`, `ref_id`, `created_by`

---

## Sync Algorithm

1. **Triggers:** App load (when online), `window` `online` event, manual “Sync” / “Retry” in UI.
2. **Process:** `syncQueue()` in `src/lib/offlineQueue.ts`:
   - If already syncing, return `{ synced: 0, failed: 0 }`.
   - Set `syncing = true`; notify queue change.
   - Load all unsynced items (`synced === 0`), ordered by `created_at`.
   - For each item: call `processOfflineQueue(item)` (intake → `picker_intake_entries` or RPC; payment → `picker_payment_entries` + expense sync; wallet_entry → `ensureProjectWallet` + `project_wallet_ledger` insert). On success: delete item and notify. On failure: call `markItemSyncFailed(id)` (set `sync_status = 'failed'`), increment `failed`, keep item for next run.
   - Set `syncing = false`; notify queue change.
   - Return `{ synced, failed }`.
3. **Duplicate protection:** Inserts use `client_entry_id` where supported; payload includes `created_by`; no duplicate writes on retry (same id used once).

---

## Emergency Access Flow

1. **Enable:** Set `VITE_EMERGENCY_ACCESS=true`, `VITE_EMERGENCY_EMAIL`, `VITE_EMERGENCY_USER_ID`, `VITE_EMERGENCY_COMPANY_ID` (and optionally `VITE_EMERGENCY_ROLE`) in `.env`.
2. **Clerk fails:** User sees Clerk fallback UI or hits “Sign-in not loading? Use emergency access” → navigates to `/emergency-access`.
3. **Emergency page:** User enters approved email (and optional secret); if email matches `VITE_EMERGENCY_EMAIL`, `createEmergencySession()` writes session to `localStorage` and dispatches `farmvault:emergency-session-created`.
4. **AuthContext:** Listens for event; sets user from `readEmergencySession()`, `isEmergencySession = true`, permissions from config role.
5. **MainLayout:** If `isEmergencySession`, only routes in `EMERGENCY_ALLOWED_PREFIXES` are allowed (`/dashboard`, `/projects`, `/harvest-collections`, `/expenses`); others redirect to `/dashboard`. Banner: “Emergency Access Mode Active — limited to …”.
6. **Disable:** Set `VITE_EMERGENCY_ACCESS=false` and rebuild; emergency route and session checks no longer allow access.

---

## Rollout Order

1. **Clerk hardening** — Error boundary, fallback link, sign-in not blocked by bootstrap. (Already in place; strengthened detection.)
2. **Emergency Access** — Config module, env-gated, limited routes, banner. (Already in place; centralized config.)
3. **Offline queue** — Schema (intake, payment, wallet_entry; `created_by`, `sync_status`), `syncQueue()` and `processOfflineQueue()`, run on load + online + manual. (Extended with wallet_entry and failure handling.)
4. **Harvest service** — Try/catch for intake/payment/registerHarvestCash; on failure or offline, add to queue and return so UX is non-blocking. (Done.)
5. **ConnectivityContext** — `pendingCount`, `lastSyncFailed`, status `sync_failed`. (Done.)
6. **UI status** — ConnectivityStatusPill and OfflineSyncBanner show Online, Offline Mode, Syncing, Pending Sync Count, Sync Failed + Retry. (Done.)

---

## Operational UX (Critical Workflows)

- **Quick Intake / Quick Pay:** Each add/pay call tries Supabase; on error or offline, appends to queue and returns immediately (local UUID returned). No blocking spinners before moving to next picker; sync runs in background.
- **Harvest Cash Wallet:** `registerHarvestCash` queues on offline or insert error; same instant-return behaviour.
- **Sync:** Runs on load, when connection returns, and on manual Retry; failed items stay in queue and are retried on next run.
