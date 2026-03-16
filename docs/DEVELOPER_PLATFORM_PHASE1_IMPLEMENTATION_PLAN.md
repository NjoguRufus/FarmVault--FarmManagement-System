# Developer Platform Phase 1 — Implementation Plan

**Scope:** Developer Home, Companies, Users, Billing Confirmation, Billing only.  
**Goal:** Rebuild these five pages fully on Supabase and remove all Firebase/stub dependency.  
**Reference:** [DEVELOPER_ADMIN_AUDIT.md](./DEVELOPER_ADMIN_AUDIT.md).

---

## Overview

Phase 1 covers:

1. **Developer Home** — Platform KPIs and quick links  
2. **Companies** — Company list, detail, subscription override, payment reminder  
3. **Users** — Platform-wide users and company assignment  
4. **Billing Confirmation** — Trial companies + pending payment approvals  
5. **Billing** — Payment review, filters, approve/reject, overrides

All data must come from **Supabase** (core, billing, public as applicable). No `useCollection`, no `@/lib/firebase`, no `@/lib/firestore-stub` in these pages or their dedicated services/hooks.

---

## 1. Developer Home

### 1.1 Exact purpose

Single entry page for developers: show high-level platform metrics (companies, users, members, subscriptions, pending payments), optional “system health” line, and quick links to Companies, Billing Confirmation, Billing, Users. Read-only; no write actions on this page.

### 1.2 Supabase data sources

- **RPC (primary):** `admin.dev_dashboard_kpis()`  
  Returns one row: `companies_total`, `users_total`, `members_total`, `subscriptions_total`, `payments_total`, plus legacy counts (`public_companies_total`, etc.) if needed.  
- **Optional for “pending” badge:** Count of pending payments (can be derived from same RPC if it exposes `pending_payments` or from a separate small query).

### 1.3 Tables / RPCs required

| Source | Type | Notes |
|--------|------|--------|
| `admin.dev_dashboard_kpis()` | RPC | **Exists** in `20260305000020_auth_core_admin_dashboard.sql`. Returns companies_total, users_total, members_total, subscriptions_total, payments_total. Reads core.companies, core.profiles, core.company_members; optionally billing.company_subscriptions and billing.payments. |
| core.companies, core.profiles, core.company_members | Tables | **Exist.** |
| billing.company_subscriptions, billing.payments | Tables | **May not exist.** RPC checks at runtime and returns 0 if missing. |

**Client call:** App uses `supabase.rpc('dev_dashboard_kpis')`. Supabase client calls **public** schema by default. **Missing piece:** Either create `public.dev_dashboard_kpis()` that calls `admin.dev_dashboard_kpis()`, or ensure the app can invoke the admin function (e.g. via `supabase.schema('admin').rpc('dev_dashboard_kpis')` if supported in your client version).

### 1.4 Page sections

- **Header:** Title “Developer Home” or “Platform Overview”, subtitle, “Developer Admin” badge.
- **Stats row:** 4–5 cards: Companies (total), Users (total), Members (total), [Subscriptions], [Pending payments]. Use KPI fields from RPC; label clearly.
- **System health:** One line or card: “All core services operational” or from a future health check (Phase 1 can stay static).
- **Quick links:** Buttons or links to Companies, Users, Billing Confirmation, Billing (and optionally Subscription Analytics). Same links as sidebar for consistency.

### 1.5 Filters

None (single global snapshot).

### 1.6 Actions

- **Refresh:** Button to refetch `dev_dashboard_kpis()`.
- **Navigate:** Links to `/developer/companies`, `/developer/users`, `/developer/billing-confirmation`, `/developer/billing`.

### 1.7 Required services / hooks

- **Service:** `developerAdminService.getDevDashboardKpis()` — **already exists** and calls `supabase.rpc('dev_dashboard_kpis')`. Ensure RPC is callable (see 1.3).
- **Hook (optional):** `useDevDashboardKpis()` — `useQuery` key `['dev-dashboard-kpis']`, `queryFn: getDevDashboardKpis`, no Firebase.

### 1.8 Missing SQL / backend pieces

