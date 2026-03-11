# FarmVault: Access Control & Alerting

## Canonical source of truth

- **Permissions** are the source of truth for access. Role is a **preset/template** only; effective access is computed as **preset defaults + saved permission overrides** (stored in `employees.permissions` as flat keys or nested `PermissionMap`).
- **Effective access** is resolved in one place: `buildEffectivePermissions()` in `AuthContext` (using `resolvePermissions()` from `@/lib/permissions`), then `buildEffectiveAccess()` yields `EffectiveAccess` (landing page, allowed modules, canSeeDashboard, etc.).
- All UI (sidebar, route guards, dashboard route, landing redirect) should use **effective permissions** or **EffectiveAccess**, not raw role name checks.

## Role presets (templates)

Defined in `@/lib/access/rolePresetDefaults.ts`:

| Preset               | DB legacy value(s)        | Default focus              |
|----------------------|---------------------------|----------------------------|
| Administrator        | admin, company_admin      | Full access, dashboard     |
| Operations Manager   | operations-manager, manager, farm_manager, supervisor | Operations, limited dashboard |
| Inventory Staff      | inventory_officer, inventory-clerk | Inventory (all actions audited) |
| Harvest Staff        | weighing_clerk, logistics-driver, sales-broker, broker | Harvest, collections       |
| Finance Staff        | finance_officer           | Financials, harvest totals, buyers |
| Custom               | custom, viewer            | Minimal; admin configures  |

Backward compatibility: any stored role string is mapped to a preset via `roleToPreset()`; default permissions come from `getPresetDefaultPermissions(roleToPreset(role))`. Legacy roles (e.g. `weighing_clerk`, `inventory_officer`) continue to work and are shown in the employee modal under the new labels (e.g. Harvest Staff, Inventory Staff).

## Immediate refresh after role/permission edit

1. Admin saves employee (role and/or permissions) in the employee modal.
2. If the edited employee is the **current user**, the app calls `refreshAuthState()` from `AuthContext`.
3. `refreshAuthState()` refetches the employee profile from the DB, recomputes `buildEffectivePermissions()` and `buildEffectiveAccess()`, updates context state (`user`, `employeeProfile`, `permissions`), and returns `{ landingPage }`.
4. The Employees page then navigates to `result.landingPage` (e.g. `/staff`, `/operations`, `/inventory`) so the user sees their new landing without logging out.
5. Sidebar and route guards read from the same context, so they update on the next render.

No logout required; sidebar, routes, visible modules, and landing all reflect the new access immediately.

## Permission-driven sidebar and routes

- **Sidebar**: `getNavItemsForSidebar(user)` returns the appropriate nav set (developer, company, manager, broker, driver, or staff). For staff, items are then filtered by `can(module, 'view')` in `AppSidebar`, so only modules the user has access to are shown.
- **Route guards**: `PermissionRoute` uses `usePermissions().can(module, actionPath)`; it does not check role names.
- **Dashboard/landing**: `CompanyDashboardRoute` in `App.tsx` uses `effectiveAccess.landingPage` to decide whether to show the company dashboard or redirect to `/manager`, `/broker`, `/driver`, `/staff`, or another allowed page.

## Default landing pages

Resolved in `getLandingPageFromPermissions()` in `@/lib/access/effectiveAccess.ts`:

- Developer → `/admin`
- Company admin → `/dashboard`
- Otherwise by first allowed module: dashboard → `/dashboard`, operations → `/operations`, inventory → `/inventory`, harvest → `/harvest-sales`, expenses → `/expenses`, etc.
- Legacy broker/driver roles still map to `/broker` and `/driver`.

## Alert system

- **Inventory high-risk actions** (edit item, delete item, deduct stock) trigger an immediate **admin alert** via `createAdminAlert()` in `@/services/adminAlertService`. Alerts are written to `public.admin_alerts` (if the table exists) or to a local fallback for in-app display.
- **Severity**: `normal` (audit only) vs `high` (inventory edit/delete/deduct) vs `critical` (reserved for future).
- **Admin Alert Center**: `AdminAlertCenter` component on the company dashboard lists recent alerts with severity, actor, action, target, and time; “View” links to the relevant page (e.g. inventory).
- **Recipients**: `alert_recipients` table stores which users (by `clerk_user_id`) receive in-app and (future) push notifications per company. The app currently shows alerts to any admin viewing the dashboard; recipient filtering and push can be wired later.

## Browser push notifications

- **Scaffold**: `@/services/pushNotificationService` provides `requestNotificationPermission()`, `subscribeToPush(vapidPublicKey)`, and `serializeSubscription(sub)` so the app can request permission, register a service worker, and send the subscription to your backend. Store the VAPID public key in env or `farmvault:push:vapid_public_key` in localStorage; backend should store subscriptions (e.g. per `alert_recipients.clerk_user_id`) and send push via Web Push when high-risk alerts are created.
- **Current**: In-app alerts only; push sending is done by your backend/Edge Function using the stored subscription and the same alert payload.

## DB migrations

- **`20260311000000_admin_alerts_and_inventory_audit_severity.sql`**:
  - Creates `public.admin_alerts` (id, company_id, severity, module, action, actor_user_id, actor_name, target_id, target_label, metadata, detail_path, read, created_at).
  - Creates `public.alert_recipients` (company_id, clerk_user_id, receive_in_app, receive_push) for selecting who gets notifications.
  - RLS is permissive (`using (true)`) so the app can list/insert; the app filters by `companyId` when calling `listAdminAlerts(companyId)`.

Existing employees and role columns are unchanged; new presets are mapped to legacy role values when saving (see `PRESET_TO_LEGACY_ROLE` in `@/lib/access/rolePresetDefaults.ts`).
