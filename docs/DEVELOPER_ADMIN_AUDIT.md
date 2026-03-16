# FarmVault Developer/Admin Platform — Full Discovery Audit

**Date:** 2025-03-15  
**Scope:** Developer/admin side only. No implementation or migration performed.  
**Goal:** Understand current state so we can plan routing, migration, and next build steps.

---

## PART A — ROUTING AUDIT

### 1. All current developer/admin routes

| Route | Component | Wrapped by |
|-------|-----------|------------|
| `/dev` | Redirect → `/dev/dashboard` | RequireDeveloper + MainLayout |
| `/developer` | Redirect → `/admin` | RequireDeveloper + MainLayout |
| `/dev/dashboard` | AdminDashboard | RequireDeveloper + MainLayout |
| `/dev/diagnostics` | DevDiagnosticsPage | RequireDeveloper + MainLayout |
| `/admin` | AdminDashboard | RequireDeveloper + MainLayout |
| `/admin/companies` | AdminCompaniesPage | RequireDeveloper + MainLayout |
| `/admin/users` | AdminUsersPage | RequireDeveloper + MainLayout |
| `/admin/users/pending` | AdminPendingUsersPage | RequireDeveloper + MainLayout |
| `/admin/audit-logs` | AdminAuditLogsPage | RequireDeveloper + MainLayout |
| `/admin/backups` | AdminBackupsPage | RequireDeveloper + MainLayout |
| `/admin/migration` | AdminMigrationPage | RequireDeveloper + MainLayout |
| `/admin/code-red` | AdminCodeRedPage | RequireDeveloper + MainLayout |
| `/admin/feedback` | AdminFeedbackPage | RequireDeveloper + MainLayout |
| `/admin/finances` | AdminFinancesPage | RequireDeveloper + MainLayout |
| `/admin/analytics/subscriptions` | AdminSubscriptionAnalyticsPage | RequireDeveloper + MainLayout |
| `/admin/expenses` | AdminExpensesPage | RequireDeveloper + MainLayout |
| `/admin/billing` | AdminBillingPage | RequireDeveloper + MainLayout |
| `/admin/payments` | AdminPendingPaymentsPage | RequireDeveloper + MainLayout |
| `/developer/records` | DeveloperRecordsPage | RequireDeveloper + MainLayout |
| `/developer/records/:cropId` | DeveloperCropRecordsPage | RequireDeveloper + MainLayout |
| `/developer/records/:cropId/record/:recordId` | DeveloperRecordDetailPage | RequireDeveloper + MainLayout |
| `/admin/records` | Redirect → `/developer/records` | RequireDeveloper + MainLayout |

**Dev auth (no RequireDeveloper):**

| Route | Component |
|-------|-----------|
| `/dev/sign-in` | DevSignInPage |
| `/dev/sign-up` | DevSignUpPage |
| `/dev/bootstrap` | DevBootstrapPage (DevRoute) |

### 2. Duplicated routes

- **Admin Home:** `/admin` and `/dev/dashboard` both render **AdminDashboard**. Entrypoints are split: `/admin` (legacy/redirect from `/developer`) and `/dev/dashboard` (canonical dev entry in nav).
- **Records:** `/admin/records` redirects to `/developer/records`; only `/developer/records` is in nav. No duplication of page logic.

### 3. Legacy routes

- **`/developer`** — Redirects to `/admin`. Legacy path; nav and docs use `/admin` or `/dev/dashboard`.
- **`/admin`** — Used as main “developer home” in nav label “Admin Home”. Functionally same as `/dev/dashboard`.
- **`/admin/migration`** — Firestore-focused migration/backfill tool (companyId). Legacy; no Supabase equivalent in routes.

### 4. Routes that should become canonical under `/developer/...`

Desired canonical structure (for future refactor):

- `/developer` or `/developer/home` → Developer Home (today’s AdminDashboard)
- `/developer/companies` → Companies
- `/developer/users` → Users
- `/developer/billing-confirmation` → Billing Confirmation (today’s “pending users” / trial + payment approval)
- `/developer/finances` → Finances
- `/developer/analytics/subscriptions` → Subscription Analytics
- `/developer/expenses` → FarmVault Expenses
- `/developer/backups` → Backups
- `/developer/code-red` → Code Red
- `/developer/feedback` → Feedback Inbox
- `/developer/audit-logs` → Audit Logs
- `/developer/records` → Records (already under `/developer/records`)
- `/developer/billing` → Billing (payment review; could be merged with billing-confirmation)
- `/developer/payments` → Pending Payments (or merged into billing)
- `/developer/migration` → Migration tool (if kept)
- `/dev/diagnostics` → Diagnostics (can stay under `/dev` for dev-only)

Today, most canonical content lives under **`/admin/*`**; only Records lives under **`/developer/records`**.

### 5. Routes/pages missing from desired structure

