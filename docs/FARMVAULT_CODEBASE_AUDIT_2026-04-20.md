# FarmVault Codebase Audit

## 1. Product Structure

### 1.1 Every page/route that exists with exact path (from `src/App.tsx`)

**Legend**
- **Access**:
  - **Public**: no auth wrapper
  - **Auth**: wrapped in `RequireAuth`
  - **Onboarding**: inside `RequireAuth` + `RequireOnboarding` + `FarmRoleGate`
  - **Permission(module[, action])**: wrapped in `PermissionRoute`
  - **Role**: wrapped in `RequireBroker` / `RequireNotBroker` / `RequireDeveloper` / `DeveloperRoute`
- **Complete vs stubbed**:
  - **Redirect-only**: `Navigate ...` (not a page)
  - **Page**: renders a component (UI exists; “stub” only if the file itself is placeholder text; several SEO pages contain explicit placeholders)

#### Public/auth entry + onboarding
- **`/`**
  - **Element**: `RootRoute`
  - **Access**: Public
  - **What it does**: On public production host, renders marketing `Index`; otherwise routes signed-in users to app entry.
  - **Complete/stubbed**: Page
- **`/r/:code`**
  - **Element**: `ReferralShortLinkPage`
  - **Access**: Public
  - **What it does**: Referral short-link resolver/redirect.
  - **Complete/stubbed**: Page
- **`/login`** → **Redirect-only** to `/sign-in`
- **`/signin`** → **Redirect-only** to `/sign-in`
- **`/signup`**
  - **Element**: `SignupQueryPreservingRedirect`
  - **Access**: Public
  - **What it does**: Preserves query params and redirects into Clerk signup.
  - **Complete/stubbed**: Redirect-only (logic component)
- **`/sign-in`**, **`/sign-in/*`**
  - **Element**: conditional: `SignInPage` if `VITE_CLERK_PUBLISHABLE_KEY` else redirect to `/emergency-access`
  - **Access**: Public
  - **What it does**: Clerk sign-in or emergency fallback.
  - **Complete/stubbed**: Page (or redirect)
- **`/sign-up`**, **`/sign-up/*`**
  - **Element**: `SignUpPage`
  - **Access**: Public
  - **What it does**: Clerk signup.
  - **Complete/stubbed**: Page
- **`/accept-invitation`**, **`/accept-invitation/*`**
  - **Element**: `AcceptInvitationPage`
  - **Access**: Public (but expects invite token; will fail if invalid)
  - **What it does**: Accept employee invitation.
  - **Complete/stubbed**: Page
- **`/dev/sign-in`**, **`/dev/sign-in/*`** → `DevSignInPage` (Public, Page)
- **`/dev/sign-up`**, **`/dev/sign-up/*`** → `DevSignUpPage` (Public, Page)
- **`/dev/sign-up/tasks/*`** → redirect to `/developer` (Redirect-only)
- **`/dev/bootstrap`** → `DevRoute(DevBootstrapPage)` (Developer role gate, Page)
- **`/auth/callback`** → `AuthCallbackPage` (Public, Page)
- **`/auth/continue`** → `PostAuthContinuePage` (Public, Page)
- **`/auth/ambassador-continue`** → `AmbassadorAuthContinuePage` (Public, Page)
- **`/emergency-access`** → `EmergencyAccessPage` (Public, Page)
- **`/choose-plan`** → redirect to `/onboarding/company` (Redirect-only)
- **`/company`** → redirect to `APP_ENTRY_PATH` (Redirect-only)
- **`/onboarding/company`** → `RequireAuth(OnboardingPage)` (Auth, Page)
- **`/onboarding`** → redirect to `/onboarding/company` (Redirect-only)
- **`/pending-approval`** → `RequireAuth(PendingApprovalPage)` (Auth, Page)
- **`/awaiting-approval`** → redirect to `/pending-approval` (Redirect-only)
- **`/start-fresh`** → `RequireAuth(StartFreshPage)` (Auth, Page)
- **`/setup-company`**, **`/setup`** → redirect to `/onboarding/company` (Redirect-only)
- **`/app/app-entry`** → `RequireAuth(AppEntryPage)` (Auth, Page)
- **`/app-entry`** → redirect to `APP_ENTRY_PATH` (Redirect-only)

