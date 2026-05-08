# FarmVault Offline-First Architecture

> Date: 2026-05-08 | Status: In Progress

---

## Phase 1 — System Audit

### Module Offline Classification

| Module | Supabase Tables | Write Freq | Realtime Deps | Offline Criticality | Classification |
|--------|----------------|------------|---------------|---------------------|----------------|
| **Dashboard** | profiles, company_members, project summaries | Low | Yes (subscription) | Low | Online-only |
| **Projects** | projects, project_stages, project_blocks | Low | No | Medium | Partial Offline |
| **FarmWork / Operations** | work_logs, ops.operation_work_cards | Medium | No | High | Full Offline |
| **Expenses** | finance.expenses, budget_pools | Medium | No | High | Full Offline |
| **Notes / Records** | company_records, stage_notes | Low | No | Medium | Partial Offline |
| **Harvest (Fallback)** | harvest.fallback_harvest_sessions, fallback_session_pickers, fallback_session_picker_logs, fallback_market_dispatches, fallback_market_sales_entries, fallback_market_expense_lines | Very High | Yes (realtime logs) | Critical | **Full Offline** |
| **Harvest (French Beans)** | harvest.harvest_collections, harvest_pickers, picker_intake_entries, picker_payment_entries | Very High | Yes | Critical | **Full Offline** |
| **Harvest (Tomato)** | harvest.tomato_harvest_sessions, tomato_market_dispatches | Medium | Yes | High | Full Offline |
| **Supplies / Inventory** | inventory_items, inventory_purchases, inventory_usage | Medium | No | High | Partial Offline |
| **Employees** | employees | Low | No | Medium | Partial Offline |
| **Reports** | Reads from all tables | Low (reads) | No | Low | Online-only |
| **Support / Feedback** | feedback | Low | No | Low | Online-only |
| **Billing** | company_subscriptions, subscription_payments | Very Low | Yes | N/A | Online-only |

---

### Conflict Risk Assessment

| Module | Conflict Risk | Strategy |
|--------|--------------|----------|
| Harvest intake logs | Low — append-only weigh entries | Last-write-wins, client_entry_id dedup |
| Harvest sessions | Low — one manager creates session | Last-write-wins |
| Expenses | Medium — multi-user edits | Last-write-wins on updated_at |
| Projects | Low — manager only | Last-write-wins |
| Inventory | Medium — stock quantities | Sum-based merge (future) |
| FarmWork logs | Low — per-employee append | Last-write-wins |

---

### Existing Offline Infrastructure (Pre-Implementation)

Two separate Dexie databases existed before this redesign — a problem to be consolidated:

**DB 1: `farmvault_offline`** (src/lib/offlineQueue.ts)
- Tables: `offline_queue`
- Types: `intake | payment | wallet_entry`
- Scope: Harvest-only, legacy, to be deprecated

**DB 2: `farmvault_local_data`** (src/lib/localData/indexedDb.ts)
- Tables: farms, projects, harvests, farm_work_logs, inventory, employees, suppliers, expenses, notes, sync_queue, session_cache
- Action types: ADD/UPDATE for all above entities
- Scope: General — the correct foundation

**Decision**: Extend DB 2 (`farmvault_local_data`) as the single unified local store. DB 1 (`farmvault_offline`) is deprecated — its harvest queue types are subsumed into the new action types system.

---

## Phase 2 — Data Architecture

### Dexie Schema (farmvault_local_data)

```
Version 1 (existing):
  farms, projects, harvests, farm_work_logs, inventory,
  employees, suppliers, expenses, notes, sync_queue, session_cache

Version 2 (this iteration):
  + harvest_sessions        — fallback/tomato/fb session records
  + harvest_session_pickers — pickers assigned to a session
  + harvest_picker_logs     — per-picker weigh/intake entries (high frequency)
  + harvest_dispatches      — market dispatches per session
  + harvest_sales           — sales entries per dispatch
  + harvest_expense_lines   — expense lines per dispatch
  + failed_syncs            — permanent failure log for user visibility
  + drafts                  — multi-step form drafts
```