- **Billing Confirmation** — Exists as **`/admin/users/pending`** (Billing Confirmation in nav). Not missing; path is just different.
- **Dedicated “Developer Home”** — Exists as AdminDashboard at `/admin` and `/dev/dashboard`; not a separate page.
- **Admin/payments** — Exists as `/admin/payments` (Pending Payments). Not in nav; nav has “Billing Confirmation” (`/admin/users/pending`) and no explicit “Pending Payments” link (but AdminBillingPage has payment review).

**Truly missing:**

- No route for a **unified “Billing & Payments”** that clearly separates “confirm payment” vs “review all payments” if desired.
- **AdminManagersPage** and **AdminBrokersPage** exist as files but have **no routes** in App.tsx — dead/orphan pages.

---

## PART B — PAGE-BY-PAGE AUDIT

### AdminDashboard (Developer Home)

- **Purpose:** Platform overview: companies count, users count, employees count, “system health”.
- **Data:** `useCollection` for `companies`, `users`, `employees` (all with `isDeveloper: true`).
- **Actions:** None (read-only).
- **Status:** **Partial / broken.** Firebase has been removed; `useCollection` uses Firestore stub and returns **empty arrays**. UI renders 0s and “All core services operational” with no real data.
- **Backend:** **Firebase (stub).** Reads go through `useCollection` → `@/lib/firebase` + `@/lib/firestore-stub`; stub returns empty snapshots.
- **Tables/collections:** Firestore `companies`, `users`, `employees` (conceptually; stub returns nothing).
- **Missing:** Real KPIs (companies, users, employees), unpaid billing count, pending feedback count, recent audit activity, system health from a real source. DeveloperDashboard in `pages/dashboard/` uses `getDevDashboardKpis()` (Supabase RPC) for stats and `useCollection` for companies table — same stub issue for list; KPIs can work if RPC exists.
- **Recommendation:** **Rebuild.** Use Supabase-only data (e.g. `dev_dashboard_kpis` RPC already used by DeveloperDashboard). Unify with DeveloperDashboard or make AdminDashboard the single developer home and feed it from Supabase.

---

### AdminCompaniesPage (Companies)

- **Purpose:** List all companies; view detail (projects, employees, subscription); add company; set payment reminder; override subscription.
- **Data:** `useCollection` companies, projects, users; `getCompany(companyId)` (Supabase); direct Firestore `getDocs(collection(db, 'projects'))` and `getDocs(collection(db, 'employees'))` for selected company.
- **Actions:** Create company, set/clear payment reminder, override subscription (via `developerAdminService.overrideSubscription` — Supabase).
- **Status:** **Broken / partial.** List and company-scoped project/employee lists come from Firestore stub (empty). `getCompany` and `overrideSubscription` are Supabase and can work. Add company may use companyService (Supabase) or legacy — needs verification.
- **Backend:** **Mixed.** Supabase: companyService (getCompany, etc.), developerAdminService (overrideSubscription). Firebase/stub: useCollection, direct Firestore queries for projects/employees.
- **Tables/collections:** Firestore: `companies`, `projects`, `employees`. Supabase: core.companies, RPC override_subscription.
- **Missing:** Real company list and real project/employee counts per company from Supabase.
- **Recommendation:** **Refactor.** Source companies, projects, employees from Supabase (e.g. core.companies, projects, company_members or equivalent). Keep override subscription and company CRUD via existing/future Supabase APIs.

---

### AdminUsersPage (Users)

- **Purpose:** List all non-developer users with email, role, company, created date.
- **Data:** `useCollection` for `users` and `companies` (developer-scoped).
- **Status:** **Broken.** Stub returns empty; table is always empty.
- **Backend:** **Firebase (stub).**
- **Tables/collections:** Firestore `users`, `companies`.
- **Missing:** Real user list from Supabase (e.g. core.users or Clerk + company_members).
- **Recommendation:** **Rebuild.** Implement with Supabase (and Clerk if needed) for platform-wide user list and company assignment.

---

### AdminPendingUsersPage (Billing Confirmation)

- **Purpose:** Companies on free trial; days remaining; link to approve/reject payment (to `/admin/billing`). Shows pending subscription payments.
- **Data:** `useCollection` for `companies` and `subscriptionPayments` (status pending).
- **Status:** **Broken.** Stub returns empty; page shows no trials or pending payments.
- **Backend:** **Firebase (stub).**
- **Tables/collections:** Firestore `companies`, `subscriptionPayments`.
- **Missing:** Real trial companies and pending payments from Supabase/billing schema.
- **Recommendation:** **Rebuild.** Use Supabase billing/trials and subscription_payments (or equivalent) and optionally link to a single Billing Confirmation + Billing review flow.

---

### AdminAuditLogsPage (Audit Logs)