#### Public marketing + legal + SEO
- **`/features`** → `FeaturesPage` (Public, Page)
- **`/pricing`** → `PricingPage` (Public, Page)
- **`/about`** → `AboutPage` (Public, Page)
- **`/faq`** → `FaqPage` (Public, Page)
- **`/what-is-farmvault`** → `WhatIsFarmVaultPage` (Public, Page)
- **`/agriculture-software-kenya`** → `AgricultureSoftwareKenyaPage` (Public, Page)
- **`/learn`** → `LearnHubPage` (Public, Page)
- **`/learn/farm-management`** → `FarmManagementLearnMasterPage` (Public, Page)
- **`/learn/:slug`** → `LearnTopicPage` (Public, Page)
- **`/terms`**, **`/privacy`**, **`/refund`** → legal pages (Public, Page)

#### Ambassador
- **`/ambassador`**, **`/ambassador/signup`**, **`/ambassador/terms`**, **`/ambassador/privacy`**, **`/ambassador/onboarding`**, **`/ambassador/learn`** → public ambassador pages
- **`/ambassador/refer`** → redirect to `/ambassador/console/refer`
- **`/ambassador/dashboard`** → redirect to `/ambassador/console/dashboard`
- **`/ambassador/console`** → `AmbassadorLayout`
  - index → redirect to `dashboard`
  - `dashboard|referrals|earnings|refer|learn|settings` guarded by `RequireAmbassador`
  - `qr` → redirect to `refer`

#### Other public
- **`/scan`** → `ScanPage` (Public, Page)
- SEO pillar pages: `/farm-management-software-kenya`, `/crop-monitoring-software`, `/farm-inventory-management-system`, `/farm-expense-tracking-software`, `/farm-harvest-management-system`, `/farm-project-management-software`, `/farm-budgeting-software`, `/crop-guides`, `/farm-budget-guides`, `/farm-chemicals-guide`, `/crop-disease-database`, `/farm-calculators`, `/tomato-farming-kenya`, `/maize-farming-kenya`, `/rice-farming-kenya`, `/french-beans-farming-kenya`, `/capsicum-farming-kenya`, `/watermelon-farming-kenya`, city pages, calculators, `/blog`, `/blog/:slug`.

#### Protected app shell (company + broker + records + billing, etc.)
All of these run under:
`RequireAuth → RequireOnboarding → FarmRoleGate → MainLayout` and then per-route wrappers.

- **`/app`**, **`/app/*`** → `RequireNotBroker(CompanyDashboardRoute)`
- **`/dashboard`** → `Permission(dashboard) + RequireNotBroker(CompanyDashboardRoute)`
- **`/projects`**, **`/farms/:farmId`**, **`/projects/:projectId*`** → `Permission(projects)` + not-broker
- **`/projects/new`** → `Permission(projects, create)` then redirect to `/projects?new=1`
- **`/projects/:projectId/planning`**, **`/crop-stages`**, **`/challenges`** → planning module
- **`/expenses`** → expenses module
- **`/operations`**, **`/operations/legacy`** → operations module
- **`/inventory`**, **`/inventory/item/:itemId`**, **`/inventory/categories`**, **`/inventory/suppliers`** → inventory module
- **Harvest entrypoint**
  - **`/harvest`** → redirects by crop module:
    - tomatoes → `/tomato-harvest/:projectId?`
    - french beans collections → `/harvest-collections/:projectId?`
    - default → `/harvest-sessions/:projectId?`
  - **`/harvest-sessions/:projectId?`**, **`/harvest-sessions/:projectId/session/:sessionId`**
  - **`/harvest-collections/:projectId?`**
  - **`/tomato-harvest/:projectId?`**, **`/tomato-harvest/:projectId/session/:sessionId`**
  - **`/harvest-sales`**, **`/harvest-sales/harvest/:harvestId`**
- **Broker portal**
  - **`/broker`**
  - **`/broker/harvest/:dispatchId`**
  - **`/broker/harvest-fallback/:dispatchId`**
  - **`/broker/harvest-sales`** → redirect to `/broker`
  - **`/broker/expenses`**
- **`/suppliers`**, **`/employees`**, **`/employees/:employeeId`**, **`/reports`**
- **`/billing`** → settings permission + `RequireBillingAccess`
- **`/settings`**
- **`/support`**, **`/feedback`**
- **Records**
  - **`/records`**
  - **`/records/:cropSlug`**
  - **`/records/:cropSlug/new`**
  - **`/records/:cropSlug/:noteId`**