- **Public RPC wrapper (if needed):**  
  `create or replace function public.dev_dashboard_kpis()`  
  returns same table as `admin.dev_dashboard_kpis()`  
  language sql security definer set search_path = admin, core, public  
  as $$ select * from admin.dev_dashboard_kpis() $$;  
  grant execute on function public.dev_dashboard_kpis() to authenticated;
- **Pending payments count:** If KPIs RPC does not return a “pending_payments” column, add it (e.g. count from billing.payments where status = 'pending', or from public.subscription_payments if that’s the source of truth) so the home page can show “N pending payments” without an extra round-trip.

### 1.9 Migration notes (from current broken logic)

- **Current:** AdminDashboard uses `useCollection` for companies, users, employees (Firestore stub → empty). DeveloperDashboard (unused in routes) uses `getDevDashboardKpis` (Supabase) + `useCollection` for companies table.
- **Migration:** Remove all `useCollection` usage from the Developer Home page. Use only `getDevDashboardKpis()`. Delete or repurpose the duplicate DeveloperDashboard component; single page only. Map RPC result columns to UI (e.g. `companies_total` → Companies card); handle legacy column names if RPC returns different names (e.g. `members_total` vs employees).

### 1.10 Recommended route

- **Canonical:** `/developer` or `/developer/home`.
- **Old route:** Keep `/admin` and `/dev/dashboard` as **redirects** to `/developer` (or `/developer/home`) temporarily so bookmarks and nav continue to work.

---

## 2. Companies

### 2.1 Exact purpose

List all companies with subscription and billing context; open a company detail (projects count, members count, subscription status, payment reminder); perform actions: set/clear payment reminder, override subscription (trial, free_until, free_forever, paid_active). Optional: create company (if still required).

### 2.2 Supabase data sources

- **Company list:** RPC `admin.list_companies()` — returns company_id, company_name, subscription_status, plan_code, billing_mode, billing_cycle, is_trial, trial_ends_at, active_until. **Exists** but depends on `billing.company_subscriptions`; if that table doesn’t exist, RPC returns no rows.
- **Company detail:** Single company by id: core.companies (name, logo_url, created_at, subscription jsonb if stored there) + project count + member count. Prefer:
  - `companyService.getCompany(companyId)` — **exists**, uses `db.core().from('companies').select('*').eq('id', companyId)`. Ensure core.companies has the columns the UI needs (e.g. subscription for payment reminder).
  - Project count: `db.projects().from('projects').select('*', { count: 'exact', head: true }).eq('company_id', companyId)` or an RPC.
  - Member count: `db.core().from('company_members').select('*', { count: 'exact', head: true }).eq('company_id', companyId)` or same RPC.
- **Override subscription:** RPC `override_subscription` — **called by app but not found in migrations.** Must be implemented (see 2.8).
- **Payment reminder:** `companyService.setPaymentReminder`, `companyService.clearPaymentReminder` — **exist** and use core.companies update (subscription jsonb).

### 2.3 Tables / RPCs required

| Source | Type | Status |
|--------|------|--------|
| core.companies | Table | **Exists.** |
| core.company_members | Table | **Exists.** |
| projects.projects (or public.projects) | Table | **Exists** (projects schema or public). |
| billing.company_subscriptions | Table | **Referenced by admin.list_companies();** may live in public as company_subscriptions. If list_companies uses billing.company_subscriptions, create that table or point RPC at public.company_subscriptions. |
| admin.list_companies() | RPC | **Exists;** returns empty if billing.company_subscriptions missing. |
| companyService.getCompany | Service | **Exists** (Supabase). |
| companyService.setPaymentReminder / clearPaymentReminder | Service | **Exists.** |
| override_subscription | RPC | **Missing** — see 2.8. |

### 2.4 Page sections

- **Header:** Title “Companies”, subtitle, “Add company” button (if feature kept).
- **List/table:** Rows: company name, subscription status, plan, billing mode, trial end (if trial), actions (View detail, Override, Set reminder). Data from `list_companies` RPC (or fallback list from core.companies if RPC empty).
- **Detail panel/drawer/sheet:** When a company is selected: name, id, project count, member count, subscription summary, payment reminder status, buttons: Set payment reminder, Clear reminder, Override subscription. Load detail via getCompany + project count + member count queries.