- **Purpose:** Platform and inventory audit logs; “Record test action” button. Tabs: Platform vs Inventory.
- **Data:** `getAuditLogs`, `getInventoryAuditLogs` (auditLogService, inventoryAuditLogService).
- **Actions:** `createAuditLog` (test entry).
- **Status:** **Broken.** Both services use Firestore (collection `auditLogs` and inventory audit collection). Firebase is stubbed — getDocs returns empty; writes (createAuditLog) call serverTimestamp/updateDoc and **throw** in stub.
- **Backend:** **Firebase.** auditLogService and inventoryAuditLogService use `db` from `@/lib/firebase` and firestore-stub.
- **Tables/collections:** Firestore `auditLogs`, inventory audit collection.
- **Missing:** Supabase-backed audit log (e.g. admin.audit_logs or similar) and inventory action log.
- **Recommendation:** **Rebuild.** Add Supabase audit tables and RLS; migrate read/write to Supabase; keep Platform vs Inventory tabs if both exist in new schema.

---

### AdminBackupsPage (Backups)

- **Purpose:** Per-company backups: list, create backup, view backup data (with password), restore.
- **Data:** `useCollection` for companies; backupService: listCompanyBackups, createCompanyBackup, restoreCompanyFromBackup, getBackupSnapshot.
- **Status:** **Broken.** Companies list is empty (stub). backupService uses Firestore (getDocsWithCache, etc.); backup/restore logic is Firestore-based and will throw or return empty.
- **Backend:** **Firebase.** useCollection + backupService (Firestore).
- **Tables/collections:** Firestore companies + backup-related collections used by backupService.
- **Missing:** Supabase-backed backup/restore or integration with Supabase (e.g. pg_dump/restore or managed backup API).
- **Recommendation:** **Rebuild.** Design backup/restore on top of Supabase (per-tenant or full DB); keep same UX (per-company list, create, view, restore).

---

### AdminMigrationPage (Migration)

- **Purpose:** Scan Firestore collections for docs missing `companyId`; backfill `companyId` for a given company (developer or company-admin scoped).
- **Status:** **Legacy / broken.** Entirely Firestore: getDocs, writeBatch, doc, update. Stub getDocs returns empty; writeBatch throws.
- **Backend:** **Firebase only.**
- **Tables/collections:** Multiple Firestore collections (projects, workLogs, expenses, etc.).
- **Missing:** Not applicable for Supabase-first; equivalent would be data fixes or migrations in SQL.
- **Recommendation:** **Remove or repurpose.** If no Firestore data remains, remove. If one-off migration scripts are needed for Supabase, implement as internal scripts or a one-time admin tool under Supabase.

---

### AdminCodeRedPage (Code Red)

- **Purpose:** List “Code Red” requests from companies; view thread; reply; mark resolved; restore company from latest backup.
- **Data:** codeRedService (listAllCodeReds, getCodeRed, listCodeRedMessages, addCodeRedMessage, updateCodeRedStatus); backupService (listCompanyBackups, restoreCompanyFromBackup).
- **Status:** **Broken.** codeRedService and backupService use Firestore; stub returns empty and writes throw.
- **Backend:** **Firebase.** codeRedService, backupService.
- **Tables/collections:** Firestore Code Red and backup collections.
- **Missing:** Supabase-backed code_red_requests and messages; restore still needs backup story on Supabase.
- **Recommendation:** **Rebuild.** Add code_red tables in Supabase; wire restore to Supabase backup/restore or manual process.

---

### AdminFeedbackPage (Feedback Inbox)

- **Purpose:** List user feedback; filter by type; reply to feedback (update doc with reply fields).
- **Data:** `useCollection` companies; useQuery that runs getDocs(collection(db, 'feedback')), orderBy createdAt. Update feedback doc with reply (updateDoc).
- **Status:** **Broken.** Read returns empty (stub); reply calls updateDoc → **throws** in stub.
- **Backend:** **Firebase.** Direct Firestore `feedback` collection.
- **Tables/collections:** Firestore `feedback`.
- **Missing:** Supabase feedback table and reply flow.
- **Recommendation:** **Rebuild.** Create feedback (and replies) in Supabase; same UX (list, filter, reply).

---

### AdminFinancesPage (Finances)

- **Purpose:** Platform revenue (from plan MRR × company counts), platform expenses (from platformExpenseService), profit, charts (revenue by plan, expense by category, monthly trend).
- **Data:** `useCollection` companies; `getPlatformExpenses` (platformExpenseService). Revenue is derived from company plan counts × fixed MRR (starter/professional/enterprise).
- **Status:** **Broken.** Companies and platform expenses from Firestore/stub — empty. Charts and totals show zeros or wrong numbers.
- **Backend:** **Firebase.** useCollection + platformExpenseService (Firestore).
- **Tables/collections:** Firestore `companies`, platformExpenseService collection (e.g. platformExpenses).
- **Missing:** Real revenue from Supabase billing/subscriptions; real platform expenses from Supabase table.
- **Recommendation:** **Rebuild.** Revenue from Supabase billing/subscription analytics; platform expenses in Supabase (e.g. admin.platform_expenses); keep same chart concepts.

---

### AdminExpensesPage (FarmVault Expenses)

