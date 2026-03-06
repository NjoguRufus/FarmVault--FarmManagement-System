# Firebase Inventory & Data Flow Report — FarmVault

**Purpose:** Full audit of Firebase usage before Supabase migration. Read-only analysis; no behavior changes.

---

## Executive Summary

| Metric | Count |
|--------|--------|
| **Total Firebase call sites (src + functions)** | ~250+ (reads/writes/queries across 55+ files) |
| **Collections found** | 42 top-level + 2 subcollections (codeRed/messages, developerBackups/snapshots) |
| **Cloud Functions** | 3 (HTTPS callable; client uses Firestore-only path for wallet batch pay) |
| **Firebase products in use** | Auth, Firestore, Storage (rules only; no client uploads found), Cloud Functions; Analytics initialized but no logEvent call sites |
| **Realtime listeners (onSnapshot)** | 6+ (useCollection, activityLogs, cropCatalog, projectWallet, subscriptionPayments, ConnectivityContext) |

### Top 5 billing / performance risk patterns

1. **Realtime listeners without strict limits** — `useCollection` and activity/projectWallet/subscription listeners can subscribe to large sets when `limitCount` is omitted or high; company-scoped `where('companyId', '==', id)` limits scope but large companies can still have many docs.
2. **Unbounded admin/backup reads** — `backupService` and Admin Migration read full collections per company; `getDocs(collection(db, collName))` in subscription analytics with only status/date filters can scan many subscriptionPayments.
3. **Multiple queries per feature load** — Several features (e.g. harvest collections, records) do multiple getDocs/getDoc in sequence instead of a single batched query where possible.
4. **Duplicate or fallback queries in records** — `recordsService` runs primary query with orderBy and a fallback without orderBy when index may be missing, doubling read cost on failure path.
5. **Storage rules temporary allow-all** — `storage.rules` allows read/write until a fixed date (2026-03-12); no Firebase Storage upload/download in app code found, but bucket is open until then.

---

## 1. Firebase footprint (index)

### 1.1 Initialization & config

| File path | Firebase product | What it does |
|-----------|------------------|--------------|
| `src/lib/firebase.ts` | App, Auth, Firestore, Analytics | Single `initializeApp`; Firestore with persistent cache (multi-tab or single-tab fallback); `getAuth(app)`; lazy `getAnalytics` when supported. Secondary app `EmployeeCreate` for `authEmployeeCreate` so creating employees doesn’t log out current user. |
| `firebase.json` | Firestore, Storage, Database, Functions, Data Connect, Emulators | Project config: Firestore rules/indexes, Storage rules, Realtime DB rules, two function codebases (`default`, `farmvaultco`), dataconnect source, emulators. |
| `functions/src/index.ts` | Cloud Functions, Admin Firestore | `admin.initializeApp()`; `admin.firestore()`; three HTTPS callables: `addHarvestWalletCash`, `payPickerFromWallet`, `payPickersFromWalletBatch`. |

### 1.2 Auth

| File path | Firebase product | What it does |
|-----------|------------------|--------------|
| `src/contexts/AuthContext.tsx` | Auth, Firestore | `onAuthStateChanged`; `signInWithEmailAndPassword`, `signOut`; reads `users/{uid}` and optionally `employees` by `authUserId`; writes `users` on login/signup; session in React state + localStorage cache key `farmvault:auth:user:v1`. |
| `src/services/authService.ts` | Auth | `createUserWithEmailAndPassword` (from `firebase/auth`). |
| `src/pages/EmployeesPage.tsx` | Auth, Firestore | Uses `authEmployeeCreate` + `createUserWithEmailAndPassword` for new employee; `setDoc(users)`, `setDoc(employees)`. |

### 1.3 Firestore (by file)