### 2.5 Filters

- Optional: search by company name (client-side filter on list or server param if RPC supports it).
- Optional: filter by subscription status (trial / active / expired) — client-side or extend list_companies to accept status filter.

### 2.6 Actions

- **View detail:** Open detail panel; load company + counts.
- **Set payment reminder:** Call companyService.setPaymentReminder(companyId, nextPaymentAt).
- **Clear payment reminder:** Call companyService.clearPaymentReminder(companyId).
- **Override subscription:** Open modal; form (mode, days, until, plan_code, etc.); call developerAdminService.overrideSubscription(input). Requires RPC.
- **Add company (optional):** If still needed, use existing create company flow (Supabase/Clerk) and invalidate list.

### 2.7 Required services / hooks

- **developerAdminService.listCompanies()** — **exists**; calls `supabase.rpc('list_companies')`. Ensure public wrapper if needed (same as dev_dashboard_kpis).
- **developerAdminService.overrideSubscription(input)** — **exists**; calls `supabase.rpc('override_subscription', …)`. RPC must exist.
- **companyService.getCompany, setPaymentReminder, clearPaymentReminder** — **exist.**
- **Hooks:**  
  - `useQuery(['list-companies'], listCompanies)` for list.  
  - `useQuery(['company-detail', companyId], () => getCompany(companyId))` when companyId set.  
  - `useQuery(['company-projects-count', companyId], …)` and similar for member count, or one `companyDetail` query that fetches company + counts (or a small RPC that returns company + project_count + member_count).

### 2.8 Missing SQL / backend pieces

- **override_subscription RPC:**  
  - Signature (match frontend): `_company_id`, `_mode`, `_days`, `_until`, `_plan_code`, `_billing_mode`, `_billing_cycle`, `_note`, `_reason`.  
  - Logic: gated by `admin.is_developer()`; update billing.company_subscriptions or public.company_subscriptions (and optionally core.companies subscription jsonb) to set trial, free_until, paid_active, etc.  
  - Create in billing or public schema and grant execute to authenticated.
- **Public list_companies wrapper (if needed):**  
  `public.list_companies()` → `select * from admin.list_companies()` with same grants.
- **billing.company_subscriptions vs public.company_subscriptions:**  
  admin.list_companies() joins core.companies with **billing.company_subscriptions**. If only public.company_subscriptions exists, either (a) create billing.company_subscriptions and sync, or (b) add/admin RPC that reads public.company_subscriptions and returns the same shape. Prefer (a) for consistency with auth_core_admin_dashboard.

### 2.9 Migration notes

- **Current:** AdminCompaniesPage uses useCollection (companies, projects, users) + getCompany + direct Firestore getDocs(projects, employees). Stub returns empty; getCompany works.
- **Migration:** Replace useCollection with listCompanies() for list. Replace Firestore project/employee queries with Supabase project count and company_members count (or one detail RPC). Keep getCompany and payment reminder logic. Remove all Firestore/firebase imports from this page.

### 2.10 Recommended route

- **Canonical:** `/developer/companies`.
- **Old route:** Keep `/admin/companies` as **redirect** to `/developer/companies` temporarily.

---

## 3. Users

### 3.1 Exact purpose

Show platform-wide list of users (non-developers): email, role, linked company, created date. Allow search/filter by email or company. Optional: link user to company (assign company) or view profile. Read-only in Phase 1 unless “assign company” is in scope.

### 3.2 Supabase data sources

- **User list:** Must come from Supabase. Options:  
  - **Option A:** core.profiles (clerk_user_id, email, full_name, active_company_id) joined with core.company_members to get role and company_id. Exclude users who appear in admin.developers.  
  - **Option B:** New RPC `admin.list_platform_users()` that returns id, email, full_name, company_id, company_name, role, created_at for each profile, excluding developers.  
- **Company names:** For “Company” column, either join to core.companies in the same query/RPC or fetch companies list once and map in frontend.

### 3.3 Tables / RPCs required

