# FarmVault Offline-First Audit (Firestore)

Audit date: 2026-02-21
Scope: Full offline-first readiness for Firestore-only flow
Constraint honored: Analysis only, no refactor/rewrite performed

## SECTION 1 - Firebase Initialization Issues

### Findings

1. Firestore initialization is in `src/lib/firebase.ts:35-46`.
2. Persistence is configured using:
   - `initializeFirestore(..., { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }) })`
   - Ref: `src/lib/firebase.ts:37-40`
3. Fallback strategy is:
   - Catch errors and use `getFirestore(app)`
   - Ref: `src/lib/firebase.ts:42-45`
4. `enableIndexedDbPersistence` is not used anywhere in `src/`.

### Why this blocks full offline-first

1. `persistentSingleTabManager()` limits behavior to a single-tab model.
2. If persistence init fails (multi-tab/precondition/browser support), fallback becomes plain `getFirestore(app)`.
3. That fallback path is non-persistent cache mode from your app perspective, so offline behavior is no longer guaranteed.
4. The downgrade is silent except a warning log (`src/lib/firebase.ts:44`), so UI keeps running while offline guarantees are reduced.

---

## SECTION 2 - Data Fetching Issues

### Core data hook behavior (`useCollection`)

File: `src/hooks/useCollection.ts:13-40`

1. Uses `getDocs(collection(db, path))` (fetch-once): `src/hooks/useCollection.ts:22`.
2. Uses polling (`refetchInterval`) instead of realtime listeners: `src/hooks/useCollection.ts:36`.
3. On errors, returns an empty array `[]`: `src/hooks/useCollection.ts:33`.

### Realtime listener usage check

1. `onSnapshot` appears only in connectivity probe:
   - `src/contexts/ConnectivityContext.tsx:79-85`
2. No domain collections are subscribed via realtime snapshot listeners.

### Fetch-once pages/services still used

Representative locations:

1. `src/pages/ProjectDetailsPage.tsx:49,69,84,99,114`
2. `src/pages/ProjectPlanningPage.tsx:43`
3. `src/pages/SettingsPage.tsx:46`
4. `src/pages/admin/AdminFeedbackPage.tsx:45`
5. `src/pages/admin/AdminCompaniesPage.tsx:56,66`
6. `src/hooks/useProjectStages.ts:17`
7. `src/services/operationsWorkCardService.ts:407,423,435,447,456`
8. `src/services/workLogService.ts:55`
9. `src/services/codeRedService.ts:71,88,100,138`
10. `src/services/backupService.ts:52,65,88,106`
11. `src/services/stageService.ts:51`
12. `src/services/platformExpenseService.ts:40`
13. `src/services/companyDataService.ts:58,85`

### Query/path issues impacting offline reliability

1. Potential wrong `useCollection` path:
   - `src/pages/EmployeesPage.tsx:60`
   - `useCollection<User>('users', 'employees-page-users')`
2. Potential wrong `useCollection` path:
   - `src/pages/HarvestSalesPage.tsx:52`
   - `useCollection<InventoryItem>('inventoryItems', 'harvest-inventory')`

If the collection path is wrong, offline cache can never be hydrated for that dataset.

### Complex query offline/index risk hotspots

1. `src/services/workLogService.ts:45-53`
   - Multiple `where` clauses including range + inequality.
2. `src/services/codeRedService.ts:82-87`
   - `where('companyId'=='...') + orderBy('updatedAt') + limit(...)`.
3. `src/services/codeRedService.ts:68-70`, `src/services/backupService.ts:84-87`, `src/services/platformExpenseService.ts:36-39`, `src/pages/admin/AdminFeedbackPage.tsx:41-44` use `orderBy` patterns.
4. Index definitions currently committed in `firestore.indexes.json` only show composite entries for:
   - `codeRed` (`firestore.indexes.json:4-21`)
   - `workLogs` (`firestore.indexes.json:23-52`)

### Why this blocks full offline-first