| File path | Firebase product | What it does |
|-----------|------------------|--------------|
| `src/contexts/AuthContext.tsx` | Firestore | getDoc users, getDocs employees (by authUserId); setDoc users. |
| `src/contexts/ConnectivityContext.tsx` | Firestore | onSnapshot projects (limit(1), optional companyId filter) to detect connectivity. |
| `src/hooks/useCollection.ts` | Firestore | Generic onSnapshot over a collection with optional companyId/projectId/orderBy/limit; getDocsFromCache fallback. |
| `src/hooks/useAdminSubscriptionPayments.ts` | Firestore | onSnapshot subscriptionPayments with filters (status, billingMode, plan, date range), limit(PAGE_SIZE). |
| `src/services/activityLogService.ts` | Firestore | addDoc activityLogs; onSnapshot activityLogs (companyId, optional projectId, orderBy createdAt desc). |
| `src/services/auditLogService.ts` | Firestore | getDocs auditLogs (optional companyId); addDoc auditLogs. |
| `src/services/backupService.ts` | Firestore | getDoc companies; getDocs per COMPANY_COLLECTIONS; addDoc developerBackups/{companyId}/snapshots; getDocs snapshots. |
| `src/services/budgetPoolService.ts` | Firestore | addDoc budgetPools; getDocs budgetPools (companyId, orderBy createdAt desc); updateDoc budgetPools. |
| `src/services/challengeTemplatesService.ts` | Firestore | setDoc challengeTemplates; getDocs (companyId, cropType, phase, orderBy createdAt desc). |
| `src/services/codeRedService.ts` | Firestore | addDoc codeRed; getDocs codeRed (companyId or global, orderBy updatedAt desc, limit); addDoc codeRed/{id}/messages; setDoc codeRed; getDocs messages; getDoc codeRed. |
| `src/services/companyDataService.ts` | Firestore | getDocs projects/expenses/etc. by companyId+projectId; writeBatch delete project and related docs (projectStages, workLogs, expenses, etc.); getDocs by companyId for deleteAllCompanyData. |
| `src/services/companyService.ts` | Firestore | getDoc/getDocs companies; updateDoc companies; addDoc companies; setDoc users (companyId, role, etc.). |
| `src/services/cropCatalogService.ts` | Firestore | onSnapshot cropCatalog (companyId); addDoc/updateDoc cropCatalog. |
| `src/services/expenseBudgetService.ts` | Firestore | getDoc projects (with getDocFromCache fallback); updateDoc project budget. |
| `src/services/harvestCollectionService.ts` | Firestore | addDoc harvestCollections, harvestPickers, pickerWeighEntries; getDoc/updateDoc harvestCollections; getDocs pickerWeighEntries/pickers; writeBatch harvestPaymentBatches + update pickers; addDoc harvests/sales/expenses; payPickersFromWalletBatchFirestore (client-side batch). |
| `src/services/inventoryAuditLogService.ts` | Firestore | addDoc inventoryAuditLogs; getDocs inventoryAuditLogs (companyId, optional filters, limit). |
| `src/services/inventoryService.ts` | Firestore | updateDoc inventoryItems; addDoc inventoryPurchases, inventoryUsage; getDoc inventoryItems. |
| `src/services/platformExpenseService.ts` | Firestore | getDocs/addDoc/updateDoc/deleteDoc platformExpenses (developer). |
| `src/services/projectBlockService.ts` | Firestore | addDoc projectBlocks; getDocs projectBlocks (companyId, projectId, orderBy createdAt asc). |
| `src/services/projectWalletService.ts` | Firestore | onSnapshot projectWalletLedger (companyId, projectId); getDocs ledger + legacy harvestWallets; addDoc projectWalletLedger; getDoc projectWalletMeta; setDoc meta; runTransaction for migrate. |
| `src/services/recordsService.ts` | Firestore | getDoc/addDoc/updateDoc/deleteDoc records_library, company_records; getDocs company_record_shares; getDocs crops; paginated queries with orderBy(createdAt desc) + fallback without orderBy; writeBatch for purge; setDoc crops. |
| `src/services/stageNotesService.ts` | Firestore | addDoc stageNotes; getDocs stageNotes (companyId, projectId, stageId, orderBy createdAt desc, limit). |
| `src/services/stageService.ts` | Firestore | getDocsWithCache projectStages (companyId, projectId, cropType). |
| `src/services/subscriptionPaymentService.ts` | Firestore | getDocs subscriptionPayments (companyId, status pending, createdAt >= cutoff); addDoc subscriptionPayments; getDoc companies; setDoc companySubscriptions; updateDoc subscriptionPayments. |
| `src/services/subscriptionAdminService.ts` | Firestore | addDoc developerActionsLog; getDoc/setDoc/updateDoc companySubscriptions. |
| `src/services/subscriptionAnalyticsService.ts` | Firestore | getDocs subscriptionPayments (status approved, date range); getDocs companySubscriptions, companies. |
| `src/services/workLogService.ts` | Firestore | addDoc workLogs; getDocs workLogs (companyId, projectId, date range, ratePerPerson > 0, paid != true); writeBatch update workLogs + addDoc expenses. |
| `src/services/operationsWorkCardService.ts` | Firestore | getDocs operationsWorkCards (companyId, allocatedManagerId or projectId); addDoc/updateDoc operationsWorkCards. |
| `src/pages/*.tsx` (multiple) | Firestore | Various: getDoc(SettingsPage companies); addDoc/updateDoc (Expenses, Operations, HarvestSales, Feedback, BrokerExpenses, SeasonChallenges, Inventory, Suppliers, CropStages, Employees, ManagerOperations, ProjectPlanning, NewProjectForm); getDocs (BillingPage subscriptionPayments; AdminFeedbackPage feedback; AdminCompaniesPage projects/employees); writeBatch (ExpensesPage, InventoryPage). |
| `src/components/projects/NewProjectForm.tsx` | Firestore | addDoc projects, projectStages, seasonChallenges; updateDoc projects. |
| `src/components/projects/StageEditModal.tsx` | Firestore | addDoc/updateDoc projectStages. |
| `src/lib/firestoreCache.ts` | Firestore | getDoc/getDocs with getDocFromCache/getDocsFromCache fallback for offline. |
| `src/onboarding/TourProvider.tsx` | Firestore | getDoc users (for tour state). |
| `src/pages/dashboard/ManagerDashboard.tsx` | Firestore | updateDoc workLogs. |
| `src/pages/dashboard/DriverDashboard.tsx` | Firestore | updateDoc deliveries. |
| `src/pages/admin/AdminMigrationPage.tsx` | Firestore | getDocs with limit per collection; getDoc by id. |