- **Purpose:** CRUD for platform operational expenses (category, amount, date, description). Used by Finances dashboard.
- **Data:** platformExpenseService: getPlatformExpenses, addPlatformExpense, updatePlatformExpense, deletePlatformExpense.
- **Status:** **Broken.** All four use Firestore; stub getDocs returns empty; add/update/delete throw.
- **Backend:** **Firebase.** platformExpenseService (Firestore).
- **Tables/collections:** Firestore collection used by platformExpenseService.
- **Missing:** Supabase table for platform expenses and CRUD via Supabase.
- **Recommendation:** **Rebuild.** Create admin.platform_expenses (or similar) in Supabase; implement CRUD with RLS for developers only.

---

### AdminPendingPaymentsPage (Pending Payments)

- **Purpose:** List pending subscription payments; approve or reject (approveSubscriptionPayment, rejectSubscriptionPayment).
- **Data:** `useCollection` companies and `subscriptionPayments`; subscriptionPaymentService for approve/reject.
- **Status:** **Broken.** useCollection returns empty; approve/reject use Firestore (setDoc/updateDoc) and throw in stub.
- **Backend:** **Firebase.** useCollection + subscriptionPaymentService.
- **Tables/collections:** Firestore `companies`, `subscriptionPayments`.
- **Missing:** Supabase subscription_payments (or equivalent) and approve/reject API.
- **Recommendation:** **Rebuild.** Use Supabase billing tables and RPC or service for approve/reject; align with AdminBillingPage if merged.

---

### AdminSubscriptionAnalyticsPage (Subscription Analytics)

- **Purpose:** Subscription analytics: revenue, active subs, conversion, funnel, trend, plan/mode mix, top companies, expiring soon. Uses date range presets.
- **Data:** useSubscriptionAnalytics(range) → subscriptionAnalyticsService → **Supabase RPC `subscription_analytics`**.
- **Status:** **Working** (if RPC exists and is callable by developer). Only developer page fully on Supabase for data.
- **Backend:** **Supabase.** subscriptionAnalyticsService uses `supabase.rpc('subscription_analytics', …)`.
- **Tables/collections:** RPC implementation (likely billing/subscription tables in Supabase).
- **Missing:** Possibly error handling or fallback if RPC not deployed; otherwise feature-complete for current design.
- **Recommendation:** **Keep.** Ensure RPC is deployed and documented; optionally add more metrics in RPC if needed.

---

### AdminBillingPage (Billing)

- **Purpose:** Payment review drawer; override modal; filters (status, search, billing mode, plan, date range). Shows pending count, approved today, approved this month, overrides. useAdminSubscriptionPayments (Firestore pagination) + useCollection for subscriptions and pending/approved payments and overrides.
- **Data:** useAdminSubscriptionPayments (Firestore subscriptionPayments); useCollection for companySubscriptions, subscriptionPayments (pending/approved), overrides.
- **Status:** **Broken.** All Firestore-backed; stub returns empty; any write (approve/reject/override) throws.
- **Backend:** **Firebase.** useCollection + useAdminSubscriptionPayments (Firestore).
- **Tables/collections:** Firestore `subscriptionPayments`, `companySubscriptions`.
- **Missing:** Supabase billing + payment confirmation flow; override subscription can stay RPC (override_subscription already in developerAdminService).
- **Recommendation:** **Rebuild.** Move payment list and review to Supabase; reuse override_subscription RPC; unify with “Billing Confirmation” flow if desired.

---

### DeveloperRecordsPage (Records)

- **Purpose:** List crops; library vs company record counts; seed/purge dev tools (dangerous). Links to `/developer/records/:cropId`.
- **Data:** recordsService: listCrops, getLibraryRecordCountByCrop, getCompanyRecordCountByCrop; seedRecordsData, purgeRecordsData.
- **Status:** **Broken.** recordsService uses Firestore; stub returns empty; seed/purge use writes and throw.
- **Backend:** **Firebase.** recordsService (Firestore: crops, records_library, company_records, etc.).
- **Tables/collections:** Firestore crops, records_library, company_records, company_record_shares.
- **Missing:** Supabase schema for crops and records (library + company-scoped) and seed/purge for dev.
- **Recommendation:** **Rebuild.** Implement records/crops in Supabase; keep dev tools behind flag if needed.

---

### DeveloperCropRecordsPage (Records by crop)

- **Purpose:** List library and company records for a crop; pagination (Firestore startAfter); navigate to record detail. Uses recordsService (Firestore).
- **Status:** **Broken.** Same as DeveloperRecordsPage; stub returns empty.
- **Backend:** **Firebase.** recordsService.
- **Recommendation:** **Rebuild** with Supabase records schema and pagination.

---

### DeveloperRecordDetailPage (Record detail)

- **Purpose:** Show single record (title, category, highlights, tags, content). State passed via location.state (no direct fetch).
- **Status:** **Partial.** UI works; data comes from navigation state. If user opens URL directly, redirects back to list (no deep-link load from DB).
- **Backend:** **None** (state only). No direct Firestore/Supabase call.
- **Recommendation:** **Refactor.** Optionally load record by ID from Supabase when recordId is in URL for deep linking.

---

### DevDiagnosticsPage (Diagnostics)