| Source | Type | Status |
|--------|------|--------|
| core.profiles | Table | **Exists** (clerk_user_id, email, full_name, active_company_id, created_at, updated_at). |
| core.company_members | Table | **Exists** (company_id, clerk_user_id, role). |
| core.companies | Table | **Exists** (id, name). |
| admin.developers | Table | **Exists** (clerk_user_id). Used to exclude developers from “users” list. |
| admin.list_platform_users() or equivalent | RPC | **Does not exist.** Must be created (see 3.8). |

### 3.4 Page sections

- **Header:** Title “Users”, subtitle “All non-developer users across tenants.”
- **Table:** Columns: Email, Full name, Role, Company, Created. Rows from RPC or from profiles + company_members + companies query. Optional: Actions column (e.g. “Assign company” link for users with no company).

### 3.5 Filters

- Search by email or full name (client-side or server-side via RPC param).
- Filter by company (dropdown of companies; show only users in that company).
- Optional: filter by role (company_admin, member, etc.).

### 3.6 Actions

- **Phase 1:** Read-only; optional “View” link to user profile if such a route exists.
- **Later:** “Assign company” (add/update company_members row or update profile active_company_id). Can be deferred to Phase 2.

### 3.7 Required services / hooks

- **Service:** e.g. `developerUserService.listPlatformUsers(filters?)` calling new RPC `admin.list_platform_users` (or public wrapper).
- **Hook:** `usePlatformUsers(filters)` — useQuery key `['platform-users', filters]`, queryFn calling listPlatformUsers. No Firebase.

### 3.8 Missing SQL / backend pieces

- **RPC admin.list_platform_users():**  
  - Returns: user_id (clerk_user_id), email, full_name, company_id, company_name, role, created_at.  
  - Logic: from core.profiles p left join lateral (select company_id, role from core.company_members m where m.clerk_user_id = p.clerk_user_id order by created_at desc limit 1) m on true left join core.companies c on c.id = m.company_id where not exists (select 1 from admin.developers d where d.clerk_user_id = p.clerk_user_id). Order by p.created_at desc.  
  - Gate with admin.is_developer().  
  - Grant execute to authenticated; add public wrapper if client can’t call admin.
- **Indexes:** company_members(clerk_user_id), profiles(created_at) if not already present.

### 3.9 Migration notes

- **Current:** AdminUsersPage uses useCollection for users and companies (Firestore stub → empty).
- **Migration:** Remove useCollection. Implement list_platform_users RPC and frontend service/hook. Table displays RPC result. Handle “no company” as “Unassigned” in UI.

### 3.10 Recommended route

- **Canonical:** `/developer/users`.
- **Old route:** Keep `/admin/users` as **redirect** to `/developer/users` temporarily.

---

## 4. Billing Confirmation

### 4.1 Exact purpose

Show companies on trial with “days remaining” and any pending subscription payment; let developer open the payment review flow (e.g. to Billing page with focus on that company/payment). Focus: “Companies awaiting payment confirmation” and “Pending payments” in one place.

### 4.2 Supabase data sources

- **Trial companies:** From company list with subscription: companies where subscription is trial or trial_ends_at is set. Prefer RPC that returns companies with trial_ends_at, plan, status (e.g. extend list_companies or add admin.list_trial_companies()).
- **Pending payments:** Payments with status = 'pending'. Source: public.subscription_payments (if that’s the table in use) or billing.payments. Need a developer-scoped query or RPC that returns pending rows with company_id, company_name, amount, plan, created_at, etc.

### 4.3 Tables / RPCs required

| Source | Type | Status |
|--------|------|--------|
| core.companies | Table | **Exists.** |
| billing.company_subscriptions or public.company_subscriptions | Table | **Exists** (public.company_subscriptions in migrations). |
| public.subscription_payments | Table | **Exists** (farmvault_schema): id, company_id, plan_id, amount, status, billing_mode, created_at, approved_at, etc. |
| admin.list_companies() | RPC | **Exists;** can filter client-side for is_trial = true and trial_ends_at. |
| List pending payments | Query or RPC | **Missing.** Need developer-only select on subscription_payments where status = 'pending' (RLS or RPC). |