1. Fetch-once + polling does not deliver local-write metadata flow and robust offline synchronization semantics.
2. Returning `[]` on fetch error causes state wipe behavior under offline misses.
3. Incorrect paths prevent local cache warm-up entirely.
4. Complex queries depend on index availability and query shape stability.

---

## SECTION 3 - Timestamp Issues

### Widespread server timestamps

`serverTimestamp()` is used broadly across write paths in pages/services.

### Hotspots where UI may rely on unresolved server timestamps

1. Auth user mapping fallback to "now":
   - `src/contexts/AuthContext.tsx:69,92`
   - `createdAt: data.createdAt?.toDate ? ... : new Date()`
2. Dashboard transaction fallback to "now":
   - `src/pages/dashboard/CompanyDashboard.tsx:124,135`
   - `date: d || new Date()`
3. Inventory date conversion uses direct `new Date(...)` fallback:
   - `src/pages/InventoryPage.tsx:65-66,1808`
4. Work log expense description converts Firestore date using raw Date ctor:
   - `src/services/workLogService.ts:72`
   - `new Date(data.date).toLocaleDateString()`
5. Stage status derivation uses raw Date ctor:
   - `src/services/stageService.ts:11-12`
   - `new Date(stage.startDate/endDate)`

### Invalid Date / ordering risks

1. Raw `new Date(firestoreField)` can produce `Invalid Date` for non-standard values.
2. Fallback `|| new Date()` masks unresolved timestamp state as current time.
3. This can reorder recent items incorrectly and distort dashboard/summary views while offline.

---

## SECTION 4 - Wallet Architecture Issues

### Wallet-related docs/collections found

1. `harvestCashPools` - `src/services/harvestCollectionService.ts:24`
2. `harvestWallets` - `src/services/harvestCollectionService.ts:423,483,590,614`
3. `collectionCashUsage` - `src/services/harvestCollectionService.ts:424,484`
4. `harvestPaymentBatches` - `src/services/harvestCollectionService.ts:23,558`
5. No `projectWallet` collection found in `src/`.

### Where `remainingBalance` is stored/recalculated

1. Initialized/set in `registerHarvestCash`:
   - `src/services/harvestCollectionService.ts:366,379`
2. Recomputed in mirror helper:
   - `src/services/harvestCollectionService.ts:390-408`

### Where wallet values are stored/recalculated

1. Wallet totals/balance:
   - `currentBalance`, `cashPaidOutTotal`, `cashReceivedTotal`
   - Refs: `src/services/harvestCollectionService.ts:443-444,531-533,595-597,623-625,633-634`
2. Usage totals:
   - `totalDeducted`
   - Refs: `src/services/harvestCollectionService.ts:455,460-462,545,550-552`

### Transactions and dependency points

1. Transactions are used in:
   - `src/services/harvestCollectionService.ts:199,280,426,490,616`
2. Payment transactions require server-coordinated reads before writes:
   - `applyHarvestCashPayment`: reads at `:428,439`, writes at `:442-464`
   - `payPickersFromWalletBatchFirestore`: reads at `:492,502,525`, writes at `:531-574`
3. After each transaction, separate mirror write runs:
   - `src/services/harvestCollectionService.ts:469,578-580`

### Why wallet updates can fail/desync offline

1. Transaction-heavy wallet deduction/top-up flows are not robust for offline-first behavior.
2. Payment logic depends on read-before-write state (`currentBalance`, usage docs, picker docs).
3. Post-transaction mirror update is a second write boundary, so partial completion can desync wallet vs cash-pool fields.

---

## SECTION 5 - Harvest / Payment Flow Risks

### Trip harvest add flow

1. UI handler:
   - `handleAddWeigh` at `src/pages/HarvestCollectionsPage.tsx:579`
2. Optimistic local cache mutations:
   - `src/pages/HarvestCollectionsPage.tsx:589-621`
3. Backend save occurs after optimistic update:
   - `src/pages/HarvestCollectionsPage.tsx:633-639`