- **Purpose:** Dev-only: show clerk user id, resolved companyId, role from company_members, current_company_id RPC, is_developer RPC, projects count. Uses `db` from `@/lib/db` (Supabase) and supabase.rpc.
- **Status:** **Working** (dev only). Supabase + RPCs.
- **Backend:** **Supabase.** db.core(), db.projects(), supabase.rpc('current_company_id'), supabase.rpc('is_developer').
- **Recommendation:** **Keep.** No change needed for backend; can stay under `/dev/diagnostics`.

---

### Orphan pages (no route)

- **AdminManagersPage** — Exists in `pages/admin/AdminManagersPage.tsx`; **not used** in App.tsx. Orphan.
- **AdminBrokersPage** — Exists in `pages/admin/AdminBrokersPage.tsx`; **not used** in App.tsx. Orphan.

Recommendation: **Remove** or assign to a route if managers/brokers admin is required.

---

## PART C — FIREBASE VS SUPABASE AUDIT

### Migration matrix

| Page / Feature | Firebase? | Supabase? | Mixed? | Notes |
|----------------|-----------|-----------|--------|-------|
| AdminDashboard | ✅ (stub) | ❌ | No | useCollection only → empty |
| DeveloperDashboard | ✅ (stub) | ✅ | Yes | getDevDashboardKpis = Supabase; useCollection = stub |
| AdminCompaniesPage | ✅ (stub) | ✅ | Yes | getCompany, overrideSubscription = Supabase; list + projects/employees = stub |
| AdminUsersPage | ✅ (stub) | ❌ | No | useCollection only |
| AdminPendingUsersPage | ✅ (stub) | ❌ | No | useCollection only |
| AdminAuditLogsPage | ✅ (stub) | ❌ | No | auditLogService, inventoryAuditLogService = Firestore |
| AdminBackupsPage | ✅ (stub) | ❌ | No | useCollection + backupService |
| AdminMigrationPage | ✅ (stub) | ❌ | No | Direct Firestore only |
| AdminCodeRedPage | ✅ (stub) | ❌ | No | codeRedService + backupService |
| AdminFeedbackPage | ✅ (stub) | ❌ | No | Direct Firestore feedback + updateDoc |
| AdminFinancesPage | ✅ (stub) | ❌ | No | useCollection + platformExpenseService |
| AdminExpensesPage | ✅ (stub) | ❌ | No | platformExpenseService only |
| AdminPendingPaymentsPage | ✅ (stub) | ❌ | No | useCollection + subscriptionPaymentService |
| AdminSubscriptionAnalyticsPage | ❌ | ✅ | No | Supabase RPC only |
| AdminBillingPage | ✅ (stub) | ❌ | No | useCollection + useAdminSubscriptionPayments |
| DeveloperRecordsPage | ✅ (stub) | ❌ | No | recordsService |
| DeveloperCropRecordsPage | ✅ (stub) | ❌ | No | recordsService |
| DeveloperRecordDetailPage | ❌ | ❌ | No | State only |
| DevDiagnosticsPage | ❌ | ✅ | No | Supabase + db from @/lib/db |
| companyService | ❌ | ✅ | No | getCompany, listCompanies, etc. |
| developerAdminService | ❌ | ✅ | No | getDevDashboardKpis, listCompanies, overrideSubscription |
| subscriptionAnalyticsService | ❌ | ✅ | No | subscription_analytics RPC |

### Direct Firebase/Firestore usage

- **`@/lib/firebase`** — Stub: exports a Proxy that **throws on any property access**. So any code that touches `db.something` throws.
- **`@/lib/firestore-stub`** — Read helpers (getDocs, getDoc, onSnapshot, etc.) return **empty** results; write helpers (addDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, etc.) **throw**.
- **useCollection** — Uses `collection(db, path)` and onSnapshot. Stub’s `collection` does not access `db`, so no throw; onSnapshot callback receives EMPTY_SNAPSHOT. Result: all useCollection hooks return **empty arrays**.
- **Direct getDocs(collection(db, …))** — Same: getDocs returns EMPTY_SNAPSHOT. So AdminCompaniesPage’s company projects/employees queries return empty.
- **Writes** — Any page or service that calls updateDoc, addDoc, setDoc, writeBatch (e.g. AdminFeedbackPage reply, AdminMigrationPage backfill, approve/reject payment, backup create/restore) will **throw** at runtime.

### Firestore collections (conceptual; all via stub)

- companies, users, employees, projects, projectStages, workLogs, operationsWorkCards, expenses, seasonChallenges, inventoryItems, inventoryCategories, inventoryUsage, inventoryPurchases, harvests, harvestCollections, harvestPickers, pickerWeighEntries, harvestPaymentBatches, sales, suppliers, deliveries, neededItems, feedback, subscriptionPayments, companySubscriptions, auditLogs, platformExpenses, backup-related, codeRed-related, records_library, company_records, company_record_shares, crops.

### Stale / migration helpers