#### Staff workspace (`/staff/*`)
- index → redirect to `/staff/staff-dashboard`
- `staff-dashboard`, `operations`, `inventory`, `inventory/item/:itemId`, `expenses`, `reports`, `harvest` (entry route), `harvest-sessions*`, `tomato-harvest*`, `harvest-collections*`, `farms/:farmId`, plus support/feedback.

Legacy redirects:
- **`/manager`**, **`/manager/*`**, **`/driver`** → redirect to `/staff/staff-dashboard`

#### Developer/admin consoles
- Legacy `/admin/*` and `/dev/*` routes guarded by `RequireDeveloper`
- New console under `/developer/*` guarded by `DeveloperRoute`

#### 404
- `*` → `NotFound`

### 1.2 Bottom nav + “More” menu → routes
From `src/config/navConfig.tsx` + filtering logic in `BottomNav.tsx` and `MobileMoreDrawer.tsx`.

- **Company**
  - Bottom: `/dashboard`, `/employee-dashboard`, `/projects`, `/operations`, `/inventory`
  - More: `/expenses`, `/harvest`, `/suppliers`, `/employees`, `/records`, `/reports`, `/billing`, `/settings`, `/support`, `/feedback`
- **Staff**
  - Bottom: `/staff/staff-dashboard`, `/staff/operations`, `/staff/inventory`
  - More: `/staff/harvest`, `/staff/expenses`, `/staff/reports`, `/settings`, `/staff/support`, `/staff/feedback`
- **Broker**
  - Bottom: `/broker`, `/broker/expenses`
  - More: `/settings`, `/support`, `/feedback`
- **Developer**
  - Bottom: `/developer`, `/developer/companies`, `/developer/users`, `/developer/billing-confirmation`
  - More: `/developer/qr`, `/developer/settings`, `/developer/finances`, `/developer/subscription-analytics`, `/developer/farmvault-expenses`, `/developer/backups`, `/developer/code-red`, `/developer/feedback-inbox`, `/developer/audit-logs`, `/developer/email-center`, `/developer/integrations`, `/developer/records`, `/developer/company-migrations`, `/developer/documents`

### 1.3 Modals/drawers/sheets/dialogs (inventory basis)
Modal-like components found by filename pattern (examples confirmed):
- Inventory: `AddInventoryItemModal`, `RecordStockInModal`, `RecordUsageModal`, `DeductStockModal`, `InventoryAuditDrawer`, `InventoryItemDrawer`, `ArchiveConfirmDialog`
- Operations: `PlanWorkModal`, `LogWorkModal`, `WorkCardDrawer`, `WorkCardDetailsDrawer`
- Subscription: `UpgradeModal`
- Notifications: `NotificationSetupModal`
- Broker: `BrokerBuyerLedgerDialog`

## 2. Data Model

### 2.1 Supabase object counts (parsed across `supabase/migrations/*.sql`)
- Tables created: **153**
- SQL functions created: **319**
- Policies created: **626**

### 2.2 Schemas present
`public`, `core`, `projects`, `harvest`, `finance`, `inventory`, `ops`, `admin`, `developer` (and billing objects split between `core`/`billing` depending on migration generation).

### 2.3 Extracted examples (full definitions confirmed in migrations already inspected)
- `public.companies`, `public.profiles`, `public.company_members`
- `public.mpesa_stk_callbacks`, `public.mpesa_payments`
- `public.rate_limits`
- `public.push_subscriptions`, `public.notifications` (+ push dispatch trigger)
- `public.email_logs`
- `core.profiles`, `core.companies`, `core.company_members`
- `projects.projects`, `projects.project_stages`, `projects.stage_notes`
- `finance.expenses`
- `harvest.*` (harvest collections + fallback engine + tomato broker market notebook)

### 2.4 Edge Functions (selected confirmed)
`create-company`, `invite-employee`, `revoke-employee-invite`, `resend-employee-invite`, `mpesa-stk-callback`, `billing-receipt-issue`, `rate-limit-check`.

### 2.5 Frontend Realtime subscriptions (confirmed hooks)
- `useCompanySubscriptionRealtime`
- `useBillingPrices`
- `useBrokerTomatoRealtime`
- `useTomatoHarvestDashboardRealtime`
- `useTomatoHarvestLogsRealtime`
- `useFallbackHarvestRealtime`
- `useAdminAlertsRealtime`
- `useAmbassadorProgramRealtime`

## 3. Feature Completeness