### Required Sync Metadata on Every Offline-Capable Record

```typescript
interface LocalEntityRow {
  id: string;
  company_id: string;
  created_at: string;
  updated_at: string;
  sync_status: 'pending' | 'synced' | 'failed';
  last_synced_at?: string;      // when Supabase last confirmed this row
  offline_created?: boolean;    // true = row created while offline
  device_id?: string;           // origin device for conflict tracing
  deleted_at?: string | null;   // soft-delete support
  data: Record<string, unknown>;
}
```

### Sync Action Types

```
General:   ADD/UPDATE/DELETE for farms, projects, expenses, inventory,
           employees, suppliers, notes, farm_work_logs

Harvest:   ADD_HARVEST_SESSION, UPDATE_HARVEST_SESSION,
           ADD_HARVEST_SESSION_PICKER, REMOVE_HARVEST_SESSION_PICKER,
           ADD_HARVEST_PICKER_LOG,
           ADD_HARVEST_DISPATCH, UPDATE_HARVEST_DISPATCH,
           ADD_HARVEST_SALE, UPDATE_HARVEST_SALE,
           ADD_HARVEST_EXPENSE_LINE, DELETE_HARVEST_EXPENSE_LINE
```

---

## Phase 3 — Repository Layer

### Architecture

```
src/lib/repositories/
  BaseRepository.ts              — abstract CRUD + queue helpers
  HarvestSessionRepository.ts   — fallback/tomato sessions
  HarvestPickerRepository.ts    — session pickers
  HarvestPickerLogRepository.ts — picker weigh entries
  FallbackHarvestRepository.ts  — facade over the three above
  index.ts                      — public exports
```

### Repository Contract

```typescript
interface IRepository<T> {
  // Always reads from local DB — never Supabase
  list(companyId: string, filters?: Record<string, unknown>): Promise<T[]>;
  get(id: string): Promise<T | undefined>;

  // Writes local-first, queues sync, triggers background flush
  create(payload: Omit<T, 'id'> & { id?: string }): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  softDelete(id: string, companyId: string): Promise<void>;

  // Pull remote rows into local store (called on mount / reconnect)
  pullRemote(companyId: string, filters?: Record<string, unknown>): Promise<void>;
}
```

### Rules
- Repositories NEVER expose Supabase to callers.
- One repository per entity domain (not per Supabase table).
- The sync engine is the ONLY place that talks to Supabase for writes.
- React components call repositories; repositories call local DB + sync queue.

---

## Phase 4 — Sync Engine

### File Structure

```
src/lib/sync/
  syncManager.ts       — top-level orchestrator, exposed to the app
  queueProcessor.ts    — replays LocalSyncQueueRow items to Supabase
  retryManager.ts      — exponential backoff + jitter scheduling
  conflictResolver.ts  — last-write-wins + extensible strategies
  handlers/
    harvestHandlers.ts   — ADD_HARVEST_SESSION, ADD_HARVEST_PICKER_LOG, etc.
    expenseHandlers.ts   — re-export from existing syncEngine
    farmHandlers.ts      — re-export from existing syncEngine
```

### Sync Flow

```
User action
  → Repository.create()
    → Write to Dexie (sync_status: 'pending', offline_created: !online)
    → enqueueLocalSync({ action_type, table_name, payload, idempotency_key })
    → if online: syncManager.flush(companyId)  [non-blocking]
    → return optimistic local row immediately

syncManager.flush()
  → if already running: no-op
  → getPendingLocalSyncQueue(companyId)
  → for each item: queueProcessor.processOne(item)
    → success: markQueueItemDone(), update entity sync_status = 'synced', last_synced_at = now
    → unique violation: treat as success (idempotent)
    → retryable error: markQueueItemFailed(willRetry: true), retryManager schedules next attempt
    → permanent error: markQueueItemFailed(willRetry: false), write to failed_syncs table
  → emit LOCAL_SYNC_STATE_EVENT
```

### Conflict Resolution