- **AdminMigrationPage** — Firestore companyId backfill; obsolete once data is in Supabase.
- **firestoreCache** (getDocWithCache, getDocsWithCache) — Used by backupService, codeRedService; still Firestore-oriented; will stub or throw.

### Mixed reads/writes

- AdminCompaniesPage: reads companies/projects/employees (stub = empty); writes override via Supabase (works). So “override subscription” can work; list and detail do not.
- AdminFeedbackPage: read feedback (empty); write reply (throws).

### Dead Firebase code paths

- All code paths that **only** read via useCollection or getDocs are “live” but return empty data (no throw).
- All code paths that **write** (updateDoc, addDoc, setDoc, writeBatch, serverTimestamp, etc.) are **dead** in the sense they throw and cannot succeed.

---

## PART D — GAP ANALYSIS AGAINST REQUIRED DEVELOPER PAGES

Required set:

1. Developer Home  
2. Companies  
3. Users  
4. Billing Confirmation  
5. Finances  
6. Subscription Analytics  
7. FarmVault Expenses  
8. Backups  
9. Code Red  
10. Feedback Inbox  
11. Audit Logs  
12. Records  

| # | Required page | Exists? | Route | Complete? | Backend | Missing / notes |
|---|----------------|--------|-------|-----------|---------|------------------|
| 1 | Developer Home | Yes | /admin, /dev/dashboard | No | Firebase (stub) | Real KPIs; use Supabase (e.g. dev_dashboard_kpis). |
| 2 | Companies | Yes | /admin/companies | No | Mixed | Real list + projects/employees from Supabase. |
| 3 | Users | Yes | /admin/users | No | Firebase (stub) | Real user list from Supabase/Clerk. |
| 4 | Billing Confirmation | Yes | /admin/users/pending | No | Firebase (stub) | Trial + pending payments from Supabase. |
| 5 | Finances | Yes | /admin/finances | No | Firebase (stub) | Revenue + platform expenses from Supabase. |
| 6 | Subscription Analytics | Yes | /admin/analytics/subscriptions | Yes | Supabase | Keep; ensure RPC deployed. |
| 7 | FarmVault Expenses | Yes | /admin/expenses | No | Firebase (stub) | CRUD in Supabase. |
| 8 | Backups | Yes | /admin/backups | No | Firebase (stub) | Backup/restore on Supabase. |
| 9 | Code Red | Yes | /admin/code-red | No | Firebase (stub) | Code Red + restore on Supabase. |
| 10 | Feedback Inbox | Yes | /admin/feedback | No | Firebase (stub) | Feedback + replies in Supabase. |
| 11 | Audit Logs | Yes | /admin/audit-logs | No | Firebase (stub) | Audit tables in Supabase. |
| 12 | Records | Yes | /developer/records (+ detail) | No | Firebase (stub) | Records/crops in Supabase. |

**Summary:**

- **Missing entirely:** None; all 12 required pages exist as routes.
- **Present but weak/broken:** 10 of 12 (all except Subscription Analytics and, trivially, Developer Record detail state-only).
- **Mislabeled:** “Billing Confirmation” in nav points to “pending users” (trial + payment); “Pending Payments” exists at /admin/payments but not in nav — naming/consolidation needed.
- **Duplicated:** Developer Home: AdminDashboard and DeveloperDashboard (different components); both show platform stats; one is used at /admin and /dev/dashboard.
- **Still tied to Firebase:** All pages that depend on useCollection or Firestore services are effectively Firebase-stub-only (empty or throw).
- **Necessary but not yet created:** No new page type is missing; what’s missing is **working backend** and, optionally, a unified Billing + Billing Confirmation page.

---

## PART E — WHAT EACH DEVELOPER PAGE SHOULD ENTAIL (MINIMUM)

- **Developer Home:** High-level platform metrics (companies, active users, unpaid billing count, pending feedback count, recent audit activity, system health); quick links to Companies, Billing, Feedback, Audit. Data from Supabase (e.g. dev_dashboard_kpis RPC).
- **Companies:** Company list (Supabase); status, subscription plan, active projects, owner/admin info; actions: view, edit, override subscription, set payment reminder; optional: create company.
- **Users:** Platform-wide users (Supabase/Clerk); linked company, role, status; actions: view, assign company, deactivate.
- **Billing Confirmation:** Pending payment confirmations (Supabase); payment proof/details; approve/reject flow; trial companies and days remaining.
- **Finances:** Platform revenue (from billing/subscriptions); company billing summaries; incoming payments; outstanding balances; optional: export.
- **Subscription Analytics:** Active subscriptions, churn, plan distribution, monthly trend (already in place via RPC); keep and extend if needed.
- **FarmVault Expenses:** Platform expenses (hosting, tools, payroll, etc.); CRUD; categories; used by Finances.
- **Backups:** Backup history per company or global; restore readiness; manual trigger; Supabase-native or documented process.
- **Code Red:** Emergency requests from companies; thread/reply; mark resolved; restore from backup; maintenance toggles if needed.
- **Feedback Inbox:** User feedback list; status; source user/company; reply/resolve triage; store in Supabase.
- **Audit Logs:** Platform/admin actions; who did what and when; filter by actor, action, date; Supabase table(s).
- **Records:** Platform or system records (crops, library records, company records); list by crop; view detail; dev tools (seed/purge) optional and guarded.