### 1.4 Storage

| File path | Firebase product | What it does |
|-----------|------------------|--------------|
| `storage.rules` | Storage | Rules only: allow read, write for all paths until `request.time < timestamp.date(2026, 3, 12)`. No `getStorage`, `uploadBytes`, or `getDownloadURL` in `src/`; no client Storage usage found. |

### 1.5 Cloud Functions

| File path | Firebase product | What it does |
|-----------|------------------|--------------|
| `functions/src/index.ts` | Cloud Functions (Auth, Firestore Admin) | `addHarvestWalletCash`: top-up harvest wallet (transaction). `payPickerFromWallet`: deduct wallet, update collectionCashUsage, write harvestWalletPayments. `payPickersFromWalletBatch`: batch deduct wallet, update collectionCashUsage, create harvestPaymentBatches, mark pickers paid. Client currently uses `payPickersFromWalletBatchFirestore` in harvestCollectionService (client-side Firestore writes) instead of calling this function. |

### 1.6 Analytics / Messaging / Maps

| File path | Firebase product | What it does |
|-----------|------------------|--------------|
| `src/lib/firebase.ts` | Analytics | `getAnalytics(app)` when supported; exported as `analyticsPromise`. No `logEvent` call sites in repo. |
| — | Messaging | Not used (no getMessaging, getToken, onMessage). |
| — | Maps | Not used. |

### 1.7 Environment variables

| Variable | Where used | Purpose |
|----------|------------|---------|
| `VITE_FIREBASE_API_KEY` | `src/lib/firebase.ts` (firebaseConfig) | Firebase Web API key. |
| `VITE_FIREBASE_AUTH_DOMAIN` | Same | Auth domain. |
| `VITE_FIREBASE_PROJECT_ID` | Same | Project ID. |
| `VITE_FIREBASE_STORAGE_BUCKET` | Same | Storage bucket. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Same | Messaging sender ID. |
| `VITE_FIREBASE_APP_ID` | Same | App ID. |
| `VITE_FIREBASE_MEASUREMENT_ID` | Same (optional) | Analytics measurement ID. |

---

## 2. Firestore data model

### 2.1 Collections and subcollections

