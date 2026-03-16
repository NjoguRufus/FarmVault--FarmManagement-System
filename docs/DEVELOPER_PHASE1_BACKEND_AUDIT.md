# Developer Platform Phase 1 — Backend Audit & Implementation Summary

**Date:** 2025-03-15  
**Migration:** `supabase/migrations/20260315100000_developer_platform_phase1_backend.sql`

---

## 1. What already existed (before this migration)

| Object | Location | Notes |
|--------|----------|--------|
| **admin.is_developer()** | 20260305000018, 20260305000020 | Returns true when admin.developers has row for core.current_user_id(). Reused. |
| **public.is_developer()** | 20260310130000 | Wrapper that returns admin.is_developer(). |
| **admin.developers** | 20260305000020 | Table (clerk_user_id, email, role). Populated via admin.bootstrap_developer(_email). |
| **admin.dev_dashboard_kpis()** | 20260305000020 | Returns companies_total, users_total, members_total, subscriptions_total, payments_total, public_* counts. Gated by admin.is_developer(). **Note:** Returns a single row (table return type). Counts billing.company_subscriptions and billing.payments if present; otherwise 0. |
| **admin.list_companies()** | 20260305000020 | Returns company_id, company_name, subscription_status, plan_code, billing_mode, billing_cycle, is_trial, trial_ends_at, active_until. Joins core.companies with **billing.company_subscriptions**. **Returned no rows** before this migration because billing.company_subscriptions did not exist. |
| **core.companies** | 20260305000020 (table), 20260305000016 (view in some DBs) | Canonical companies; id uuid, name, etc. |
| **core.company_members** | 20260305000020 (table), 20260305000016 (view) | company_id, clerk_user_id, role. |
| **core.profiles** | 20260305000020 (table) | clerk_user_id, email, full_name, active_company_id, created_at, updated_at. |
| **public.company_subscriptions** | 20240101000001, 20260305000034 | company_id (uuid or text), plan_id, status, trial_ends_at, override, etc. |
| **public.subscription_payments** | 20240101000001 | id, company_id, plan_id, amount, status, billing_mode, created_at, approved_at, rejected_at, reviewed_at, reviewed_by. RLS: select for company or is_developer; update for is_developer (20240101000002). |
| **subscription_payments_dev_read_all** | 20260305000018 | SELECT for admin.is_developer(). |
| **company_subscriptions** RLS | 20240101000002 | SELECT/INSERT/UPDATE for is_developer or company. |

**Grants:** authenticated has execute on admin.is_developer(), admin.dev_dashboard_kpis(), admin.list_companies().  
**Supabase client:** Calls `supabase.rpc('dev_dashboard_kpis')` and `supabase.rpc('list_companies')` — these resolve to **public** schema. So without public wrappers, RPCs would not be found (404 or “function does not exist”) unless the client is configured to call the admin schema.

---

## 2. What was missing (added in this migration)

| Piece | Purpose |
|-------|--------|
| **billing.company_subscriptions** (view) | So admin.list_companies() can join core.companies with subscription data. View over public.company_subscriptions with column aliases (plan_code, is_trial, active_until, billing_mode, billing_cycle). |
| **billing.payments** (view) | So admin.dev_dashboard_kpis() can count payments. View over public.subscription_payments. |
| **pending_payments_total** in dev_dashboard_kpis | New column in return type; count of public.subscription_payments where status = 'pending'. |
| **public.dev_dashboard_kpis()** | Wrapper so supabase.rpc('dev_dashboard_kpis') works. |
| **public.list_companies()** | Wrapper so supabase.rpc('list_companies') works. |
| **public.override_subscription(...)** | RPC to set trial/override on public.company_subscriptions. Frontend already calls supabase.rpc('override_subscription', {...}). |
| **admin.list_platform_users()** | Returns platform users (profiles + company + role), excluding admin.developers. Supports core.profiles (clerk_user_id) or public.profiles (id) for compatibility. |
| **public.list_platform_users()** | Wrapper for client. |
| **subscription_payments_developer_update** (policy) | Ensures developers can UPDATE subscription_payments (approve/reject). Idempotent add if missing. |
| **public.approve_subscription_payment(_payment_id uuid)** | Sets status = approved, approved_at, reviewed_by. |
| **public.reject_subscription_payment(_payment_id uuid)** | Sets status = rejected, rejected_at, reviewed_by. |
| **admin.list_pending_payments()** | Returns pending rows with company_name. |
| **public.list_pending_payments()** | Wrapper. |
| **public.list_payments(_status, _billing_mode, _plan, _date_from, _date_to, _search, _limit, _offset)** | Filtered, paginated list for Billing page. |

---