4. Service write chain:
   - Add weigh entry: `src/services/harvestCollectionService.ts:77-84`
   - Recalc picker totals: `src/services/harvestCollectionService.ts:90-107`
   - Recalc collection totals: `src/services/harvestCollectionService.ts:117-133`

Risk: multi-step derived updates, not one atomic offline-safe write path.

### Picker single-payment flow

1. Handler:
   - `handleMarkPickerPaid` at `src/pages/HarvestCollectionsPage.tsx:653`
2. Wallet deduction first:
   - `applyHarvestCashPayment(...)` at `src/pages/HarvestCollectionsPage.tsx:670-676`
3. Picker paid write second:
   - `markPickerCashPaid(...)` at `src/pages/HarvestCollectionsPage.tsx:699`

Risk: write-order dependency. If second write fails, wallet is deducted while picker remains unpaid.

### Picker batch-payment flow

1. Handler:
   - `handleMarkMultiplePaid` at `src/pages/HarvestCollectionsPage.tsx:714`
2. Optimistic paid flags first:
   - `src/pages/HarvestCollectionsPage.tsx:733-740`
3. Wallet batch transaction call:
   - `src/pages/HarvestCollectionsPage.tsx:743-749`
4. Non-wallet path:
   - `src/pages/HarvestCollectionsPage.tsx:770` notes UI-only update (no persisted write).

Risk: optimistic UI can diverge from persisted state; non-wallet branch currently not persisted.

### Buyer close/sync flow

1. UI closes via:
   - `setBuyerPriceAndMaybeClose` call at `src/pages/HarvestCollectionsPage.tsx:794-798`
2. Service pre-reads pickers outside transaction:
   - `src/services/harvestCollectionService.ts:193-197`
3. Then transaction updates collection and may create harvest/sale:
   - `src/services/harvestCollectionService.ts:199-270`
4. Backfill sync for already-closed docs:
   - `syncClosedCollectionToHarvestSale` called at `src/pages/HarvestCollectionsPage.tsx:263`
   - Service transaction at `src/services/harvestCollectionService.ts:280-329`

Risk: transaction dependency and pre-read/write split create offline fragility and race windows.

---

## SECTION 6 - What Must Change (Minimal Changes Only)

1. Make Firestore persistence deterministic in `src/lib/firebase.ts` so normal app mode does not silently degrade to non-persistent behavior.
2. Move operational data reads from fetch-once/polling to snapshot listeners (`onSnapshot`) in critical collections.
3. In `useCollection`, stop returning `[]` on errors; preserve last known state to avoid offline state wipe.
4. Replace raw `new Date(firestoreField)` and `|| new Date()` fallbacks in critical logic with one safe timestamp conversion path.
5. Remove transaction-only dependency for wallet payment/top-up flows that must work offline.
6. Collapse dependent wallet/payment writes into one consistent persisted path per action (deduction + paid flag + usage updates).
7. Persist the current non-wallet batch paid branch (`src/pages/HarvestCollectionsPage.tsx:770`) instead of UI-only updates.
8. Reduce duplicated stored aggregates (`remainingBalance`, `currentBalance`, `totalPaidOut`, `totalDeducted`, `totalHarvestKg`, `totalPickerCost`, `profit`) that are updated in multiple places and can desync offline.

---

## Appendix - Metadata/Offline UI Behavior Check

1. `includeMetadataChanges` used only in connectivity probe:
   - `src/contexts/ConnectivityContext.tsx:81`
2. `hasPendingWrites` used only in connectivity context:
   - `src/contexts/ConnectivityContext.tsx:21,32,83,96,103`
3. `fromCache` used only in connectivity context:
   - `src/contexts/ConnectivityContext.tsx:22,33,84,104`
4. Domain pages do not consume per-query snapshot metadata for offline state handling.
5. Status components are global only:
   - `src/components/status/OfflineSyncBanner.tsx`
   - `src/components/status/ConnectivityStatusPill.tsx`

Conclusion: offline/sync state is detected globally, but not integrated into domain data rendering logic.