- **users** — doc id = Firebase Auth UID. Fields: email, displayName/name, companyId, role, employeeRole, permissions, avatar, createdAt, etc.
- **companies** — doc id = custom (companyId). Fields: name, status, plan, userCount, projectCount, revenue, customWorkTypes, subscription (override, etc.), createdAt.
- **projects** — auto id. companyId, name, cropType, environmentType, status, startDate, endDate, location, acreage, budget, plantingDate, setupComplete, useBlocks, budgetPoolId, planning (seed, expectedChallenges, planHistory).
- **projectStages** — auto id. companyId, projectId, cropType, stageName, stageIndex, startDate, endDate, plannedStartDate/End, actualStartDate/End, status, notes, recalculated, recalculatedAt.
- **stageNotes** — auto id. companyId, projectId, stageId, text, createdBy, createdAt.
- **projectBlocks** — auto id. companyId, projectId, blockName, acreage, plantingDate, expectedEndDate, currentStage, seasonProgress, createdAt.
- **workLogs** — auto id. companyId, projectId, cropType, stageIndex, stageName, date, workCategory, workType, numberOfPeople, ratePerPerson, totalPrice, employeeIds, paid, paidAt, managerSubmissionStatus, etc.
- **operationsWorkCards** — auto id. companyId, projectId, allocatedManagerId, status, etc.
- **expenses** — auto id. companyId, projectId, cropType, harvestId, category, description, amount, date, stageIndex, stageName, syncedFromWorkLogId, workCardId, paid, paidAt, meta (harvest/picker batch), createdAt.
- **seasonChallenges** — auto id. companyId, projectId, cropType, title, description, status, dateIdentified, neededItems, etc.
- **neededItems** — auto id. companyId, seasonChallengeId, name, quantity, unit, etc.
- **inventoryCategories** — auto id. companyId, name, createdAt.
- **inventoryItems** — auto id. companyId, name, category, quantity, unit, pricePerUnit, packagingType, unitsPerBox, fuelType, scope/cropType/cropTypes, supplierId, lastUpdated, createdAt.
- **inventoryPurchases** — auto id. companyId, inventoryItemId, quantityAdded, unit, totalCost, projectId, date, expenseId, createdAt.
- **inventoryUsage** — auto id. companyId, projectId, inventoryItemId, category, quantity, unit, source, workLogId, stageIndex, stageName, date, createdAt.
- **inventoryAuditLogs** — auto id. companyId, action, inventoryItemId, quantity, etc., createdAt.
- **harvests** — auto id. companyId, projectId, cropType, harvestDate, quantity, unit, location, notes, createdAt.
- **harvestCollections** — auto id. companyId, projectId, cropType, name, harvestDate, pricePerKgPicker, totalHarvestKg, totalPickerCost, status, buyerPaidAt, harvestId, saleId, createdAt.
- **harvestPickers** — auto id. companyId, collectionId, name, totalKg, totalPay, isPaid, paidAt, paymentBatchId, etc.
- **pickerWeighEntries** — auto id. companyId, collectionId, pickerId, weightKg, recordedAt, etc.
- **harvestPaymentBatches** — auto id. companyId, collectionId, pickerIds, totalAmount, createdAt, createdBy.
- **harvestWallets** — doc id = `{companyId}_{projectId}_{cropType}`. companyId, projectId, cropType, cashReceivedTotal, cashPaidOutTotal, currentBalance, lastUpdatedAt, createdAt, createdBy, updatedBy.
- **collectionCashUsage** — doc id = `{walletId}_{collectionId}`. companyId, projectId, cropType, walletId, collectionId, totalDeducted, createdAt, lastUpdatedAt.
- **harvestCashPools** — (legacy) per-collection wallet; company-scoped.
- **harvestWalletPayments** — (Cloud Function only) audit of wallet deductions; no client access.
- **sales** — auto id. companyId, projectId, harvestId, amount, date, buyer, etc., createdAt.
- **projectWalletLedger** — auto id. companyId, projectId, type (credit/debit), amount, description, migratedFrom, createdAt, etc.
- **projectWalletMeta** — doc id = `{companyId}_{projectId}`. companyId, projectId, migratedAt, etc.
- **suppliers** — auto id. companyId, name, contact, etc.
- **employees** — doc id = often Firebase UID or custom. companyId, name, fullName, email, phone, role, employeeRole, department, status, permissions, joinDate, authUserId, createdAt, createdBy.
- **deliveries** — auto id. companyId, status, etc.
- **feedback** — auto id. companyId, message, createdAt, replyAt, etc.
- **auditLogs** — auto id. companyId, action, entityType, entityId, metadata, createdAt; append-only; read developer-only.
- **activityLogs** — auto id. companyId, projectId, action, metadata, createdAt; append-only.
- **inventoryAuditLogs** — company-scoped; append-only.
- **codeRed** — auto id. companyId, status, updatedAt; subcollection **messages** (auto id. text, createdBy, createdAt).
- **developerBackups** — doc id = companyId; subcollection **snapshots** (auto id. snapshot metadata + collections data).
- **platformExpenses** — developer-only.
- **challengeTemplates** — companyId, cropType, phase, template data, createdAt, updatedAt.
- **budgetPools** — auto id. companyId, name, totalAmount, remainingAmount, createdAt.
- **cropCatalog** — companyId, cropType, custom catalog entries; company-scoped.
- **customRoles** — companyId, role definition.
- **records_library** — (developer-only) cropId, category, title, content, highlights, tags, status, createdBy, createdAt, updatedAt.
- **company_records** — companyId, cropId, category, title, content, highlights, tags, createdBy, createdAt, updatedAt.
- **company_record_shares** — companyId, recordId, cropId, sharedBy, sharedAt, visibility, pinned, etc.
- **crops** — doc id = crop key (e.g. tomatoes). name, createdAt; reference list.
- **subscriptionPayments** — auto id. companyId, planId, amount, status (pending/approved/rejected), billingMode, createdAt, approvedAt, etc.
- **companySubscriptions** — doc id = companyId. subscription state, currentPeriodStart/End, trialStartedAt, etc.
- **developerActionsLog** — developer-only audit of billing actions.