---

## PART F — TECHNICAL ARCHITECTURE AUDIT

### Layout structure

- **Single MainLayout** for both company and developer. No dedicated DeveloperLayout. Developer vs company is determined by **sidebar nav** (getNavItemsForSidebar: if role === 'developer' → developerNavConfig).
- Developer routes are **siblings** under the same MainLayout that also serves `/dashboard`, `/projects`, etc. (for company users). Outlet renders the selected page.

### Navigation / sidebar

- developerNavConfig in navConfig.tsx: Admin Home (/admin), Companies, Users, Billing Confirmation (/admin/users/pending), Finances, Subscription Analytics, FarmVault Expenses, Backups, Code Red, Feedback inbox, Audit Logs, Records (/developer/records). All in group 'main'. No separate “more” section for developer.
- AppSidebar uses getNavItemsForSidebar(user) and filters by permission (getModuleForPath, can(module, 'view')). Developer sees developerNavConfig.

### Route protection

- RequireDeveloper wraps all developer routes (under MainLayout). Redirects to /dev/sign-in if not authenticated, to /dashboard if authenticated but not developer. Dev sign-in/sign-up and /dev/bootstrap are outside RequireDeveloper.

### Data fetching

- **Mixed:** useCollection (Firestore stub), useQuery (TanStack) for various services, Supabase RPCs (developerAdminService, subscriptionAnalyticsService), companyService (Supabase db). No single pattern; many pages assume live Firestore and get stub behaviour.

### Service boundaries

- **Company-facing:** companyService (Supabase), many other domain services (Supabase or still Firestore).
- **Developer-facing:** developerAdminService (Supabase), subscriptionAnalyticsService (Supabase), auditLogService (Firestore), backupService (Firestore), codeRedService (Firestore), platformExpenseService (Firestore), subscriptionPaymentService (Firestore), recordsService (Firestore). Only developerAdminService and subscriptionAnalyticsService are Supabase-only for developer use.

### Duplicated logic

- Developer Home: AdminDashboard vs DeveloperDashboard (different components; DeveloperDashboard uses getDevDashboardKpis + useCollection; AdminDashboard uses only useCollection). Both used in app: AdminDashboard at /admin and /dev/dashboard; DeveloperDashboard is imported in App but **not used in any route** (only AdminDashboard is). So only AdminDashboard is the live developer home.
- Records: Company app has /records (AdminRecordsPage in pages/records/); developer has /developer/records (DeveloperRecordsPage in pages/admin/). Two UIs and two route trees; recordsService is shared and Firestore-based.

### Stale components

- AdminManagersPage, AdminBrokersPage — no routes.
- DeveloperDashboard — used nowhere in routes (dead import or legacy).

### Placeholder content

- AdminDashboard “System Health” is hardcoded “All core services operational.”
- DeveloperDashboard uses mockActivityData for ActivityChart (mock).

### Opportunities to unify