### 4.4 Page sections

- **Header:** Title “Billing Confirmation”, subtitle “Companies on trial and pending payment confirmations.”
- **Trial companies block:** List of companies on trial: name, trial end date, days remaining, “Pending payment” badge if they have a pending payment row. Link/button: “Review payment” → Billing page (e.g. `/developer/billing?company=:id` or open payment drawer).
- **Pending payments block:** Table or list of pending payments: company, amount, plan, date, “Approve” / “Reject” (or “Review” → Billing). Reuse same approve/reject as Billing page.

### 4.5 Filters

- Optional: sort trial by “days remaining” or “has pending payment”.
- Optional: date range for pending payments.

### 4.6 Actions

- **Review payment:** Navigate to Billing with company/payment context or open payment review drawer (shared with Billing).
- **Approve / Reject:** Same as Billing (call approve/reject service). Can be implemented on Billing page and linked from here, or inline here using shared service.

### 4.7 Required services / hooks

- **Service:** List trial companies — use listCompanies() and filter client-side for is_trial, or add RPC admin.list_trial_companies(). List pending payments: new function listPendingPayments() using db.public().from('subscription_payments').select(...).eq('status','pending') with RLS allowing developers, or RPC admin.list_pending_payments().
- **Hooks:** useQuery for trial companies (or reuse list_companies and filter); useQuery for pending payments. Approve/reject: reuse same service as Billing (see 5.7).

### 4.8 Missing SQL / backend pieces

- **RLS for subscription_payments (developer read):** Policy so that authenticated users with admin.is_developer() = true can select all rows (or at least status, company_id, amount, etc.). Existing migration 20260305000018 may have subscription_payments_dev_read_all on public.subscription_payments — verify and add if missing.
- **RPC (optional):** admin.list_pending_payments() returning id, company_id, company_name, amount, plan_id, billing_mode, created_at, etc., for status = 'pending'. Simplifies frontend and keeps RLS in one place.
- **Trial list:** Either use list_companies (if it returns is_trial, trial_ends_at) and filter, or add admin.list_trial_companies() for clarity.

### 4.9 Migration notes

- **Current:** AdminPendingUsersPage uses useCollection for companies and subscriptionPayments (Firestore stub → empty). Computes “trial” from subscription/trialEndsAt and merges with pending payments by company.
- **Migration:** Replace with Supabase: trial companies from list_companies (filter) or new RPC; pending payments from subscription_payments (query or RPC). Remove useCollection. Keep “days remaining” and “pending payment” badge logic in UI; data from Supabase.

### 4.10 Recommended route

- **Canonical:** `/developer/billing-confirmation`.
- **Old route:** Keep `/admin/users/pending` as **redirect** to `/developer/billing-confirmation` temporarily.

---

## 5. Billing

### 5.1 Exact purpose

Payment review and subscription overrides: list payments with filters (status, billing mode, plan, date range, search); open payment review drawer (details, proof, approve/reject); show override modal for a company; show counts (pending, approved today, approved this month, active overrides). All data from Supabase.

### 5.2 Supabase data sources

- **Payments list (paginated/filtered):** public.subscription_payments (or billing.payments). Columns: id, company_id, company_name (join or RPC), plan_id, amount, status, billing_mode, created_at, approved_at, reviewed_by, etc. Filter by status, billing_mode, plan, date range, search (company name/id).
- **Overrides:** public.company_subscriptions (or billing.company_subscriptions) where override.enabled = true; or from list_companies with override flag.
- **Approve / Reject:** Update subscription_payments set status, approved_at/rejected_at, reviewed_by, reviewed_at. Require RLS or RPC so only developers can update.

### 5.3 Tables / RPCs required

| Source | Type | Status |
|--------|------|--------|
| public.subscription_payments | Table | **Exists.** |
| public.company_subscriptions (or billing) | Table | **Exists** (public). |
| core.companies | Table | **Exists** (for company name in list). |
| RPC or query for paginated/filtered payments | RPC/Query | **Missing.** useAdminSubscriptionPayments is Firestore. Replace with Supabase query or RPC that supports status, billing_mode, plan, date range, search, limit, offset. |
| Approve / Reject payment | Update / RPC | **Missing.** Need developer-only update on subscription_payments (RLS or RPC approve_subscription_payment, reject_subscription_payment). |