### 2.2 Document ID strategy

- **User/company-scoped by UID or custom:** users (Auth UID), companies (custom companyId), employees (UID or custom), projectWalletMeta (companyId_projectId), harvestWallets (companyId_projectId_cropType), collectionCashUsage (walletId_collectionId).
- **Auto ID:** projects, projectStages, workLogs, expenses, harvests, harvestCollections, harvestPickers, pickerWeighEntries, harvestPaymentBatches, sales, projectWalletLedger, feedback, auditLogs, activityLogs, codeRed, subscriptionPayments, most others.

### 2.3 Relationships

- user → company (users.companyId → companies.id).
- company → projects, employees, expenses, workLogs, harvests, inventory*, operationsWorkCards, etc. (all company-scoped via companyId).
- project → projectStages, workLogs, expenses, harvests, harvestCollections, projectWalletLedger/Meta, seasonChallenges.
- harvestCollection → harvestPickers, pickerWeighEntries, harvestPaymentBatches; links to harvests, sales; wallet via harvestWallets + collectionCashUsage.
- expense → optional projectId, harvestId, workLogId, workCardId.
- Records: records_library (global by crop); company_records (company + crop); company_record_shares (company + record + crop).

### 2.4 Denormalization / computed

- workLogs: employeeName/managerName/adminName denormalized for display.
- harvestPickers: totalPay, isPaid, paymentBatchId.
- companies: userCount, projectCount, revenue (can be computed elsewhere but stored).
- project: budget updated by expenseBudgetService when expenses are created/paid.

### 2.5 Magic strings / enums (in code)

- Roles: `developer`, `company-admin`, `company_admin`, `manager`, `broker`, `employee`; employeeRole: `operations-manager`, `sales-broker`, `logistics-driver`.
- Expense categories: labour, fertilizer, chemical, fuel, other; broker: space, watchman, ropes, carton, offloading_labour, onloading_labour, broker_payment.
- Inventory categories: fertilizer, chemical, fuel, diesel, materials, sacks, ropes, wooden-crates, seeds.
- Record categories: Timing, Fertilizer, Pests & Diseases, Sprays, Yield, General.
- Harvest collection status: collecting, closed, etc.
- Project status: planning, active, completed, archived.

### 2.6 Index requirements (from firestore.indexes.json and query patterns)

- subscriptionPayments: status ASC, createdAt ASC.
- codeRed: companyId ASC, updatedAt DESC.
- workLogs: companyId, projectId, date, paid, ratePerPerson (composite).
- projectBlocks: companyId, projectId, createdAt ASC.
- budgetPools: companyId, createdAt DESC.
- records_library: cropId, createdAt DESC.
- company_records: companyId, cropId, createdAt DESC; cropId, createdAt DESC.
- company_record_shares: companyId, cropId, visibility, sharedAt DESC.

