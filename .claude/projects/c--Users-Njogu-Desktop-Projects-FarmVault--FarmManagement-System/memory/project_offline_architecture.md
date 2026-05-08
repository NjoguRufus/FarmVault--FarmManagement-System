---
name: Offline-First Architecture Implementation
description: Status and key decisions from the offline-first architecture redesign started 2026-05-08
type: project
---

FarmVault is being migrated to a full offline-first architecture (UI → Local State → Dexie → Sync Engine → Supabase).

**Why:** Supabase should no longer be the primary runtime datastore. Dexie (IndexedDB) becomes the operational source of truth. Components must never call Supabase directly.

**What was done:**

- `docs/OFFLINE_ARCHITECTURE.md` — comprehensive audit + design document
- `src/lib/localData/types.ts` — added `LocalSyncStatus: 'conflict'`, extended `LocalEntityRow` with `last_synced_at`, `offline_created`, `device_id`, `deleted_at`. Added 11 new `LocalActionType` values for harvest sub-ops.
- `src/lib/localData/indexedDb.ts` — upgraded DB from v1 to v2, added: `harvest_sessions`, `harvest_session_pickers`, `harvest_picker_logs`, `harvest_dispatches`, `harvest_sales`, `harvest_expense_lines`, `failed_syncs`, `drafts` tables.
- `src/lib/localData/entityRepository.ts` — added `device_id`, `offline_created` to `buildLocalRow`, added `listEntitiesBySession`, `listEntitiesByDispatch`, `softDeleteEntity`, `writeFailedSync`, `listFailedSyncs`, `clearFailedSync`, `saveDraft`, `getDraft`, `deleteDraft`, `markEntitySynced`.
- `src/lib/repositories/` — new repository layer: `BaseRepository`, `HarvestSessionRepository`, `HarvestPickerRepository`, `HarvestPickerLogRepository`, `FallbackHarvestRepository` (facade + singleton factory).
- `src/lib/sync/harvestSyncHandlers.ts` — Supabase handlers for all 11 harvest action types.
- `src/lib/sync/conflictResolver.ts` — last-write-wins strategy.
- `src/lib/sync/retryManager.ts` — exponential backoff with jitter.
- `src/lib/sync/connectivityManager.ts` — singleton, drives sync on reconnect, async counts for pending/failed.
- `src/lib/localData/syncEngine.ts` — wired in `harvestSyncHandlers`, writes permanent failures to `failed_syncs`.
- `src/hooks/useConnectivity.ts` — `useConnectivity(companyId)` and `useIsOnline()`.
- `src/hooks/useFallbackHarvestRepository.ts` — `useFallbackSessionsLocal()` and `useFallbackSessionDetail()` local-first hooks.
- `src/components/sync/OfflineBanner.tsx` — amber banner when offline.
- `src/components/sync/SyncStatusIndicator.tsx` — icon/label showing offline/syncing/synced/failed states.
- `FallbackHarvestListPage.tsx` — sessions now read from Dexie via `useFallbackSessionsLocal`. Session create goes through `FallbackHarvestRepository`.
- `FallbackHarvestSessionDetailPage.tsx` — pickers and picker logs read from Dexie; `addPicker` and `recordPickerLog` go through repository (instant, offline-safe).

**How to apply:** Any future module conversion should follow the same pattern: create repository files in `src/lib/repositories/`, add action types in `types.ts`, add handlers in a `*SyncHandlers.ts` file, wire into `syncEngine.ts`, create local-first hooks, update pages to use hooks instead of services.

**Modules still using direct Supabase (not yet converted):**
- French beans harvest (harvestCollectionsService)
- Tomato harvest
- Expenses (partial — some already in syncEngine)
- Operations/FarmWork (partial)
- Inventory (partial)
- Notes, Projects, Farms, Employees, Suppliers (partial — in syncEngine but pages may still call services directly)