### 5.4 Page sections

- **Header:** Title “Billing”, subtitle. Summary chips: Pending count, Approved today, Approved this month, Active overrides.
- **Filters:** Status (pending / approved / rejected / all), Billing mode, Plan, Date range, Search (company name or id).
- **Payments table:** Columns: Company, Plan, Amount, Status, Date, Actions (Review, Approve, Reject). Pagination or “Load more”.
- **Payment review drawer:** Selected payment: details, proof (if stored), Approve / Reject buttons. Calls approve/reject service.
- **Override modal:** Same as Companies page — override subscription for a company (reuse developerAdminService.overrideSubscription when RPC exists).

### 5.5 Filters

- Status: pending | approved | rejected | all.
- Billing mode: all | monthly | seasonal | annual.
- Plan: all | basic | pro (or your plan codes).
- Date range: 7d | 30d | all.
- Search: company name or company_id (server-side if RPC, else client-side on current page).

### 5.6 Actions

- **Approve payment:** Set status = approved, approved_at = now(), reviewed_by = current user. Optionally trigger subscription period update.
- **Reject payment:** Set status = rejected, rejected_at = now(), reviewed_by = current user.
- **Open override modal:** Per company; same as Companies override.

### 5.7 Required services / hooks

- **Service:**  
  - listPayments(filters, pagination) — Supabase from subscription_payments with filters and order by created_at desc, range for page. Or RPC admin.list_payments(_status, _billing_mode, _plan, _date_from, _date_to, _search, _limit, _offset).  
  - approvePayment(paymentId) — update row or call RPC admin.approve_subscription_payment(_payment_id).  
  - rejectPayment(paymentId) — update row or RPC admin.reject_subscription_payment(_payment_id).
- **Hooks:**  
  - useAdminBillingPayments(filters, page) — useQuery/useInfiniteQuery key ['admin-billing-payments', filters, page], queryFn listPayments. No Firestore.  
  - useMutation for approve/reject; invalidate payments query on success.

### 5.8 Missing SQL / backend pieces

- **RLS on subscription_payments:** Developers must be able to select all rows and update status/reviewed fields. Add policy: for select, allow where admin.is_developer(); for update, allow where admin.is_developer() (and optionally restrict to status transition pending → approved/rejected).
- **RPCs (optional but recommended):**  
  - admin.list_payments(...) — returns payment rows with company name, with filters and pagination.  
  - admin.approve_subscription_payment(_payment_id) — sets status, approved_at, reviewed_by (current user).  
  - admin.reject_subscription_payment(_payment_id) — sets status, rejected_at, reviewed_by.  
  This keeps business rules (e.g. only pending can be approved) in one place.
- **Override:** Same as Companies — override_subscription RPC must exist.

### 5.9 Migration notes

- **Current:** AdminBillingPage uses useAdminSubscriptionPayments (Firestore onSnapshot + pagination), useCollection for subscriptions and pending/approved payments and overrides. All stub/empty or throw on write.
- **Migration:** Remove useAdminSubscriptionPayments and useCollection. Implement listPayments (Supabase), approvePayment, rejectPayment (Supabase update or RPC). Reuse PaymentReviewDrawer and OverrideModal components; wire to new services. Counts (pending, approved today/month, overrides) from same Supabase data or small aggregate queries/RPC.

### 5.10 Recommended route

- **Canonical:** `/developer/billing`.
- **Old route:** Keep `/admin/billing` as **redirect** to `/developer/billing` temporarily.

---

## 6. Shared DeveloperLayout / sidebar

### 6.1 Recommendation