Additional indexes may be required for: activityLogs (companyId, projectId?, createdAt desc); subscriptionPayments (status, billingMode, plan, createdAt); workLogs (companyId, projectId, date range, ratePerPerson, paid); operationsWorkCards (companyId, allocatedManagerId); stageNotes (companyId, projectId, stageId, createdAt desc).

---

## 3. Data flows per feature

### A) Authentication

- **Signup:** AuthContext or authService uses `createUserWithEmailAndPassword`; then `setDoc(users/{uid})` with email, name, companyId, role, createdAt (and optionally updatedAt). On first login after signup, user doc may be created in AuthContext from credential.
- **Login:** `signInWithEmailAndPassword`; `onAuthStateChanged` fires; AuthContext loads `users/{uid}` and optionally `employees` (by doc id = uid or by `authUserId == uid`). User + employee merged into effective role/permissions. Session: React state + localStorage `farmvault:auth:user:v1`.
- **Route protection:** App-level routing checks `authReady` and `user`; role-based routes (e.g. admin) check `user.role === 'developer'`. No Firestore read on every route change; auth state from context.
- **Roles/permissions:** Resolved in AuthContext from user.role + employee.employeeRole/role and optional permissions object; `getDefaultPermissions` / `getFullAccessPermissions` / `resolvePermissions` in `src/lib/permissions`. No Firestore read for permission check after initial load.

**Queries/writes:** getDoc(users), getDocs(employees where authUserId==uid) or getDoc(employees/uid); setDoc(users) on signup/login. Realtime: none for auth.

---

### B) Farms / Projects

- **Farm (company):** Created in onboarding or company flow via companyService: `addDoc(companies, { name, status, plan, ... })`; id from ref.id. User then linked with `setDoc(users/{uid}, { companyId })`.
- **Project creation:** NewProjectForm: `addDoc(projects, { name, companyId, cropType, status, startDate, location, acreage, budget, setupComplete: false, ... })`. Then multiple `addDoc(projectStages, ...)` for each stage from config (and optionally seasonChallenges). Finally `updateDoc(projects/{id}, { setupComplete: true })`.
- **Planting date / stages:** project.startDate/plantingDate and projectStages drive stage selection. stageService: `getDocs(projectStages, where companyId, projectId, cropType)`. Planting date and blocks (projectBlocks) used for timeline; CropStagesPage and ProjectPlanningPage update projectStages (actualStartDate/actualEndDate, recalculated, status).
- **Project updates:** updateDoc(projects) from Settings/Project details; updateDoc(projectStages) from StageEditModal, EditTimelineModal, ProjectPlanningPage. companyDataService.deleteProject deletes project and related docs (projectStages, workLogs, expenses, seasonChallenges, inventoryUsage, harvests, sales) in batches.

**Queries:** getDocs(projects), getDocs(projectStages) — often via useCollection(path, 'projects' | 'projectStages', { companyId, projectId }). Writes: addDoc/updateDoc projects, projectStages, seasonChallenges.

---

### C) Inventory

- **Items:** InventoryPage and inventoryService: addDoc(inventoryCategories), addDoc(inventoryItems); updateDoc(inventoryItems) for quantity/lastUpdated; deleteDoc(inventoryItems). inventoryService.restockInventoryAndCreateExpense: updateDoc inventoryItems, addDoc inventoryPurchases (expenseId can be set separately).
- **Sync with expenses:** Restock can create inventoryPurchases; workLogService can create expenses linked to workLog; InventoryPage can addDoc(expenses) for restock. No automatic single “inventory ↔ expenses” sync service; multiple code paths create expenses.
- **Usage:** inventoryService.recordInventoryUsage: addDoc(inventoryUsage) with projectId, stageIndex, workLogId, etc. Deduct flow updates inventoryItems quantity and optionally creates expense.
- **Suppliers:** suppliers collection; company-scoped. Inventory items can have supplierId/supplierName.
- **Audit:** inventoryAuditLogService.addDoc(inventoryAuditLogs) on restock/deduct/delete/add.