- **Single developer home:** One page (e.g. Developer Home at /developer or /developer/home) fed by dev_dashboard_kpis and optional Supabase lists; remove or merge AdminDashboard and DeveloperDashboard.
- **Unified /developer/* route tree:** Move all admin features under /developer/* (e.g. /developer/companies, /developer/users, …) and keep /admin as redirect for backward compatibility.
- **Dedicated DeveloperLayout:** Optional; could wrap only /developer/* and /dev/* with a layout that has developer-specific header/sidebar and no company nav. Current approach (one MainLayout, nav by role) is acceptable if nav and routes are cleaned up.

---

## PART G — DELIVERABLES (NO BUILD YET)

### 1. Full routing audit

See **Part A** above: all routes listed; duplicates (admin vs dev/dashboard); legacy (/developer, /admin/migration); canonical targets (/developer/...); missing (none; orphans AdminManagersPage, AdminBrokersPage).

### 2. Page-by-page developer/admin audit

See **Part B** above: each page’s purpose, data, actions, status (working/partial/broken), backend (Supabase/Firebase/mixed), tables/collections, what’s missing, recommendation (keep/refactor/rebuild/remove).

### 3. Firebase vs Supabase migration matrix

See **Part C** above: table of Firebase/Supabase/Mixed per page and key services; notes on stub behaviour and dead writes.

### 4. Gap analysis against required developer pages

See **Part D** above: all 12 required pages exist; 10 are broken or partial (Firebase stub); only Subscription Analytics (and DevDiagnostics) are Supabase-working. No net-new page type required; Billing Confirmation vs Billing vs Pending Payments naming/merge to clarify.

### 5. Recommendations (summary)

| Page / area | Action |
|-------------|--------|
| Developer Home (AdminDashboard) | **Rebuild** with Supabase (dev_dashboard_kpis + optional lists). |
| Companies | **Refactor** to Supabase for list, projects, employees; keep override_subscription. |
| Users | **Rebuild** with Supabase/Clerk user list. |
| Billing Confirmation (pending users) | **Rebuild** with Supabase trials + pending payments. |
| Finances | **Rebuild** with Supabase revenue + platform_expenses. |
| Subscription Analytics | **Keep** (Supabase RPC). |
| FarmVault Expenses | **Rebuild** with Supabase CRUD. |
| Backups | **Rebuild** with Supabase backup/restore. |
| Code Red | **Rebuild** with Supabase code_red + restore. |
| Feedback Inbox | **Rebuild** with Supabase feedback + replies. |
| Audit Logs | **Rebuild** with Supabase audit tables. |
| Records | **Rebuild** with Supabase records/crops. |
| AdminBillingPage / Pending Payments | **Rebuild** with Supabase; consider merging with Billing Confirmation. |
| AdminMigrationPage | **Remove** or **repurpose** as one-off Supabase migration tool. |
| AdminManagersPage / AdminBrokersPage | **Remove** or add route if needed. |
| DeveloperDashboard | **Remove** or merge into single Developer Home. |

### 6. Proposed canonical /developer/... route structure

- `/developer` or `/developer/home` — Developer Home  
- `/developer/companies` — Companies  
- `/developer/users` — Users  
- `/developer/billing-confirmation` — Billing Confirmation (trial + pending payments)  
- `/developer/billing` — Billing (payment review + overrides; optional merge with above)  
- `/developer/finances` — Finances  
- `/developer/analytics/subscriptions` — Subscription Analytics  
- `/developer/expenses` — FarmVault Expenses  
- `/developer/backups` — Backups  
- `/developer/code-red` — Code Red  
- `/developer/feedback` — Feedback Inbox  
- `/developer/audit-logs` — Audit Logs  
- `/developer/records` — Records (list)  
- `/developer/records/:cropId` — Records by crop  
- `/developer/records/:cropId/record/:recordId` — Record detail  
- `/dev/diagnostics` — Diagnostics (can stay under /dev)  
- Redirects: `/admin` → `/developer`; `/admin/*` → `/developer/*` for each mapping above to keep old links working.

### 7. Recommended next implementation order

1. **Stabilise developer home:** Implement or reuse dev_dashboard_kpis; single Developer Home page (Supabase only); remove or merge duplicate dashboard components.  
2. **Companies:** Supabase list + detail (projects/employees from Supabase); keep override_subscription.  
3. **Users:** Supabase (and Clerk if needed) user list.  
4. **Billing Confirmation + Billing:** Supabase billing/trials and subscription_payments; approve/reject and overrides; single or two pages.  
5. **FarmVault Expenses:** Supabase table + CRUD; then **Finances** using that + revenue from billing.  
6. **Feedback Inbox:** Supabase feedback + replies.  
7. **Audit Logs:** Supabase audit tables + read UI.  
8. **Backups:** Supabase backup/restore design and UI.  
9. **Code Red:** Supabase code_red + restore.  
10. **Records:** Supabase records/crops and developer Records pages.  
11. **Route refactor:** Move to /developer/* and add redirects from /admin/*.  
12. **Cleanup:** Remove AdminMigrationPage (or repurpose), orphan pages, and Firestore-dependent code for developer features.

### 8. Risks / blockers before routing refactor

- **Firebase stub:** Any developer page that still calls Firestore writes will throw in production; reads return empty. Fix data layer first (Supabase) before relying on those pages.  
- **Auth/role:** RequireDeveloper and nav depend on user.role === 'developer'. Ensure this is set correctly from Supabase/Clerk (e.g. is_developer RPC or core role).  
- **RLS:** All new Supabase tables for developer-only data must have RLS that allows only developers (e.g. via is_developer() or service role for admin operations).  
- **Billing schema:** Subscription and payment tables and RPCs (subscription_analytics, override_subscription, dev_dashboard_kpis) must exist and be stable before rebuilding Billing, Finances, and Developer Home.  
- **Backup/restore:** No Supabase backup story yet; design (per-tenant vs full DB, restore process) is a blocker for Backups and Code Red restore.

### 9. Suggested final developer page architecture

- **Single layout:** Keep MainLayout with role-based sidebar, or introduce DeveloperLayout for `/developer/*` only (developer-specific header/footer/sidebar).  
- **Single entrypoint:** One Developer Home at `/developer` or `/developer/home` with KPIs and links; no duplicate dashboard components.  
- **All data from Supabase:** No Firestore or stub for developer features; use core, billing, admin schemas and RPCs.  
- **Clear route tree:** Everything under `/developer/*` with consistent naming; `/admin` and `/admin/*` redirect to `/developer` and `/developer/*`.  
- **Services:** One service layer (or set of modules) for developer APIs (companies, users, billing, finances, expenses, feedback, audit, backups, code red, records) all calling Supabase.  
- **Audit:** All developer actions (override subscription, approve payment, restore backup, etc.) written to an audit log in Supabase for compliance.

---

**End of audit.** No implementation or migration was performed; this document is for planning only.
