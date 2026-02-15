# Software Design Specification (SDS)
## FarmVault Management System

**Document Version:** 1.0  
**Last Updated:** February 2025  
**Project:** FarmVault Management — KCA Project

---

## 1. Introduction

### 1.1 Purpose

This Software Design Specification (SDS) describes the architecture, components, interfaces, and data design of the FarmVault Management System. It is intended for developers and maintainers.

### 1.2 Scope

The design covers the client-side React application, state management, routing, authentication/authorization, integration with Firebase (Auth and Firestore), and the structure of Firestore collections and security rules.

### 1.3 References

- SRS: `docs/SRS_Software_Requirements_Specification.md`
- System Documentation: `docs/SYSTEM_DOCUMENTATION.md`
- Implementation: `docs/IMPLEMENTATION.md`

---

## 2. Architecture Overview

### 2.1 High-Level Architecture

FarmVault follows a **client-centric SPA architecture** with a **backend-as-a-service** (Firebase) model.

```
┌─────────────────────────────────────────────────────────────────┐
│                     Browser (Client)                              │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  React SPA (Vite + TypeScript)                              │  │
│  │  • Providers: QueryClient, Auth, Project, Notification     │  │
│  │  • Router: React Router v6 (public + protected + role)      │  │
│  │  • Layout: MainLayout → Sidebar, Navbar, Outlet             │  │
│  │  • Pages & feature components                               │  │
│  │  • Services (auth, company, work cards, harvest, inventory)  │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS / Firebase SDK
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Firebase                                       │
│  ┌──────────────────┐  ┌──────────────────────────────────────┐  │
│  │ Firebase Auth    │  │ Cloud Firestore                         │  │
│  │ • Email/password  │  │ • companies, users, projects,         │  │
│  │ • Session        │  │   projectStages, workLogs,             │  │
│  │ • Secondary app  │  │   operationsWorkCards, expenses,      │  │
│  │   (employee create)│  │   harvests, sales, harvestCollections,│  │
│  └──────────────────┘  │   inventory*, employees, deliveries,  │  │
│                        │   auditLogs, developerBackups, etc.    │  │
│                        │ • Security rules (company + developer)│  │
│                        └──────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Design Principles

- **Multi-tenancy:** Data is partitioned by `companyId`; Firestore rules enforce read/write by user’s company or developer role.
- **Role-based access:** UI routes and sidebar are determined by `user.role` and `user.employeeRole`; route guards enforce access.
- **Single source of truth:** Firestore holds persistent data; React Query caches collection reads; React context holds session and UI state (current user, active project, in-app notifications).
- **Separation of concerns:** Pages compose UI; services encapsulate Firestore writes and complex logic; hooks (e.g. `useCollection`) encapsulate reads.

---

## 3. Component Design

### 3.1 Provider Hierarchy (App.tsx)

Order from outer to inner:

1. **QueryClientProvider** — React Query client; enables `useQuery`/`useMutation` and caching.
2. **AuthProvider** — Provides `user`, `isAuthenticated`, `login`, `logout`, `switchRole`.
3. **ProjectProvider** — Provides `projects` (from Firestore), `activeProject`, `setActiveProject`, `getProjectsByCompany`.
4. **NotificationProvider** — Provides `notifications`, `addNotification`, `markAsRead`, `markAllRead`, `unreadCount`; integrates with Sonner toast.
5. **TooltipProvider** — Radix UI tooltip context.
6. **Toaster** (shadcn), **Sonner** — Toast UI.
7. **BrowserRouter** — Route tree (public, protected with MainLayout, role-specific branches).

This order ensures auth is available before project/notification and before any route that needs user/role.

### 3.2 Routing Design

- **Public routes:** `/`, `/login`, `/setup-company`, `/setup` (redirect).
- **Protected shell:** One parent route with `element={<RequireAuth><MainLayout /></RequireAuth>}` and child routes for dashboard and company features. Dashboard route uses **CompanyDashboardRoute** to render the correct dashboard or redirect by role.
- **Role-specific route groups:** Each wrapped in its own guard and MainLayout:
  - Manager: `RequireManager` → `/manager`, `/manager/operations`
  - Broker: `RequireBroker` → `/broker`, `/broker/harvest-sales`, `/broker/harvest/:harvestId`, `/broker/expenses`
  - Driver: `RequireDriver` → `/driver`
  - Developer: `RequireDeveloper` → `/admin`, `/admin/companies`, `/admin/users`, etc.
- **RequireNotBroker** wraps company harvest-sales (and similar) so brokers are redirected to broker routes.
- **Catch-all** `*` → NotFound.

### 3.3 Authentication and Authorization Design

**Auth flow:**

1. `onAuthStateChanged` fires when Firebase Auth state changes.
2. For each signed-in user, the app reads `users/{uid}` from Firestore. If missing, it falls back to `employees` where `authUserId == uid` and maps employee role to app role.
3. Login: `signInWithEmailAndPassword` → then immediate fetch of user (or employee) doc and set state so UI does not wait for the listener.
4. Logout: `signOut(auth)` and clear local user state.

**Role resolution:**

- Stored: `user.role` (developer | company-admin | manager | broker | employee) and optional `user.employeeRole` (e.g. operations-manager, sales-broker, logistics-driver).
- Guards use both: e.g. RequireManager allows `role === 'manager'` or `employeeRole` in (manager, operations-manager). RequireBroker and RequireDriver also check `employees` collection when needed to avoid redirect flicker.

**Route guard design:**

- Guards are wrapper components that render `children` if allowed, else `<Navigate to="..." replace />`. RequireAuth uses `state={{ from: location }}` for post-login redirect.
- MainLayout additionally enforces that managers and brokers only access their allowed paths and redirects if they navigate to a disallowed URL.

### 3.4 Layout Component Design

- **MainLayout:** Holds sidebar collapse state; computes redirect for manager/broker; renders AppSidebar, TopNavbar, PaymentReminderBanner, main `<Outlet />`, AIChatButton. Main content area has responsive padding (e.g. `md:pl-60` / `md:pl-16`) and `pt-16`.
- **AppSidebar:** Receives `collapsed` and `onToggle`. Nav items are chosen by `user.role` and `employeeRole` (company nav, developer nav, manager nav, broker nav, driver nav). Mobile: overlay when open; collapse button for desktop. User block and role label when not collapsed.
- **TopNavbar:** Project selector (dropdown of company projects, sets activeProject); drivers see “Driver” badge instead. Notifications dropdown (from NotificationContext). User menu (Profile & Billing, Settings, Support, Logout). Search input (UI only in current design).
- **PaymentReminderBanner:** Query company by `user.companyId`; if `paymentReminderActive`, show banner; dismiss calls `clearPaymentReminder` and invalidates query. Hidden for developers.

### 3.5 Page and Feature Components

- **Pages** are route targets; they use hooks (`useAuth`, `useProject`, `useCollection`) and services as needed. They compose UI from layout primitives and dashboard/feature components.
- **Dashboard components:** StatCard, SimpleStatCard, ActivityChart, ExpensesPieChart, ProjectsTable, DashboardWidgets (InventoryOverview, RecentTransactions, CropStageSection). These receive data as props; pages are responsible for filtering by company/project.
- **Auth components:** RequireAuth, RequireDeveloper, RequireManager, RequireBroker, RequireDriver, RequireNotBroker — no UI except redirect or loading (RequireBroker while employees load).
- **UI components:** shadcn-style primitives (button, card, dialog, table, select, etc.) in `src/components/ui/`. Used consistently for forms, tables, and dialogs across the app.

---

## 4. Data Design

### 4.1 Client-Side State

| State | Location | Description |
|-------|----------|-------------|
| User session | AuthContext | `user`, `isAuthenticated`; set by Auth listener and login. |
| Active project | ProjectContext | `activeProject`; set by TopNavbar project selector or project list click. |
| Projects list | ProjectContext | `projects` from `useCollection('projects','projects')`. |
| Notifications | NotificationContext | In-memory list; toast on add; not persisted. |
| Sidebar collapsed | MainLayout (useState) | UI preference; not persisted. |
| Server state | React Query | Cached collection/data from Firestore (keyed by query key). |

### 4.2 Firestore Data Model (Logical)

Collections and main attributes (see `src/types/index.ts` and Firestore rules for full shape):

- **users** — id (doc id = uid), email, name, role, employeeRole?, companyId, avatar?, createdAt.
- **companies** — id, name, email, status, plan, userCount, projectCount, revenue, customWorkTypes?, createdAt, nextPaymentAt?, paymentReminderActive?, subscriptionPlan?, etc.
- **projects** — id, companyId, name, cropType, status, startDate, endDate?, location, acreage, budget, plantingDate?, startingStageIndex?, setupComplete?, planning?, createdAt.
- **projectStages** — id, projectId, companyId, cropType, stageName, stageIndex, startDate?, endDate?, status, notes?, recalculated?, etc.
- **workLogs** — projectId, companyId, cropType, stageIndex, stageName, date, workCategory, workType?, numberOfPeople, ratePerPerson?, totalPrice?, employeeIds?, chemicals?, fertilizer?, fuel?, managerSubmissionStatus?, managerSubmitted*?, createdAt.
- **operationsWorkCards** — companyId, projectId, stageId, workTitle, workCategory, planned{}, actual{}, payment{}, status, allocatedManagerId, createdByAdminId, createdAt, approvedBy?, rejectionReason?, etc.
- **expenses** — companyId, projectId?, harvestId?, category, description, amount, date, stageIndex?, workCardId?, paid?, paidAt?, createdAt.
- **harvests** — projectId, companyId, cropType, date, quantity, unit, quality, destination?, farmPricingMode?, brokerId?, driverId?, lorryPlates?, etc.
- **sales** — projectId, companyId, harvestId, buyerName, quantity, unitPrice, totalAmount, status, brokerId?, amountPaid?.
- **harvestCollections** — companyId, projectId, cropType, name?, harvestDate, pricePerKgPicker, pricePerKgBuyer?, totalHarvestKg, totalPickerCost, totalRevenue?, profit?, status, harvestId?, createdAt.
- **harvestPickers** — companyId, collectionId, pickerNumber, pickerName, totalKg, totalPay, isPaid, paymentBatchId?.
- **pickerWeighEntries** — companyId, pickerId, collectionId, weightKg, tripNumber, recordedAt.
- **harvestPaymentBatches** — companyId, collectionId, pickerIds[], totalAmount, paidAt.
- **harvestCashPools** / **harvestWallets** / **collectionCashUsage** — wallet and cash usage (harvest wallet design; client may read only for some).
- **inventoryItems** — companyId, name, category, quantity, unit, pricePerUnit?, packagingType?, fuelType?, cropTypes?, etc.
- **inventoryUsage** — companyId, projectId, inventoryItemId, quantity, unit, source, workLogId?, workCardId?, harvestId?, date, createdAt.
- **inventoryPurchases** — companyId, inventoryItemId, quantityAdded, unit, totalCost, date, expenseId?, createdAt.
- **inventoryCategories** — companyId, name, createdAt.
- **suppliers** — companyId, name, contact, email?, categories?, rating, status, reviewNotes?.
- **employees** — companyId, name, role, department, contact, status, joinDate, authUserId?.
- **deliveries** — projectId, companyId, harvestId, driverId?, from, to, quantity, unit, status, distance?, fuelUsed?, date, createdAt.
- **seasonChallenges** — projectId, companyId, cropType, title, description, challengeType?, severity, status, dateIdentified, itemsUsed?, plan2IfFails?, etc.
- **neededItems** — companyId, projectId?, itemName, category, quantity, unit, sourceChallengeId?, status, createdAt.
- **feedback** — (companyId/user context), content, etc.
- **auditLogs** — event type, actor, resource, timestamp, etc. (create: any signed-in; read: developer).
- **inventoryAuditLogs** — companyId, action, details (create: company user; read: signed-in).
- **developerBackups** — companyId, snapshots subcollection (developer only).
- **platformExpenses** — (developer-only).
- **codeRed** — companyId, requestedBy, message, status; subcollection **messages** (company or developer).

### 4.3 Data Flow (Read/Write)

- **Read:** Pages or contexts use `useCollection<T>(queryKey, collectionPath)` which runs `getDocs(collection(db, path))` and maps docs to `{ id, ...data }[]`. React Query caches by queryKey. Optional `refetchInterval` for near real-time.
- **Write:** Services use Firestore `addDoc`, `setDoc`, `updateDoc`, `deleteDoc`, `runTransaction` where needed. They are called from event handlers in pages or components. Security rules enforce company match or developer.
- **Auth:** Firebase Auth for identity; Firestore `users` (and optionally `employees`) for profile and companyId/role. AuthContext hides this behind `user` and `login`/`logout`.

---

## 5. Interface Design

### 5.1 Module Interfaces (Key Services)

| Module | Exports (typical) | Consumed By |
|--------|-------------------|-------------|
| authService | registerCompanyAdmin | SetupCompany page |
| companyService | getCompany, createCompany, createCompanyUserProfile, clearPaymentReminder, updateCompany, setPaymentReminder, setCompanyNextPayment | SetupCompany, PaymentReminderBanner, Settings, Admin |
| companyDataService | deleteProject, deleteAllCompanyData | Admin, destructive flows |
| stageService | getCurrentStageForProject, fetchProjectStages | Project/stage pages |
| workLogService | createWorkLog, syncTodaysLabourExpenses | Operations, Expenses |
| operationsWorkCardService | createWorkCard, updateWorkCard, submitExecution, approveWorkCard, rejectWorkCard, markWorkCardPaid, getWorkCardsForManager, getWorkCardsForCompany, canManagerSubmit, canMarkAsPaid | Operations, ManagerOperations |
| inventoryService | restockInventoryAndCreateExpense, recordInventoryUsage, deductInventoryForWorkCard, deductInventoryForHarvest, checkStockForWorkCard | Inventory, Operations |
| inventoryAuditLogService | createInventoryAuditLog, getInventoryAuditLogs | Inventory, Admin |
| harvestCollectionService | createHarvestCollection, addHarvestPicker, addPickerWeighEntry, recalcCollectionTotals, markPickerCashPaid, markPickersPaidInBatch, setBuyerPriceAndMaybeClose, syncClosedCollectionToHarvestSale, getHarvestWallet, topUpHarvestWallet, payPickersFromWalletBatchFirestore, etc. | HarvestCollections, Harvest Sales |
| platformExpenseService | getPlatformExpenses, addPlatformExpense, updatePlatformExpense, deletePlatformExpense | Admin expenses |
| auditLogService | createAuditLog, getAuditLogs | App (create), Admin (read) |
| codeRedService | createCodeRed, listCodeRedsForCompany, getCodeRed, addCodeRedMessage, updateCodeRedStatus | Company, Admin Code Red |
| backupService | createCompanyBackup, listCompanyBackups, getBackupSnapshot, restoreCompanyFromBackup | Admin backups |

### 5.2 Context Interfaces

- **AuthContext:** `{ user, isAuthenticated, login, logout, switchRole }`.
- **ProjectContext:** `{ projects, activeProject, setActiveProject, getProjectsByCompany }`.
- **NotificationContext:** `{ notifications, addNotification, markAsRead, markAllRead, unreadCount }`.

### 5.3 Hooks Interfaces

- **useCollection&lt;T&gt;(key, path, options?):** Returns React Query result (data, isLoading, error, refetch); data is `T[]`.
- **useAuth():** Returns AuthContext value; throws if used outside AuthProvider.
- **useProject():** Returns ProjectContext value; throws if used outside ProjectProvider.
- **useNotifications():** Returns NotificationContext value or safe default.
- **useProjectStages,** **useWorkCards:** Project/stage and work card data for manager/company/project.

---

## 6. Security Design

### 6.1 Firestore Rules (Summary)

- **Helpers:** `isSignedIn()`, `userCompanyId()` from `users/{uid}.companyId`, `matchesCompanyOnCreate()` / `matchesCompanyOnDoc()` (companyId match), `isDeveloper()`, `isCompanyAdmin()`, `isManager()`.
- **users:** Read/write if signed in (to be tightened with claims if needed).
- **companies:** Read/write if user’s companyId matches or developer.
- **Most business collections:** Read if signed in; create if `matchesCompanyOnCreate()` or developer; update/delete if `matchesCompanyOnDoc()` or developer.
- **employees:** Create only if company-admin or manager (same company) or developer.
- **operationsWorkCards:** Read if same company or developer.
- **harvestWallets, collectionCashUsage:** Read only; no client write (backend-only).
- **harvestPaymentBatches:** Create only; no update/delete.
- **auditLogs:** Create if signed in; read/update/delete only developer (read).
- **inventoryAuditLogs:** Create if company match; read if signed in.
- **developerBackups, platformExpenses:** Developer only.
- **codeRed:** Read/write by company or developer; messages subcollection same.
- Default: deny.

### 6.2 Client-Side Security

- Route guards prevent unauthorized navigation; they do not replace server-side rules. All sensitive operations must be validated by Firestore rules.
- No sensitive secrets in client (e.g. API keys in env for Firebase are acceptable for client SDK; backend admin keys must not be in client).

---

## 7. Error Handling and Validation

- **Login:** Firebase Auth errors mapped to user-friendly messages (invalid credential, user-not-found, invalid-email).
- **Forms:** react-hook-form + zod where used; validation before submit.
- **Firestore:** Errors from services can be surfaced via toast or inline message; critical flows (e.g. backup restore) should confirm and show success/failure.
- **Route guards:** Unauthenticated → login with return URL; wrong role → redirect to dashboard or role home.

---

## 8. Configuration and Deployment Considerations

- **Firebase config:** In `src/lib/firebase.ts`; for production, consider environment variables.
- **Build:** Vite production build; static assets can be served from any host; Firebase remains cloud-hosted.
- **Environment:** Single Firebase project (Auth + Firestore); optional second app for employee-account creation so current user is not signed out.

---

*End of Software Design Specification*