## 3. SQL dependency order (as in migration)

1. **billing schema + views** — billing.company_subscriptions, billing.payments; grant usage and select.  
2. **admin.dev_dashboard_kpis** — Extended with pending_payments_total; uses billing.payments or public.subscription_payments.  
3. **public wrappers** — public.dev_dashboard_kpis(), public.list_companies().  
4. **public.override_subscription** — Updates public.company_subscriptions.  
5. **admin.list_platform_users** + **public.list_platform_users**.  
6. **subscription_payments_developer_update** policy (if not exists).  
7. **public.approve_subscription_payment**, **public.reject_subscription_payment**.  
8. **admin.list_pending_payments** + **public.list_pending_payments**.  
9. **public.list_payments**.

---

## 4. Assumptions about current schema

- **core.companies.id** is **uuid** (auth_core_admin_dashboard).  
- **public.company_subscriptions.company_id** is **uuid** where onboarding/20260305000034 ran; if only farmvault_schema ran, it may be **text**. The view billing.company_subscriptions passes through company_id; admin.list_companies() joins on `s.company_id = c.id`, so if company_id is text and c.id is uuid, the join yields no rows. **Assumption:** project uses onboarding or 20260305000034 so company_id is uuid.  
- **public.subscription_payments.company_id** in farmvault_schema is **text**. list_pending_payments and list_payments join to public.companies with `c.id::text = sp.company_id` so both uuid and text company id work.  
- **core.profiles** has **clerk_user_id** (canonical). list_platform_users also has a fallback for public.profiles with **id** as user id if core.profiles does not have clerk_user_id.  
- **admin.developers** is populated (e.g. via Dev Bootstrap or admin.bootstrap_developer) so that is_developer() is true for platform admins.  
- **public.companies** exists (either from onboarding or from core view/table sync). list_pending_payments and list_payments join to it for company_name.

---

## 5. Frontend service names / adjustments

- **developerAdminService.getDevDashboardKpis()** — Calls `supabase.rpc('dev_dashboard_kpis')`. **No change**; now resolves to public.dev_dashboard_kpis(). The return type gains **pending_payments_total**; frontend can use it for “N pending” on Developer Home.  
- **developerAdminService.listCompanies()** — Calls `supabase.rpc('list_companies')`. **No change**; now resolves to public.list_companies().  
- **developerAdminService.overrideSubscription(input)** — Calls `supabase.rpc('override_subscription', { _company_id, _mode, ... })`. **No change**; RPC now exists.  
- **Users page** — Should call a new service, e.g. `listPlatformUsers()`, which calls `supabase.rpc('list_platform_users')`.  
- **Billing Confirmation** — Can use `supabase.rpc('list_pending_payments')` for pending list; trial companies from list_companies (filter client-side for is_trial) or keep existing flow.  
- **Billing page** — Replace useAdminSubscriptionPayments (Firestore) with:
  - `supabase.rpc('list_payments', { _status, _billing_mode, _plan, _date_from, _date_to, _search, _limit, _offset })` for the table.
  - `supabase.rpc('approve_subscription_payment', { _payment_id: id })` and `supabase.rpc('reject_subscription_payment', { _payment_id: id })` for actions.  
- **Approve/reject** — Current subscriptionPaymentService may have approveSubscriptionPayment(payment) and rejectSubscriptionPayment(paymentId). Those need to be implemented (or replaced) to call public.approve_subscription_payment(uuid) and public.reject_subscription_payment(uuid). Parameter is **payment id (uuid)**, not the whole doc.

---

## 6. Optional / follow-ups

- **dev_dashboard_kpis** return type: existing frontend may expect camelCase (e.g. companiesTotal). Supabase RPC returns snake_case (companies_total). Frontend should map or use snake_case.  
- **list_companies** returns **plan_code** (from plan_id). Frontend DevCompanyRow already has plan_code.  
- **override_subscription** — Current implementation does a simple upsert and merges override jsonb. Business rules (e.g. “start_trial” sets trial_ends_at from _days) can be refined in a later migration.  
- **list_payments** — _date_from / _date_to are timestamptz; frontend can send start/end of day in UTC. _search matches company name and company_id.

---

## 7. How to run

Apply the migration as usual (e.g. `supabase db push` or run the SQL in order). Then:

1. Ensure at least one developer exists in **admin.developers** (e.g. via Dev Bootstrap or manual insert).  
2. Call `supabase.rpc('dev_dashboard_kpis')` and `supabase.rpc('list_companies')` from the app; both should return data if core and public tables are populated.  
3. Build Developer Home, Companies, Users, Billing Confirmation, and Billing pages against these RPCs and remove Firebase/stub usage.
