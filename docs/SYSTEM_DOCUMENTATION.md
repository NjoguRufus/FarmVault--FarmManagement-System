# FarmVault Management System — Technical Documentation

This document describes how the FarmVault Management (KCA) system works: architecture, every page, component, context, service, and data flow in detail.

---

## Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [Technology Stack](#2-technology-stack)
3. [Application Entry & Routing](#3-application-entry--routing)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [Contexts (State)](#5-contexts-state)
6. [Layout & Shell](#6-layout--shell)
7. [Pages (Detailed)](#7-pages-detailed)
8. [Components](#8-components)
9. [Services & Data Layer](#9-services--data-layer)
10. [Firestore & Security Rules](#10-firestore--security-rules)
11. [Types & Data Models](#11-types--data-models)
12. [Hooks & Utilities](#12-hooks--utilities)

---

## 1. Overview & Architecture

FarmVault is a **multi-tenant farm operations and decision system** for modern agriculture. It supports:

- **Companies** (tenants) with their own projects, expenses, harvests, sales, inventory, and employees.
- **Roles**: Company Admin, Manager, Broker, Driver, Employee, and **Developer** (platform admin).
- **Crop-centric workflows**: Projects → Crop stages → Work logs / Work cards → Harvest → Sales, with expenses and inventory tied throughout.

**High-level flow:**

- **Entry:** `main.tsx` → `App.tsx` (wrapped in QueryClient, Auth, Project, Notification providers; React Router).
- **Public:** Landing (`/`), Login (`/login`), Setup Company (`/setup-company`).
- **Protected:** All app routes sit under `MainLayout` and are guarded by `RequireAuth` and/or role guards (`RequireDeveloper`, `RequireManager`, `RequireBroker`, `RequireDriver`, `RequireNotBroker`).
- **Data:** Firebase Auth for identity; Firestore for all business data. React Query (`useCollection`, etc.) and services abstract reads/writes.
- **UI:** React + TypeScript, Tailwind CSS, Radix UI (shadcn/ui), Recharts for charts.

---

## 2. Technology Stack

| Layer | Technology |
|-------|------------|
| Build | Vite, TypeScript |
| UI | React 18, Tailwind CSS, Radix UI (shadcn/ui), Lucide icons, Recharts |
| Routing | react-router-dom v6 |
| Data / Cache | Firebase (Auth, Firestore), TanStack React Query |
| Forms | react-hook-form, @hookform/resolvers, zod |
| Dates | date-fns |
| Notifications | sonner (toast), in-app NotificationContext |

---

## 3. Application Entry & Routing

### 3.1 Entry Point

- **`src/main.tsx`**  
  Renders `<App />` into `#root` and imports `index.css` (global styles).

### 3.2 App.tsx — Provider Tree & Routes

**Provider order (outer → inner):**

1. `QueryClientProvider` — React Query client for server-state/caching.
2. `AuthProvider` — Current user, login, logout, role.
3. `ProjectProvider` — List of projects + `activeProject` (from `useCollection('projects')`).
4. `NotificationProvider` — In-app notifications + toast.
5. `TooltipProvider` — Radix tooltips.
6. `Toaster` (shadcn) + `Sonner` — Toasts.
7. `BrowserRouter` — Routing.

**Route structure:**

| Route | Access | Description |
|-------|--------|-------------|
| `/` | Public | **Index** — Landing (hero, Get Started → setup-company, Login). |
| `/login` | Public | **LoginPage** — Email/password login; redirects by role after success. |
| `/setup-company` | Public | **SetupCompany** — Create company + first company-admin user. |
| `/setup` | Public | Redirect → `/setup-company`. |

**Protected routes (wrapped in `RequireAuth` + `MainLayout`):**

- **`/dashboard`** — Rendered by **CompanyDashboardRoute** (see below): company-admin sees CompanyDashboard; manager → `/manager`; broker → `/broker`; driver → `/driver`; developer → `/admin`; employee → role-based or `/projects`.
- **Company app routes** (most also wrapped in `RequireNotBroker` where broker has a separate flow):
  - `/projects`, `/projects/new`, `/projects/:projectId`, `/projects/:projectId/planning`
  - `/crop-stages`, `/expenses`, `/operations`, `/inventory`
  - `/harvest-sales`, `/harvest-sales/harvest/:harvestId`, `/harvest-collections`, `/harvest-collections/:projectId`
  - `/suppliers`, `/challenges`, `/employees`, `/reports`, `/billing`, `/settings`, `/support`, `/feedback`

**Role-specific route groups:**

- **Manager:** `RequireManager` + `MainLayout`: `/manager`, `/manager/operations` (ManagerOperationsPage).
- **Broker:** `RequireBroker` + `MainLayout`: `/broker` (BrokerDashboard), `/broker/harvest-sales`, `/broker/harvest/:harvestId`, `/broker/expenses`.
- **Driver:** `RequireDriver` + `MainLayout`: `/driver` (DriverDashboard).
- **Developer:** `RequireDeveloper` + `MainLayout`: `/admin`, `/admin/companies`, `/admin/users`, `/admin/users/pending`, `/admin/audit-logs`, `/admin/backups`, `/admin/code-red`, `/admin/feedback`, `/admin/finances`, `/admin/expenses`. `/developer` redirects to `/admin`.

**Catch-all:** `*` → **NotFound**.

### 3.3 CompanyDashboardRoute (Dashboard Router)

A dedicated component in `App.tsx` that renders the correct dashboard for the current user:

- Not authenticated → `Navigate to="/login"`.
- `company-admin` / `company_admin` → `<CompanyDashboard />`.
- `developer` → `Navigate to="/admin"`.
- Manager (role or employeeRole) → `Navigate to="/manager"`.
- `broker` → `Navigate to="/broker"`.
- Employee with driver role → `Navigate to="/driver"`.
- Employee with manager/broker role → `/manager` or `/broker`.
- Default employee/other → `Navigate to="/projects"`.

---

## 4. Authentication & Authorization

### 4.1 AuthContext (`src/contexts/AuthContext.tsx`)

- **State:** `user: User | null` (app user profile, not raw Firebase User).
- **Derived:** `isAuthenticated = !!user`.
- **Methods:** `login(email, password)`, `logout()`, `switchRole(role)` (local role override).
- **Initialization:** `onAuthStateChanged(auth, …)` loads profile from Firestore `users/{uid}`. If no user doc, falls back to `employees` collection by `authUserId` and maps employee role to app role (e.g. operations-manager → manager, sales-broker → broker).
- **Login flow:** `signInWithEmailAndPassword` then immediately fetches user doc (or employee) and sets `user` so UI updates without waiting for the listener.

### 4.2 User & Roles (from types)

- **User:** `id`, `email`, `name`, `role`, `employeeRole?`, `companyId`, `avatar?`, `createdAt`.
- **Roles:** `developer` | `company-admin` | `manager` | `broker` | `employee`.
- **employeeRole** (optional): e.g. `operations-manager`, `sales-broker`, `logistics-driver`, `driver`, `manager`, `broker`.

### 4.3 Auth Guards (components/auth/)

| Guard | Purpose |
|-------|--------|
| **RequireAuth** | Redirects to `/login` if not authenticated (preserves `location.state.from` for post-login redirect). |
| **RequireDeveloper** | After RequireAuth: only `role === 'developer'`; else redirect to `/dashboard`. |
| **RequireManager** | After RequireAuth: allows `role === 'manager'` or `employeeRole` manager/operations-manager; else `/dashboard`. |
| **RequireBroker** | After RequireAuth: allows `role === 'broker'` or employee with sales-broker/broker; also checks `employees` collection if needed; shows loading while employees load to avoid redirect flicker. |
| **RequireDriver** | After RequireAuth: allows employee whose record in `employees` has role `logistics-driver`; else `/dashboard`. |
| **RequireNotBroker** | If user is broker (or broker employee), redirects to `redirectTo` (default `/broker`; e.g. harvest-sales uses `/broker/harvest-sales`). Used so brokers don’t see company harvest-sales pages. |

---

## 5. Contexts (State)

### 5.1 AuthContext

Described above: user, login, logout, switchRole.

### 5.2 ProjectContext (`src/contexts/ProjectContext.tsx`)

- **Data:** `projects` from `useCollection<Project>('projects', 'projects')`.
- **State:** `activeProject: Project | null` (selected in TopNavbar dropdown).
- **API:** `setActiveProject(project)`, `getProjectsByCompany(companyId)` (filter by company).

### 5.3 NotificationContext (`src/contexts/NotificationContext.tsx`)

- **State:** List of `AppNotification` (id, title, message?, read, createdAt, type?).
- **API:** `addNotification({ title, message?, type })` (also triggers sonner toast), `markAsRead(id)`, `markAllRead()`.
- **Derived:** `unreadCount`. Notifications are in-memory only (last 100), not persisted to Firestore.

---

## 6. Layout & Shell

### 6.1 MainLayout (`src/components/layout/MainLayout.tsx`)

- Wraps all protected content; renders **AppSidebar**, **TopNavbar**, **PaymentReminderBanner**, main content area (`<Outlet />`), and **AIChatButton**.
- **Sidebar:** Collapsible; state `sidebarCollapsed` toggles width (e.g. 60 → 16 on desktop).
- **Role redirects:** If user is manager, only `/manager*`, `/operations`, `/inventory` allowed; if broker, only `/broker*`, `/expenses`. Otherwise redirects to `/manager` or `/broker` to avoid brokers/managers seeing company-only pages. Uses a ref to avoid redirect loops.
- Main content has `pt-16` and `md:pl-60` / `md:pl-16` depending on sidebar.

### 6.2 AppSidebar (`src/components/layout/AppSidebar.tsx`)

- **Company nav (company-admin / default):** Dashboard, Projects, Crop Stages, Expenses, Operations, Inventory, Harvest & Sales, Suppliers, Season Challenges, Employees, Reports, Billing, Settings, Support, Feedback.
- **Developer:** Admin Home, Companies, Users, Pending Users, Finances, FarmVault Expenses, Backups, Code Red, Feedback inbox, Audit Logs.
- **Manager:** Manager Operations, Inventory, Feedback.
- **Broker:** Broker Dashboard, Harvest & Sales, Market Expenses, Feedback.
- **Driver:** Driver Dashboard, Feedback.
- Mobile: overlay when open; collapse toggle button. Shows user avatar and display role in footer when not collapsed.
- Active link highlighted via `location.pathname` vs `item.href`.

### 6.3 TopNavbar (`src/components/layout/TopNavbar.tsx`)

- **Left:** Mobile menu (sidebar toggle), mobile logo, then **project selector** (dropdown of company projects; sets `activeProject`). Drivers see a “Driver” badge instead of project selector.
- **Center:** Search input (UI only, no hook-up in snippet).
- **Right:** Notifications dropdown (from NotificationContext; mark read / mark all read), **user menu** (Profile & Billing, Settings, Support, Logout). Uses `getDisplayRole(user)` for label.

### 6.4 PaymentReminderBanner (`src/components/layout/PaymentReminderBanner.tsx`)

- For non-developer users: fetches company by `user.companyId`; if `company.paymentReminderActive` is true, shows a fixed bottom-right banner (payment reminder, optional due date, “I’ve paid / Dismiss”). Dismiss calls `clearPaymentReminder(companyId, user.id)` and invalidates query.
- Developers do not see the banner.

### 6.5 AIChatButton (`src/components/ai/AIChatButton.tsx`)

- Floating AI chat entry point (implementation detail not fully inspected; present in layout).

---

## 7. Pages (Detailed)

### 7.1 Public Pages

**Index (`src/pages/Index.tsx`)**  
- Landing: FarmVault logo, tagline, short feature text, “Get Started” → `/setup-company`, “Login” → `/login`. Responsive background images and feature strip (planning, operations, inventory, insights).

**LoginPage (`src/pages/Auth/LoginPage.tsx`)**  
- Email + password form; show/hide password. On submit calls `login(email, password)`. On success, `useEffect` redirects by role: company-admin → `/dashboard`, developer → `/admin`, manager → `/manager`, broker → `/broker`, driver → `/driver`, else `from` or `/projects`. Handles Firebase errors (invalid credential, user-not-found, invalid-email) with friendly messages.

**SetupCompany (`src/pages/SetupCompany.tsx`)**  
- Form: company name, company email; admin name, admin email, password, confirm password. On submit: `registerCompanyAdmin(adminEmail, password)` → `createCompany(companyName, companyEmail)` → `createCompanyUserProfile({ uid, companyId, name, email })` → navigate to `/dashboard`.

### 7.2 Company Dashboard

**CompanyDashboard (`src/pages/dashboard/CompanyDashboard.tsx`)**  
- For company-admin. Uses `useCollection` for projects, expenses, harvests, sales, inventoryItems, projectStages. Filters by `user.companyId` and optional “Selected project” vs “All projects” (dropdown).  
- **Stats:** Total Revenue, Total Expenses, Profit and Loss, Remaining Budget (from filtered projects/expenses/sales).  
- **Charts:** ActivityChart (expenses + sales by month), ExpensesPieChart (by category).  
- **Widgets:** CropStageSection (stages for active or filtered projects), InventoryOverview, RecentTransactions (sales + expenses merged, sorted).  
- **Table:** ProjectsTable (filtered projects). Uses `toDate()` from dateUtils for Firestore timestamps.

### 7.3 Other Dashboards

**DeveloperDashboard**  
- Shown when developer hits a company-style dashboard route; typically developer is redirected to `/admin` by CompanyDashboardRoute.

**EmployeeDashboard**  
- Generic employee dashboard (if used; may be legacy).

**BrokerDashboard (`src/pages/dashboard/BrokerDashboard.tsx`)**  
- Filters harvests by `brokerId === user.id` and `destination === 'market'`; sales by broker or harvest. Shows total sales, total crates, average price per crate, best-selling day, highest/lowest price, harvest stock list. Broker-specific metrics and tables.

**DriverDashboard (`src/pages/dashboard/DriverDashboard.tsx`)**  
- Uses `activeProject` and `user.id` to filter deliveries where `driverId === user.id`. Today’s deliveries, trips, distance, fuel; “Start trip” / “Complete delivery” actions (update delivery status in Firestore). Fuel expenses and current assignment summary.

### 7.4 Projects

**ProjectsPage (`src/pages/ProjectsPage.tsx`)**  
- Lists company projects (from ProjectContext filtered by `user.companyId`). Search/filter UI (All Crops, All Status). Cards: crop emoji, name, location, status, budget, dates; click sets active project and navigates to `/projects/:projectId`. “New Project” → `/projects/new`. Shows “Creating project…” for projects with `setupComplete === false`.

**NewProjectPage**  
- Form to create a new project (crop type, name, location, acreage, budget, dates, etc.). Creates project in Firestore and typically creates project stages (from cropStageConfig); may set `setupComplete: false` until stages are created.

**ProjectDetailsPage**  
- Shows single project details; likely links to planning, crop stages, expenses, harvests for that project.

**ProjectPlanningPage**  
- Planning view for a project (e.g. seed info, expected challenges, plan history). Uses types like `Project.planning`.

### 7.5 Crop & Operations

**CropStagesPage**  
- View/manage crop stages for company/project (from projectStages collection and cropStageConfig).

**OperationsPage**  
- Operations/work flow: work logs and/or operations work cards. Managers submit execution; admin approves/rejects. Uses workLogService, operationsWorkCardService.

**ManagerOperationsPage**  
- Manager-specific view: work cards assigned to them; submit execution (actual workers, date, inputs, etc.). Uses `getWorkCardsForManager`, `submitExecution`, etc.

### 7.6 Harvest & Sales

**HarvestSalesPage**  
- Company harvest and sales list; link to harvest detail. RequireNotBroker so brokers use broker route.

**HarvestDetailsPage**  
- Single harvest detail (quantity, quality, farm/market pricing, broker, driver, sales).

**HarvestCollectionsPage**  
- Harvest collections (e.g. French beans: pickers, weigh entries, buyer price). Uses harvestCollectionService (createHarvestCollection, addHarvestPicker, addPickerWeighEntry, recalcCollectionTotals, markPickerCashPaid, setBuyerPriceAndMaybeClose, syncClosedCollectionToHarvestSale, harvest wallet top-up/pay).

**BrokerHarvestSalesPage**  
- Broker view of harvests and sales (filtered by brokerId).

**BrokerHarvestDetailsPage**  
- Broker-scoped harvest detail.

**BrokerExpensesPage**  
- Broker market expenses (categories: space, watchman, ropes, carton, offloading_labour, onloading_labour, broker_payment, other).

### 7.7 Inventory, Expenses, Others

**ExpensesPage**  
- Company expenses (labour, fertilizer, chemical, fuel, other, etc.); filter by project/date; create/edit.

**InventoryPage**  
- Inventory items (categories: fertilizer, chemical, fuel, diesel, materials, sacks, ropes, wooden-crates, seeds). Restock, deduct (work log, work card, harvest). Uses inventoryService, inventoryAuditLogService.

**SuppliersPage**  
- Suppliers (name, contact, categories, rating, status, reviewNotes).

**SeasonChallengesPage**  
- Season challenges (project, crop, title, description, type, severity, status, resolution, items used). Needed items can be derived from challenges.

**EmployeesPage**  
- Employees (companyId, name, role, department, contact, status, joinDate). Create employee can create Firebase user via authEmployeeCreate and link to company.

**ReportsPage**  
- Reports/analytics (likely expenses, sales, harvest by period/project).

**BillingPage**  
- Billing & subscription (company plan, payment reminder).

**SettingsPage**  
- Company/user settings.

**SupportPage**  
- Support entry.

**FeedbackPage**  
- User feedback (stored in `feedback` collection).

**NotFound**  
- 404 page.

### 7.8 Admin (Developer) Pages

All under `RequireDeveloper` + MainLayout.

| Path | Page | Purpose |
|------|------|--------|
| `/admin` | AdminDashboard | Platform overview: total companies, users, employees, pending users, system health. |
| `/admin/companies` | AdminCompaniesPage | List/manage companies. |
| `/admin/users` | AdminUsersPage | List users. |
| `/admin/users/pending` | AdminPendingUsersPage | Users without companyId (pending assignment). |
| `/admin/audit-logs` | AdminAuditLogsPage | Audit logs (auditLogService; developer read-only in rules). |
| `/admin/backups` | AdminBackupsPage | Create/restore company backups (backupService; developerBackups collection). |
| `/admin/code-red` | AdminCodeRedPage | Code Red requests and messages (codeRedService). |
| `/admin/feedback` | AdminFeedbackPage | Feedback inbox. |
| `/admin/finances` | AdminFinancesPage | Platform finances view. |
| `/admin/expenses` | AdminExpensesPage | Platform expenses (platformExpenses collection; developer-only). |

---

## 8. Components

### 8.1 Dashboard Components (`src/components/dashboard/`)

- **StatCard** — Metric card (title, value, optional change %, icon, variant e.g. gold/primary).
- **SimpleStatCard** — Simpler stat display.
- **LuxuryStatCard** — Alternate stat card style.
- **ActivityChart** — Bar chart (e.g. expenses + sales by month) via Recharts.
- **ExpensesPieChart** — Pie chart by expense category.
- **ExpensesBarChart** — Bar chart for expenses.
- **ProjectsTable** — Table of projects (name, crop, status, budget, etc.).
- **CompaniesTable** — Table of companies (admin).
- **DashboardWidgets** — Composed widgets: **InventoryOverview** (by category, quantity/value), **RecentTransactions** (list), **CropStageSection** (stages list), **RecentTransactionItem** type.

### 8.2 Auth Components

- All guards under `src/components/auth/` (RequireAuth, RequireDeveloper, RequireManager, RequireBroker, RequireDriver, RequireNotBroker) as above.

### 8.3 UI (shadcn-style, `src/components/ui/`)

- **accordion**, **alert**, **alert-dialog**, **aspect-ratio**, **avatar**, **badge**, **breadcrumb**, **button**, **calendar**, **card**, **carousel**, **chart**, **checkbox**, **collapsible**, **command**, **context-menu**, **dialog**, **drawer**, **dropdown-menu**, **form** (react-hook-form + label/input), **hover-card**, **input**, **input-otp**, **label**, **menubar**, **navigation-menu**, **pagination**, **popover**, **progress**, **radio-group**, **resizable**, **scroll-area**, **select**, **separator**, **sheet**, **sidebar**, **skeleton**, **slider**, **sonner**, **switch**, **table**, **tabs**, **textarea**, **toast** / **toaster**, **toggle**, **toggle-group**, **tooltip**.
- **NavLink** — Custom nav link if used.
- **use-toast** — Toast hook for shadcn toasts.

### 8.4 AI

- **AIChatButton** — Floating AI chat trigger (in MainLayout).

---

## 9. Services & Data Layer

### 9.1 Firebase / Firestore

- **`src/lib/firebase.ts`**  
  - Single Firebase app; second app `EmployeeCreate` for creating employee users without logging out current user.  
  - Exports: `app`, `auth`, `authEmployeeCreate`, `db` (Firestore), `analyticsPromise`.

### 9.2 Auth

- **authService.ts** — `registerCompanyAdmin(email, password)` → `createUserWithEmailAndPassword(auth, ...)`.

### 9.3 Company

- **companyService.ts** — `getCompany`, `setPaymentReminder`, `clearPaymentReminder`, `setCompanyNextPayment`, `updateCompany`, `createCompany`, `createCompanyUserProfile` (writes to `users/{uid}` with companyId, name, email, role company-admin).
- **companyDataService.ts** — `deleteProject`, `deleteAllCompanyData` (cascading deletes for a company).

### 9.4 Projects & Stages

- **stageService.ts** — `getCurrentStageForProject`, `fetchProjectStages(companyId, projectId, cropType)` (from projectStages collection).
- Project creation/stages: typically in NewProjectPage and/or project services using **cropStageConfig** (per crop type stage definitions and durations).

### 9.5 Work Logs & Work Cards

- **workLogService.ts** — `createWorkLog`, `syncTodaysLabourExpenses` (create/update expenses from work logs).
- **operationsWorkCardService.ts** — Create/update work cards; `submitExecution` (manager), `approveWorkCard`, `rejectWorkCard`, `markWorkCardPaid`; getters: `getWorkCardsForManager`, `getWorkCardsForManagers`, `getWorkCardsForCompany`, `getWorkCardsForProject`, `getWorkCard`; `canManagerSubmit`, `canMarkAsPaid`, `canAdminApproveOrReject`. Writes audit events (AUDIT_EVENTS).

### 9.6 Inventory

- **inventoryService.ts** — `restockInventoryAndCreateExpense`, `recordInventoryUsage`, `deductInventoryForWorkCard`, `deductInventoryForHarvest`, `checkStockForWorkCard`.
- **inventoryAuditLogService.ts** — `createInventoryAuditLog`, `getInventoryAuditLogs` (company-scoped; create allowed for company, read for signed-in).

### 9.7 Harvest & Sales / Collections

- **harvestCollectionService.ts** — Harvest collections (French beans): create collection, add picker, add weigh entry, recalc totals, mark picker paid, batch pay, set buyer price and close, sync closed collection to harvest/sale; harvest wallet: register cash, apply payment, pay pickers from wallet batch, get wallet, top-up. Uses harvestCashPools, harvestWallets, collectionCashUsage, harvestPaymentBatches, etc.

### 9.8 Platform & Admin

- **platformExpenseService.ts** — CRUD for platform (FarmVault) expenses; developer-only in rules.
- **auditLogService.ts** — `createAuditLog` (any signed-in), `getAuditLogs` (developer only).
- **codeRedService.ts** — Create/list Code Red requests, get request, add message, list messages, update status. Subcollection `codeRed/{requestId}/messages`.
- **backupService.ts** — `createCompanyBackup`, `listCompanyBackups`, `getBackupSnapshot`, `restoreCompanyFromBackup` (developerBackups collection).

### 9.9 Export & Date Helpers

- **exportUtils.ts** — Likely CSV/export helpers.
- **dateUtils.ts** — `toDate()` for Firestore Timestamp/Date, `formatDate`, etc.

---

## 10. Firestore & Security Rules

**File:** `firestore.rules`

**Helpers:**  
- `isSignedIn()`, `userCompanyId()` (from `users/{uid}.companyId`), `matchesCompanyOnCreate()` / `matchesCompanyOnDoc()` (new/existing doc companyId equals user’s), `isDeveloper()`, `isCompanyAdmin()`, `isManager()` (role or employeeRole).

**Collections (summary):**

- **users** — Read/write if signed in (rules note: tighten later with claims).
- **companies** — Read/write if `userCompanyId() == companyId` or developer.
- **projects, projectStages, workLogs, expenses, seasonChallenges, inventoryUsage, inventoryItems, inventoryCategories, inventoryPurchases, harvests, harvestCollections, harvestPickers, pickerWeighEntries, sales, harvestCashPools, suppliers, employees, deliveries, neededItems, feedback** — Read if signed in; create if `matchesCompanyOnCreate()` or developer; update/delete if `matchesCompanyOnDoc()` or developer.  
- **harvestPaymentBatches** — Create allowed; update/delete false.  
- **harvestWallets, collectionCashUsage** — Read if signed in; write false (backend-only).  
- **operationsWorkCards** — Read if same company or developer; create/update/delete company or developer.  
- **employees** — Create only if company-admin or manager (same company) or developer.  
- **developerBackups** — Developer only.  
- **platformExpenses** — Developer only.  
- **auditLogs** — Create if signed in; read/update/delete developer only (read).  
- **inventoryAuditLogs** — Create if company match; read signed in; no update/delete.  
- **codeRed** — Read/create/update by company or developer; messages subcollection same.  
- Fallback: deny all.

---

## 11. Types & Data Models

**File:** `src/types/index.ts`

- **CropType** — tomatoes | french-beans | capsicum | maize | watermelons | rice.
- **UserRole**, **User** — As in Auth section.
- **Company** — id, name, status, plan, userCount, projectCount, revenue, customWorkTypes, createdAt.
- **Project** — id, companyId, name, cropType, status, startDate, endDate, location, acreage, budget, plantingDate, startingStageIndex, seedVariety, planNotes, setupComplete, planning (seed, expectedChallenges, planHistory).
- **CropStage** — id, projectId, companyId, cropType, stageName, stageIndex, startDate, endDate, status, notes, recalculated, etc.
- **Expense**, **ExpenseCategory** — companyId, projectId, harvestId, category, amount, date, stageIndex, workCardId, paid, etc. Broker categories: space, watchman, ropes, carton, offloading_labour, onloading_labour, broker_payment.
- **InventoryCategory**, **InventoryItem**, **InventoryCategoryItem** — category, quantity, unit, packagingType, fuelType, boxSize, cropTypes, etc.
- **WorkLog** — projectId, companyId, cropType, stageIndex, stageName, date, workCategory, workType, numberOfPeople, ratePerPerson, totalPrice, employeeIds, chemicals, fertilizer, fuel, managerSubmissionStatus, managerSubmitted* fields, etc.
- **InventoryUsage**, **InventoryPurchase** — Source (workLog, manual-adjustment, workCard, harvest), quantities, dates.
- **Harvest** — projectId, companyId, cropType, date, quantity, unit, quality, destination (farm | market), farm/market pricing, brokerId, driverId, lorryPlates, etc.
- **Sale** — projectId, companyId, harvestId, buyerName, quantity, unitPrice, totalAmount, status, brokerId, amountPaid.
- **Supplier**, **Employee**, **Delivery**.
- **SeasonChallenge**, **NeededItem**.
- **DashboardStats**, **NavItem**.
- **CodeRedRequest**, **CodeRedMessage**, **CodeRedStatus**.
- **OperationsWorkCard**, **WorkCardPlanned**, **WorkCardActual**, **WorkCardPayment**, **WorkCardStatus**.
- **HarvestCollection**, **HarvestPicker**, **PickerWeighEntry**, **HarvestPaymentBatch**, **HarvestCollectionStatus**.

**Config:**  
- **cropStageConfig** (`src/lib/cropStageConfig.ts`) — Per CropType array of stage definitions (name, order, expectedDurationDays). **generateStageTimeline** produces start/end dates from planting date and starting stage.

---

## 12. Hooks & Utilities

### 12.1 useCollection (`src/hooks/useCollection.ts`)

- `useCollection<T>(key, path, options?)` — React Query: fetches full collection `path` from Firestore, returns `{ data: T[], isLoading, error, refetch }`. Optional `refetchInterval` for near real-time.

### 12.2 Other Hooks

- **useProjectStages** — Likely project stages for a project/crop.
- **useWorkCards** — Work cards for manager/company/project.
- **use-mobile** — Breakpoint for mobile (sidebar behavior).
- **use-toast** — Shadcn toast.

### 12.3 Utils (`src/lib/utils.ts`)

- **cn** — `clsx` + `tailwind-merge` for class names.
- **getDisplayRole(user)** — Human-readable role (e.g. employee + sales-broker → “Broker”).
- **getExpenseCategoryLabel(category)** — Label for expense category.
- **parseQuantityOrFraction(str)** — Parse "1/2", "1 1/2" etc. for inventory/work inputs.

---

## Summary

FarmVault is a role-aware, multi-tenant React SPA backed by Firebase. Routing and layout enforce company-admin, manager, broker, driver, and developer flows. State is split between AuthContext, ProjectContext, and NotificationContext; server state is in Firestore and accessed via React Query and dedicated services. Firestore rules enforce company scoping and developer-only areas. This document should allow any developer to navigate and extend the system with a clear picture of every major page, component, and data flow.