**Queries:** getDocs(inventoryCategories), getDocs(inventoryItems), getDocs(inventoryPurchases), getDocs(inventoryUsage), getDoc(inventoryItems) for single item. Writes: addDoc/updateDoc/deleteDoc inventoryItems, inventoryCategories, inventoryPurchases, inventoryUsage, inventoryAuditLogs, expenses.

---

### D) Expenses

- **Creation:** ExpensesPage addDoc(expenses) with companyId, projectId, category, description, amount, date, createdAt. OperationsPage/ManagerOperationsPage/ExpensesPage can create expense from work log (syncedFromWorkLogId, workCardId) or mark work log paid and create expense (paid, paidAt). BrokerExpensesPage addDoc(expenses) with broker categories. Harvest flow: harvestCollectionService can addDoc(expenses) for picker payments (meta.source, paymentBatchId, etc.).
- **Required fields:** companyId, category, description, amount, date (and typically createdAt).
- **Linkage:** projectId, harvestId (optional); stageIndex/stageName for analytics; syncedFromWorkLogId, workCardId when from work card.
- **Totals:** Calculated in UI from queried expenses (e.g. by project, date range). expenseBudgetService: getDoc(projects) and updateDoc(project, { budget }) when deducting from project budget.
- **Display:** Project details, Harvest breakdown, Expenses page, Billing/reports.

**Queries:** getDocs(expenses) via useCollection or direct query (companyId, projectId, date range). Writes: addDoc(expenses), updateDoc(expenses) (e.g. paid).

---

### E) Harvest & logistics

- **Harvest entries:** harvestCollectionService.createHarvestCollection → addDoc(harvestCollections). Close collection: updateDoc(harvestCollections), then addDoc(harvests), addDoc(sales). HarvestSalesPage: addDoc(harvests) then addDoc(sales). Weigh entries: addDoc(pickerWeighEntries); pickers: addDoc(harvestPickers), updateDoc(harvestPickers) (totalKg, totalPay, isPaid, paymentBatchId).
- **Destination:** Sales and harvest records store buyer/market info; no separate “destination” enum in one place — inferred from harvest/sales docs.
- **Pricing:** pricePerKgPicker on harvestCollections; totalPay on harvestPickers; sales.amount; per-crate vs total in UI logic.
- **Lorry/deliveries:** deliveries collection (company-scoped); DriverDashboard updateDoc(deliveries) for status. No “lorry allocation” subcollection found.
- **Wallet:** projectWalletService: credit/debit projectWalletLedger; migration from harvestWallets (legacy). Picker pay: payPickersFromWalletBatchFirestore in harvestCollectionService (client): reads pickers, batch updates wallet ledger + collectionCashUsage, creates harvestPaymentBatches, updates harvestPickers (isPaid, paidAt, paymentBatchId). Cloud Functions addHarvestWalletCash / payPickerFromWallet / payPickersFromWalletBatch exist but are not invoked by current client.

**Queries:** getDocs(harvestCollections), getDocs(harvestPickers), getDocs(pickerWeighEntries), getDoc(harvestCollections), getDocs(harvestPaymentBatches); projectWalletService onSnapshot(projectWalletLedger). Writes: addDoc/updateDoc harvestCollections, harvestPickers, pickerWeighEntries, harvestPaymentBatches, harvests, sales, expenses; addDoc/updateDoc projectWalletLedger, projectWalletMeta.

---

### F) Records (notes)

- **Library (developer):** recordsService: getDoc(records_library), getDocs(records_library by cropId, orderBy createdAt desc, limit); addDoc/updateDoc/deleteDoc records_library.
- **Company records:** getDocs(company_records by companyId, cropId, orderBy createdAt desc, limit); addDoc/updateDoc/deleteDoc company_records. Shares: getDocs(company_record_shares by companyId, cropId, visibility); addDoc/updateDoc for share visibility/pin.
- **Loading slowness:** Pagination with limit (e.g. 50); fallback queries without orderBy when composite index missing (doubles reads on fallback). No global realtime listener; each screen queries on load.
- **Crops:** getDocs(crops) limit; setDoc(crops/{id}) for seed data; records_library and company_records keyed by cropId.

**Queries:** getDoc(records_library), getDocs(records_library | company_records | company_record_shares) with companyId/cropId, orderBy createdAt desc, limit; fallback without orderBy. Writes: addDoc/updateDoc/deleteDoc records_library, company_records; addDoc/updateDoc company_record_shares.