Initial strategy: **Last-Write-Wins on `updated_at`**

```typescript
function shouldApplyRemote(local: LocalEntityRow, remoteUpdatedAt: string): boolean {
  if (!local) return true;
  if (local.sync_status === 'pending') return false; // local has unsynced edits
  return new Date(remoteUpdatedAt) >= new Date(local.updated_at);
}
```

Future: field-level merge for inventory quantities.

### Sync Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Written locally, not yet synced |
| `syncing` | Currently being sent to Supabase |
| `synced` | Confirmed by Supabase |
| `failed` | Failed after max retries — user action required |
| `conflict` | Remote changed while pending (future) |

---

## Phase 5 — Connectivity System

### Files

```
src/lib/sync/connectivityManager.ts   — singleton, detects online/offline/reconnect
src/hooks/useConnectivity.ts          — React hook for components
src/components/sync/OfflineBanner.tsx — full-width offline indicator
src/components/sync/SyncIndicator.tsx — icon/badge showing sync state
```

### ConnectivityManager responsibilities
- Track `navigator.onLine`
- Detect reconnect (online after offline) → trigger `syncManager.flush()`
- Expose: `isOnline`, `isSyncing`, `pendingCount`, `failedCount`
- Emit: `farmvault:connectivity-changed` DOM event

### UI Communication Rules
- **Offline**: Red banner "You're offline — changes will sync when reconnected"
- **Syncing**: Spinner icon "Syncing..."
- **Synced**: Green checkmark (auto-dismiss after 3s)
- **Failed**: Amber badge with count + "Tap to retry"

---

## Phase 6 — Harvest Module (First Conversion)

### Target: Fallback Harvest System

Chosen because:
- Generic (any crop type)
- Highest write frequency (picker logs per weigh-in)
- Append-only logs — lowest conflict risk
- Operationally critical in the field

### Offline Operations Supported

| Operation | Local Table | Action Type | Supabase Target |
|-----------|-------------|-------------|-----------------|
| Create session | harvest_sessions | ADD_HARVEST_SESSION | harvest.fallback_harvest_sessions |
| Update session | harvest_sessions | UPDATE_HARVEST_SESSION | harvest.fallback_harvest_sessions |
| Add picker | harvest_session_pickers | ADD_HARVEST_SESSION_PICKER | harvest.fallback_session_pickers |
| Remove picker | harvest_session_pickers | REMOVE_HARVEST_SESSION_PICKER | harvest.fallback_session_pickers |
| Record picker log (weigh) | harvest_picker_logs | ADD_HARVEST_PICKER_LOG | harvest.fallback_session_picker_logs |
| Create dispatch | harvest_dispatches | ADD_HARVEST_DISPATCH | harvest.fallback_market_dispatches |
| Add sale entry | harvest_sales | ADD_HARVEST_SALE | harvest.fallback_market_sales_entries |
| Add expense line | harvest_expense_lines | ADD_HARVEST_EXPENSE_LINE | harvest.fallback_market_expense_lines |

### Data Flow After Conversion

```
FallbackHarvestSessionDetailPage
  → useFallbackSession(sessionId)   [reads from LOCAL Dexie]
  → FallbackHarvestRepository.recordPickerLog(...)
      → write to harvest_picker_logs (instant)
      → enqueueLocalSync(ADD_HARVEST_PICKER_LOG)
      → flush sync (non-blocking)
      → return optimistic row
  → UI updates immediately, no spinner
```

---

## Architectural Rules (Enforced)

1. **No Supabase in components** — components call repositories or hooks only
2. **No duplicate sync logic** — `syncManager` is the single sync authority
3. **No online/offline code paths in pages** — pages are always "local-first"
4. **All writes go local first** — even when online
5. **Repositories own the local DB** — nothing else touches Dexie tables directly
6. **Idempotency keys on every queue item** — prevents double-sync on retry
7. **Soft deletes only** — `deleted_at` set, never hard-delete locally
8. **Device ID stamped on offline-created rows** — aids conflict tracing