- **Option A (minimal):** Keep current setup: single **MainLayout**, sidebar driven by `getNavItemsForSidebar(user)`. When `user.role === 'developer'`, use `developerNavConfig`. No new layout component; only update **paths** in `developerNavConfig` to point to `/developer/*` when Phase 1 routes are added.
- **Option B (dedicated layout):** Add **DeveloperLayout** used only for routes under `/developer/*` (and optionally `/dev/diagnostics`). DeveloperLayout renders a sidebar with the same nav items but ensures all links are `/developer/...` and no company-scoped nav leaks. Outlet for child routes. Use this if you want a clear visual and code split between “company app” and “developer app.”

**Suggested for Phase 1:** Option A. Change nav config so developer items point to canonical routes (e.g. `/developer`, `/developer/companies`, `/developer/users`, `/developer/billing-confirmation`, `/developer/billing`). After route refactor (see §9), both `/admin` and `/admin/companies` etc. redirect to `/developer` and `/developer/companies`; sidebar already uses `/developer/*`, so one source of truth.

### 6.2 Sidebar nav items (Phase 1 only)

Update `developerNavConfig` to:

- Admin Home → path: `/developer` (or `/developer/home`)
- Companies → path: `/developer/companies`
- Users → path: `/developer/users`
- Billing Confirmation → path: `/developer/billing-confirmation`
- Finances → path: `/admin/finances` (unchanged for Phase 1; not in scope)
- Subscription Analytics → path: `/admin/analytics/subscriptions` (unchanged)
- FarmVault Expenses → path: `/admin/expenses` (unchanged)
- Backups → path: `/admin/backups` (unchanged)
- Code Red → path: `/admin/code-red` (unchanged)
- Feedback inbox → path: `/admin/feedback` (unchanged)
- Audit Logs → path: `/admin/audit-logs` (unchanged)
- Records → path: `/developer/records` (unchanged)

Add a **Billing** entry if not present: path `/developer/billing` (so “Billing Confirmation” and “Billing” are both visible, or merge labels as desired).

---

## 7. Recommended build order (Phase 1)

1. **Backend first (unblock all pages)**  
   - Add public wrappers for `dev_dashboard_kpis` and `list_companies` if client cannot call admin schema.  
   - Implement `override_subscription` RPC (billing or public).  
   - Ensure `billing.company_subscriptions` exists and is populated (or that `list_companies` can read from public.company_subscriptions).  
   - Implement `admin.list_platform_users()` (+ public wrapper).  
   - Implement pending payments access: RLS on public.subscription_payments for developers and/or `admin.list_pending_payments()`.  
   - Implement approve/reject: RLS update or RPCs `approve_subscription_payment`, `reject_subscription_payment`.  
   - Optional: `admin.list_payments(...)` for Billing page filters/pagination.

2. **Developer Home**  
   - New page component (or refactor AdminDashboard).  
   - useQuery getDevDashboardKpis; map result to stats cards and quick links.  
   - Route: `/developer` (or `/developer/home`).  
   - No Firebase/useCollection.

3. **Companies**  
   - New page component (or refactor AdminCompaniesPage).  
   - useQuery listCompanies; detail via getCompany + project/member counts.  
   - Wire setPaymentReminder, clearPaymentReminder, overrideSubscription.  
   - Route: `/developer/companies`.  
   - Remove all Firestore usage.

4. **Users**  
   - New page component (or refactor AdminUsersPage).  
   - useQuery listPlatformUsers (new service + RPC).  
   - Table with email, role, company, created.  
   - Route: `/developer/users`.  
   - Remove useCollection.

5. **Billing Confirmation**  
   - New page component (or refactor AdminPendingUsersPage).  
   - Trial companies (from list_companies filter or RPC) + pending payments (query or RPC).  
   - Links to Billing; optional inline approve/reject using shared service.  
   - Route: `/developer/billing-confirmation`.  
   - Remove useCollection.

6. **Billing**  
   - New page component (or refactor AdminBillingPage).  
   - useQuery/useInfiniteQuery listPayments (new Supabase service).  
   - Filters, table, payment review drawer, approve/reject, override modal.  
   - Route: `/developer/billing`.  
   - Remove useAdminSubscriptionPayments and useCollection.