Dashboard, Projects, Operations, Inventory, Expenses, Harvest (Collections/Tomato/Fallback), Broker Portal, Records, Employees, Reports, Billing, Settings, Developer Console, Ambassador Portal all have route-level UI pages.

Durable offline queue support is implemented for **Harvest Collections intake/payment/wallet entries** only; other modules rely on online writes and/or brief cached reads.

## 4. Auth & Access Control

### Roles
Normalized app roles: `developer`, `company-admin`, `employee` (legacy: `manager`, `broker`, `driver`).

Canonical employee role gate: `ADMIN | WORKER | BROKER`.

### Permissions
- Module/action PermissionMap used by `PermissionRoute` and nav gating.
- Flat permission keys used by employee permission editor.

### Auth flow
Clerk JWT template: **`supabase`**. Token is injected into Supabase requests, DB reads `auth.jwt()->>'sub'` and tenant context is resolved via `current_context()` RPC.

## 5. Crop-Specific Logic

### `cropModules.ts`
- French beans → `harvest-collections`, `picker-payments`
- Tomatoes → `tomato-harvest`, `grading`, `sorting`
- Default → `fallback-harvest`

### `cropCatalog.ts` built-ins
Tomatoes, French Beans, Capsicum, Watermelon, Maize, Rice (cycle days + stages + environment modifiers).

High-impact branching is in `harvestNavigation.ts`, `HarvestSalesPage.tsx`, staff nav locking, harvest collections aggregation, and some UI badges.

## 6. Offline & PWA

### Service worker caching
- Precache build assets via Workbox injectManifest
- Never cache Clerk, Supabase auth, Supabase realtime
- Cache Supabase REST/Storage reads with NetworkFirst for 5 minutes
- Cache app shell assets with CacheFirst for 30 days

### Offline queue
Dexie outbox types: `intake`, `payment`, `wallet_entry` with retry/backoff and sync triggers from connectivity context.

## 7. Integrations

- **M-Pesa**: STK push, callback persistence, optional STK query verification, reconcile job, Kenya phone normalization, Nairobi timezone.
- **Clerk**: JWT template `supabase`.
- **PostHog**: explicit event-name constants + `$pageview` tracking.
- **OneSignal** + **Web Push**: push dispatch functions, client tags, templates include hard-coded payout message.
- **Resend**: email sending + logging.

## 8. Known Gaps & Tech Debt

- Candidate unused dependency: `mongodb` (present in deps, no `src/` imports found).
- Inventory audit logs may be missing in prod if only `supabase/migrations/*` are applied (code points to `docs/migrations/001_inventory_audit_logs.sql`).
- Many redirect-only legacy routes are kept for backwards compatibility.
- Generated Workbox bundle in `dev-dist` contains many TODOs (noise).

## 9. Performance & Scale Concerns

- Unpaginated `select('*')` loads in Records “Full Knowledge”.
- Report exports and inventory read model use `select('*')` without pagination/range.
- No bundle analyzer; risk of chunk size regressions.

## 10. Business Logic Rules

- Pricing tiers hard-coded in UI and shared billing maps:
  - Basic: 2500/month, 8500/seasonal, 24000/annual
  - Pro: 5000/month, 15000/seasonal, 48000/annual
- DB seeds show **Pro seasonal = 14000** (mismatch vs UI maps).
- Trial default: **7 days**.
- Subscription enforcement uses status allowlist/denylist in `SubscriptionAccessGate`.
- Kenya-specific logic: M-Pesa, phone normalization, timezone.

## SUMMARY: Top 10 Most Important Findings

1. Schema complexity is high (153 tables / 319 functions / 626 policies), with legacy `public.*` and newer multi-schema models coexisting.
2. Pricing mismatch bug: Pro seasonal is 14,000 in DB seeds vs 15,000 in UI maps.
3. Offline-first is real but narrow: durable outbox exists only for Harvest Collections intake/payment/wallet.
4. Records “Full Knowledge” loads all rows before paginating UI.
5. Export services and inventory read models fetch `select('*')` without pagination.
6. Inventory audit logging may be silently absent if only `supabase/migrations` are deployed.
7. Clerk→Supabase auth bridge is centralized and consistent (`supabase` JWT template + `current_context()`).
8. Crop module branching is hard-coded (tomatoes/french beans special; others fallback) and some checks compare raw strings without normalization.
9. M-Pesa integration is extensive (callback + verify + reconcile), but ensure sandbox constants aren’t confused with production secrets.
10. Windows path duplication risk in git state suggests duplicated source trees may exist and diverge.