---

## 4. Query & write inventory (summary)

- **Reads:** getDoc (users, companies, projects, projectStages, employees, inventoryItems, harvestCollections, codeRed, companySubscriptions, feedback, crops, records, backup snapshots, expenseBudget project). getDocs on 30+ collections with filters (companyId, projectId, date, status, etc.) and often orderBy + limit.
- **Writes:** setDoc (users, companies, companySubscriptions, codeRed, crops); addDoc (projects, projectStages, workLogs, expenses, harvests, harvestCollections, harvestPickers, pickerWeighEntries, harvestPaymentBatches, sales, projectWalletLedger, feedback, auditLogs, activityLogs, inventory*, subscriptionPayments, operationsWorkCards, stageNotes, projectBlocks, budgetPools, challengeTemplates, cropCatalog, records_library, company_records, company_record_shares, developerBackups/snapshots, platformExpenses, developerActionsLog, neededItems, seasonChallenges, suppliers); updateDoc (all of the above where applicable); deleteDoc (inventoryItems, records, platformExpenses, company data in deleteProject/deleteAllCompanyData); writeBatch (workLogs+expenses, harvestPickers+harvestPaymentBatches, projectWallet migration, purge records, delete batches).
- **Realtime:** onSnapshot in useCollection (generic), ConnectivityContext (projects limit 1), activityLogService, cropCatalogService, projectWalletService (projectWalletLedger), useAdminSubscriptionPayments (subscriptionPayments).

---

## 5. Risks & bottlenecks

- **Unbounded or large listeners:** useCollection without limitCount can subscribe to full company-scoped set (e.g. all workLogs for a company). activityLogs, projectWalletLedger, subscriptionPayments use limit or constrained filters but still can be large per company.
- **Missing filters / full scans:** subscriptionAnalyticsService getDocs(companySubscriptions) and getDocs(companies) with no filter; backup and admin migration iterate full collections (by design for admin).
- **Duplicate queries on re-render:** Components using useCollection re-subscribe when deps change; no evidence of redundant duplicate subscriptions for same query key. recordsService fallback query when index missing causes extra reads.
- **Writes in loops:** companyDataService.deleteProject and deleteAllCompanyData use writeBatch with batching (500/450); harvestCollectionService payPickersFromWalletBatchFirestore chunks picker ids (30) for documentId() in query; no simple loop of single writes.
- **Security rule gaps:** harvestWalletPayments has no rules (fallback deny); only Cloud Function writes. Storage rules are permissive until 2026-03-12. Otherwise rules are company-scoped and developer-only where intended.
- **Billing spikes:** Large companies with many projects/workLogs/expenses and realtime listeners; backup/restore and admin analytics reading full sets; subscriptionPayments queries with date range but no limit in some paths.

---

## 6. Migration notes (Firebase → Supabase)

- **Auth:** Map Firebase Auth (email/password, onAuthStateChanged) to Supabase Auth (signInWithPassword, onAuthStateChange). Session: Supabase returns session/JWT; replace localStorage cache with Supabase session or short-lived cache.
- **Firestore → Postgres:** Each collection maps to table(s); companyId as tenant column; document IDs as primary key or uuid. Subcollections (codeRed/messages, developerBackups/snapshots) → separate tables with parent id. Denormalized fields (employeeName, managerName) can stay as columns or become joins.
- **Realtime:** Replace onSnapshot with Supabase Realtime (subscribe to table changes with filters). useCollection pattern → Supabase useSubscription or similar with eq('company_id', companyId).
- **Security:** Replace Firestore rules with Supabase RLS (row-level security) per table, using auth.uid() and companyId (or org_id) from JWT or user table.
- **Cloud Functions:** addHarvestWalletCash / payPickerFromWallet / payPickersFromWalletBatch: reimplement as Supabase Edge Functions or Postgres functions + triggers; wallet and payment batch logic in DB or server.
- **Storage:** No client Storage usage; if Supabase Storage is used later, define buckets and policies equivalent to tightened Firebase rules (e.g. company-scoped paths).
- **Analytics:** Firebase Analytics not used (no logEvent); any future analytics can use Supabase or third-party.

---

*End of Firebase Inventory & Data Flow Report.*