7. **Route refactor and redirects**  
   - Add routes under `/developer/*` for the five pages.  
   - Add redirects: `/admin` → `/developer`, `/admin/companies` → `/developer/companies`, `/admin/users` → `/developer/users`, `/admin/users/pending` → `/developer/billing-confirmation`, `/admin/billing` → `/developer/billing`.  
   - Update developerNavConfig to use `/developer/*` paths for Phase 1 pages.

8. **Cleanup**  
   - Remove any duplicate components (e.g. DeveloperDashboard if unused).  
   - Remove Firebase/firestore-stub imports from the five pages and their dedicated services/hooks.

---

## 8. What to do before route refactor

- Implement all **backend** pieces (RPCs, RLS, tables) so that Developer Home, Companies, Users, Billing Confirmation, and Billing work **when mounted at their new canonical paths**.  
- Build the **five pages** to use **only Supabase** (no Firebase/stub). You can mount them first at **existing** paths (e.g. `/admin`, `/admin/companies`) to verify behavior, then add canonical routes and redirects.  
- Ensure **RequireDeveloper** (and any role resolution) works with your auth (Clerk + Supabase): developers are identified (e.g. admin.developers or role from JWT) so that developer routes and RPCs are accessible.  
- **Then** do the route refactor: add `/developer`, `/developer/companies`, etc., and redirects from `/admin/*`. This avoids “moving routes first and then finding out RPCs are missing.”

---

## 9. Blockers if backend tables/RPCs do not exist

| Blocker | Impact | Mitigation |
|---------|--------|------------|
| **dev_dashboard_kpis not callable** (e.g. only in admin schema) | Developer Home shows no data or errors. | Add public.dev_dashboard_kpis() wrapper that selects from admin.dev_dashboard_kpis(); grant execute to authenticated. |
| **list_companies returns empty** (billing.company_subscriptions missing) | Companies list empty. | Create billing.company_subscriptions (or migrate public.company_subscriptions into billing) and backfill from public if needed; or change admin.list_companies() to read from public.company_subscriptions. |
| **override_subscription RPC missing** | Cannot override subscription from Companies or Billing. | Implement override_subscription (signature per developerAdminService); gate with admin.is_developer(); update subscription/override state in DB. |
| **list_platform_users RPC missing** | Users page empty. | Implement admin.list_platform_users() (and public wrapper); gate with admin.is_developer(). |
| **No developer read on subscription_payments** | Billing Confirmation and Billing cannot list payments. | Add RLS policy (or RPC) allowing developers to select from subscription_payments; add update policy or RPC for approve/reject. |
| **approve_subscription_payment / reject_subscription_payment missing** | Cannot approve/reject from UI. | Implement RPCs or secure update via RLS; frontend calls service that updates row or calls RPC. |
| **core.companies lacks subscription / payment reminder fields** | companyService.setPaymentReminder may rely on subscription jsonb. | Ensure core.companies has subscription (jsonb) or equivalent; companyService already reads/updates it — confirm schema matches. |

---

## 10. Summary checklist (Phase 1)

- [ ] Public RPC wrappers (or schema-callable) for dev_dashboard_kpis, list_companies.  
- [ ] override_subscription RPC implemented and callable.  
- [ ] billing.company_subscriptions (or list_companies reading public) so company list has subscription data.  
- [ ] admin.list_platform_users() (+ public wrapper) for Users page.  
- [ ] Developer read (and update for approve/reject) on subscription_payments; optional list_payments and approve/reject RPCs.  
- [ ] Developer Home page: Supabase only, route /developer.  
- [ ] Companies page: Supabase only, route /developer/companies.  
- [ ] Users page: Supabase only, route /developer/users.  
- [ ] Billing Confirmation page: Supabase only, route /developer/billing-confirmation.  
- [ ] Billing page: Supabase only, route /developer/billing.  
- [ ] developerNavConfig updated to /developer/* for Phase 1 pages.  
- [ ] Redirects: /admin → /developer, /admin/companies → /developer/companies, etc.  
- [ ] No Firebase or firestore-stub in the five pages or their Phase 1 services/hooks.

This plan is limited to Phase 1; later pages (Finances, Subscription Analytics, FarmVault Expenses, Backups, Code Red, Feedback, Audit Logs, Records) are out of scope until Phase 2.
