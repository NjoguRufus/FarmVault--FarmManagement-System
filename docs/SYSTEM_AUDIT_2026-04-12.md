# FARMVAULT — COMPLETE TECHNICAL AUDIT

**Audited:** 2026-04-12 | **Stack:** React (Vite SPA) + Supabase + Clerk + M-Pesa + OneSignal | **Scale:** Single-region Kenya-focused SaaS

---

## STEP 1: FULL SYSTEM DECOMPOSITION

---

### AUTH SYSTEM

**Login Methods:**
| Method | Status | Notes |
|---|---|---|
| Clerk OAuth (Google, email/password) | Primary | Published key is `pk_test_*` — still on dev/test Clerk instance |
| Emergency access (env-var bypass) | Secondary | `VITE_EMERGENCY_ACCESS=false` — credentials baked into client bundle |
| Dev gateway (`/dev/signin`, `/dev/signup`) | Dev mode | Controlled by `VITE_ENABLE_DEV_GATEWAY=true` — must be false in prod |

**Session Handling:**
- Clerk manages JWTs; Supabase consumes them via custom JWT template
- `current_clerk_id()` SQL helper resolves identity in all RLS/functions
- AuthContext (~79KB) — a monolithic context file that handles profile state, role, onboarding, permissions, and emergency mode. This is a maintenance liability at scale.

**Role Assignment Flow:**
1. Clerk signup → `resolveOrCreatePlatformUser` → row created in `profiles`
2. `company_members` table stores `role` column per company
3. `RequireAuth` → checks active company → resolves role → gates pages
4. Roles: `owner`, `manager`, `staff`, `broker`, `driver`, `developer`, `admin`, `ambassador`

**Farm Linking:**
- `current_company_id()` resolves via `profiles.active_company_id` (or `company_id` fallback)
- Multi-company support appears partial — schema supports it but UI may not fully expose it

**Critical Auth Edge Cases:**
| Scenario | Handled? | Risk |
|---|---|---|
| User signs up with email, later uses Google SSO with same email | Unclear — `normalizeAuthEmail.ts` exists but completeness unknown | Duplicate account / data split |
| Employee invited but Clerk account pre-exists | `AcceptInvitationPage` exists | Needs testing |
| User deletes Clerk account but Supabase profile remains | `20260321143000_deleted_user_reset_flow.sql` handles it | Partial — orphaned `auth.users` rows |
| Owner leaves company — no other owner | No ownership transfer flow found | Company becomes inaccessible |
| Company deleted mid-session | `company_delete_cleanup` migration exists | Client-side session may have stale company ID |
| `tenantMembershipRecovery.ts` | Recovery logic exists | Black box — may silently re-attach to wrong company |

---

### USER LIFECYCLE

**1. First Visit (Landing)**
- Public marketing site at `farmvault.africa` (assumed static or SSR-less)
- 45+ SEO pages targeting Kenyan crop types and regions
- `DomainGuard.tsx` separates app domain from marketing domain
- No A/B testing infrastructure visible

**2. Signup**
- Clerk-hosted signup → `PostAuthContinuePage` / `AuthCallbackPage`
- Referral attribution captured in session storage (`ReferralAttributionCapture`)
- Ambassador referral code tracked in `farmer_sessions`
- **Gap:** No email verification gate before company creation — user can proceed without confirming email

**3. Onboarding**
- `OnboardingPage.tsx` → multi-step
- `create-company-onboarding` edge function creates company + starts trial
- `start_trial` RPC activates 14-day Pro trial
- `RequireOnboarding` gate blocks app until complete
- **Gap:** If `create-company-onboarding` edge function fails mid-flight, user is stuck — no retry mechanism shown in UI

**4. First Action**
- `CompanyDashboard` loads with project/expense/harvest widgets
- `PendingApprovalPage` shown if company is under manual review
- **Gap:** No guided "create your first project" tour beyond `react-joyride` setup

**5. Daily Usage**
- Projects → Stages → Operations (work cards) → Harvest → Expenses
- Offline-capable via service worker (NetworkFirst for Supabase data)
- **Gap:** Offline writes are cached but sync strategy on reconnect is undefined — potential for lost writes

**6. Advanced Usage**
- Harvest workforce management, picker weigh entries, payment batches
- Inventory tracking (stock, purchases, usage)
- Season challenges, company records, notebooks
- **Gap:** No bulk import (CSV/Excel) for any module

**7. Subscription Upgrade**
- BillingModal → PlanSelector → M-Pesa STK push → Callback → Payment approval (manual by developer) → Subscription activated
- **Critical Gap:** Payment approval is MANUAL by developer. At 1,000+ paying users this becomes a bottleneck and single point of failure

**8. Long-term Retention**
- Engagement email cron (`engagement-email-cron`) — schedule unknown
- No in-app analytics/insights for the farmer ("your yield trend", "cost per kg")
- No seasonal benchmarking ("farms like yours averaged X")
- No win-back flows

---

### ROLES & PERMISSIONS

**Owner (Farmer)**
- Full CRUD on all company data
- Billing management
- Employee invitation/revocation
- Missing: Cannot transfer ownership; no owner audit trail

**Manager**
- `RequireManager.tsx` guard
- Access to operations, records, harvest, expenses
- Missing: Explicit permission boundaries — is a manager blocked from billing? From deleting employees?

**Staff**
- `StaffLayout`, `StaffDashboard`, `StaffOperationsPage`
- Appears read-heavy / task-execution role
- Missing: Granular action permissions (can staff create expenses but not delete them?)

**Broker**
- `BrokerDashboard`, `BrokerHarvestSalesPage`, `BrokerExpensesPage`
- Vendor/buyer role — sees harvest sales
- `RequireNotBroker.tsx` blocks brokers from non-harvest areas
- Missing: Broker cannot see full financials — good. But can they see employee data? Unclear.

**Driver**
- `DriverDashboard` exists
- No `RequireDriver` guard visible in audit — access control may be incomplete
- Use case unclear — logistics? Delivery?

**Developer / Admin**
- Superuser access to all companies
- `admin.*` schema with read-all views
- Manual payment approval
- `DeveloperCodeRedPage` — emergency kill switch
- **Critical Risk:** Developer role is a single role with access to all tenant data. No granular internal permissions. No MFA requirement for developer login.

**Ambassador**
- `RequireAmbassador.tsx`
- Isolated to ambassador routes
- Cannot access company farm data
- Missing: Ambassador can see referral farmer names/emails — is this GDPR/privacy compliant?

---

## MODULE DEEP DIVES

---

### PROJECTS MODULE

**Data Structure:**
- `projects` table: `company_id`, `crop_type`, `start_date`, `end_date`, `budget`, `area_hectares`, `status`, `stage_id` (assumed)
- `project_stages` / `project_blocks` — spatial subdivision
- Linked to: expenses, harvests, work_cards, season_challenges, budget_pools

**CRUD:** Full CRUD via Supabase client
**Rate Limit:** 20/hour (basic), 100/hour (pro)
**Feature Limit:** Basic plan capped at 2 projects per company

**Edge Cases & Risks:**
- Deleting a project with active harvest collections — are child records cascade-deleted or orphaned?
- Project end_date in the past but status = 'active' — no automated status transition
- `project_blocks` referencing deleted project — no FK cascade confirmed
- Budget pool deletion when project is deleted — financial data loss risk
- `ProjectPlanningPage` — no evidence of undo/redo for planning changes

**UX Problems:**
- 2-project limit for basic will hit farmers very fast (most rotate 3+ crops/season)
- No project templates ("start a new tomato project like last season")
- No project archival — only hard delete visible

---

### EXPENSES MODULE

**Data Structure:**
- `expenses` table with `company_id`, `project_id`, `category`, `amount`, `date`, `notes`, `created_by`
- Categories: labor, chemicals, fuel, etc.
- Linked to budget_pools, project wallets

**Rate Limit:** 40/hour (basic), 120/hour (pro)

**Edge Cases & Risks:**
- No multi-currency support — amounts presumably KES only, undocumented
- No expense approval workflow — any employee can create expenses
- No receipt/document attachment for expenses
- Bulk expense entry (e.g. 30 workers paid at once) requires 30 individual inserts, burning rate limit
- No expense vs. budget variance alert
- Negative amounts possible? (refunds/credits) — constraint unknown
- `created_by` field — populated? Used in RLS? Inconsistent across tables

---

### HARVEST MODULE

**Data Structure:**
- `harvests` → `harvest_collections` → `picker_weigh_entries` → `harvest_payment_batches`
- `harvest_pickers` — company-wide picker roster (NOT per-collection)
- `harvest_wallets` — per-harvest financial ledger

**Rate Limits:**
- `harvest_collection_create`: 10/hour (basic), 40/hour (pro)
- `harvest_picker_add`: 30/hour (basic), 120/hour (pro)
- Basic plan: max 50 pickers in roster

**Critical Edge Cases:**
- A picker added to the roster but NOT to a specific collection — the many-to-many relationship between `harvest_pickers` and `harvest_collections` is unclear
- Weigh entry recorded for a picker not in the collection — referential integrity?
- `harvest_payment_batches` — what triggers batch creation? Manual only? No auto-close on collection end date?
- `harvest_wallets` — if a harvest is deleted, wallet ledger becomes orphaned financial data
- French beans specific migration baked into schema is a long-term maintenance problem
- Rate limit of 10 collections/hour for basic: a busy farm might run 5 collection sessions in a day easily

---

### INVENTORY MODULE

**Data Structure:**
- `inventory_categories` → `inventory_items` → `inventory_purchases`, `inventory_usage`
- `suppliers` linked to inventory items

**Rate Limit:** 30/hour (basic), 100/hour (pro)

**Edge Cases & Risks:**
- No minimum stock alerts
- No inventory valuation method (FIFO/LIFO/weighted average)
- `inventory_usage` — who triggered the usage? Linked to project? Operation?
- Negative stock possible — no constraint seen
- Supplier deletion when inventory items reference them — cascade or orphan?
- No lot/batch tracking for chemicals (important for safety/compliance)
- No expiry date tracking for chemicals/seeds

---

### EMPLOYEES MODULE

**Data Structure:**
- `employees` table with role, status (`draft`, `active`, `suspended`)
- Invite flow: `invite-employee` → `AcceptInvitationPage`
- Employee = Clerk user + company_member row

**Feature Limit:** Basic plan capped at 2 employees

**Edge Cases & Risks:**
- Employee `draft` status — visible to company? Counted against limit?
- Invited employee never accepts — invite hangs indefinitely (no expiry)
- Employee suspended but Clerk session still valid — RLS blocks Supabase but can they still hit edge functions?
- 2-employee limit for basic is extremely low for actual farming operations (a small farm has 5-10 workers)
- Employee data includes personal info — no GDPR/Kenya Data Protection Act consent flow
- `EmployeeProfilePage` — does this show sensitive payroll data to managers/staff?

---

### SUPPLIERS MODULE

**Rate Limit:** 5/hour (basic), 20/hour (pro)
- 5 suppliers/hour for basic is oddly specific and very low
- No supplier deduplication check (same supplier added twice with different spelling)
- No supplier rating/review system
- No supplier catalog sharing across companies

---

### SEASON CHALLENGES MODULE

**Rate Limit:** 10/hour (basic), 40/hour (pro)
- `challenge_templates` table — pre-defined templates visible
- How do season challenges link to projects? Via `project_id`? Free-standing?
- No challenge resolution/close flow described
- No gamification or community benchmarking ("3 other farms in Nakuru reported this challenge this week")

---

### RECORDS MODULE

**Sub-modules:**
- `farm_notebook_entries` — free-form and structured blocks
- `record_crops` — crop catalog
- `crop_catalog` — system-wide crop definitions
- `AdminCropRecordsPage`, `AdminRecordDetailPage` — developer can view farmer records

**Edge Cases & Risks:**
- `farm_notebook_structured_blocks` — content validated? XSS risk if rendered as HTML without sanitization
- Notebook entries accessible to developer/admin — does the farmer know?
- No version history for notebook edits
- `FullKnowledgePage` — what data sources? Internal only? External AI?
- Crop catalog is global — who can add to it? Developer only? This controls what crops farmers can select.

---

### OPERATIONS / WORK CARDS MODULE

**Data Structure:**
- `operations_work_cards` — task assignment system
- `work_logs` — daily operation records
- Role-specific views: `AdminOperationsPage`, `StaffOperationsPage`, `ManagerOperationsPage`

**Edge Cases & Risks:**
- Work card assigned to employee who has been suspended — card becomes dangling
- No SLA/deadline tracking on work cards
- No photo attachment for work completion evidence
- Staff completing a work card vs. manager verifying completion — is there an approval step?

---

### AI ASSISTANT

**Current State: PLACEHOLDER — Not implemented**

`AIChatButton.tsx` exists, references "OpenAI API with your real data," but is non-functional.

**What's missing (critical for roadmap):**
- No data pipeline from farm records to LLM context
- No function calling / tool use design
- No abuse rate limiting (AI endpoint is expensive)
- No prompt injection protection
- No AI response audit log
- No data-minimization for what gets sent to OpenAI
- Sending farmer financial/operational data to a third-party LLM has GDPR/DPA implications — needs a privacy disclosure

---

### BILLING SYSTEM

**Plan Structure:**
- `basic` / `pro` (from rate limiting migration)
- But subscription code mentions: `starter`, `professional`, `enterprise`
- **CRITICAL INCONSISTENCY:** Rate limiting uses `basic`/`pro`; subscription table may use different plan codes. `get_user_plan()` tries `plan_code`, `plan_id`, `plan` columns with fallback to `'basic'` — this multi-column fallback suggests the schema evolved without cleanup.

**Payment Flow:**
1. User opens BillingModal → selects plan + cycle
2. M-Pesa STK push initiated via edge function
3. Callback received at `mpesa-stk-callback`
4. Payment recorded in `subscription_payments`
5. **Manual developer approval required** → `DeveloperBillingConfirmationPage`
6. Developer approves → `approve_payment_syncs_company_subscription` RPC fires
7. Subscription activated

**Critical Billing Risks:**
| Issue | Severity |
|---|---|
| Manual payment approval is the only flow — zero automation | CRITICAL |
| M-Pesa callback is a webhook — if Supabase edge function is down during callback, payment is lost | CRITICAL |
| No idempotency key on M-Pesa STK push — double-charge risk on retry | CRITICAL |
| No Stripe/card payment — zero international user path | HIGH |
| Subscription plan name inconsistency (`basic` vs `starter`) | HIGH |
| No prorated billing on mid-cycle upgrade | MEDIUM |
| No invoice/billing history visible to user beyond receipts | MEDIUM |
| No auto-renewal notification ("your subscription renews in 3 days") | MEDIUM |
| Excess credit handling exists but UI for viewing credit balance unclear | MEDIUM |
| No dunning management (what happens if M-Pesa payment fails?) | HIGH |

---

### DEVELOPER / ADMIN DASHBOARD

**Available Controls:**
- Company list, details, approval
- Manual billing confirmation
- User management (create/delete)
- Trial extension
- App lock override
- Audit logs
- Feedback inbox
- Email center
- Code Red (emergency kill switch)
- Migration tools
- Backup management

**Missing Controls:**
- No feature flag system — enabling/disabling features requires a code deploy
- No company-level rate limit override
- No impersonation/shadow login (essential for support)
- No real-time system health dashboard (error rates, edge function failures, DB query times)
- No per-company revenue/LTV display in company details
- No churn prediction signals
- No bulk email/announcement tool to all users

**Security Risks:**
- Developer dashboard is a web UI protected only by Clerk role — no IP allowlist, no MFA enforcement
- All 18 developer pages share a single `developer` role — no internal role segregation (billing analyst shouldn't see Code Red)
- No rate limiting on developer actions (e.g., mass-deleting companies)
- Audit logs exist but are they tamper-proof? Can a developer delete their own audit entries?

---

### AMBASSADOR SYSTEM

**Architecture:**
- Ambassadors are separate Clerk users (not farmer accounts)
- Referral tracked via `farmer_sessions` → `ambassador_referrals`
- Earnings: flat KES commission per subscription + signup bonus

**Fraud Vulnerabilities:**
| Vulnerability | Description |
|---|---|
| Self-referral | Can an ambassador sign up as a farmer using their own referral code? |
| Fake farmer signups | Ambassador creates multiple fake farm accounts to collect signup bonuses |
| Cookie stuffing | Referral link clicked by user who already had an account |
| Commission on refunded payments | Payment approved → commission awarded → payment later reversed (M-Pesa dispute) |
| No minimum payout threshold enforcement shown | Ambassador could drain tiny commissions continuously |

**Missing:**
- No referral expiry (if farmer signs up 2 years after clicking link, does attribution still apply?)
- No chargeback/reversal commission clawback
- No ambassador tier system (performance-based commission rates)
- Ambassador can see referred farmer names/company names — privacy concern
- No ambassador agreement version tracking (terms may change)

---

### NOTIFICATION SYSTEM

**Triggers:**
- Company approved, subscription activated, payment received
- Employee invited/joined
- Ambassador onboarded
- Admin alerts (Code Red)
- Engagement emails (cron)

**Delivery:**
- Email (Resend)
- Web Push (OneSignal)
- In-app toast (Sonner)

**Reliability Risks:**
- OneSignal is a third-party — if it goes down, push fails silently
- No notification delivery confirmation tracking in-app
- Email logs table exists but no retry mechanism for failed sends visible
- Engagement cron edge function — no safeguard against duplicate sends if cron fires twice
- No unsubscribe/preference management for transactional emails (CAN-SPAM/Kenya regulations)
- Push subscription sync — stale push subscriptions accumulate when users uninstall PWA

---

### PWA / OFFLINE SYSTEM

**Service Worker Strategy:**
- Clerk auth endpoints: NetworkOnly (correct)
- Supabase auth/realtime: NetworkOnly (correct)
- Supabase data queries: NetworkFirst (cached briefly)
- Static assets: CacheFirst
- Images: CacheFirst, 7-day max-age

**Critical Offline Risks:**
| Risk | Impact |
|---|---|
| No offline write queue — mutations fail silently offline | User thinks data was saved; it wasn't |
| NetworkFirst for Supabase data means offline = stale data, no mutation | Read-only offline only |
| 6MB max cache file — large initial load | Poor on mobile data |
| Service worker caches Supabase anon key responses — potential data leakage on shared devices | Security risk |
| No sync conflict resolution strategy | First write wins with no warning |
| Firebase/dataconnect config present alongside Supabase | Leftover config increases bundle size and confusion |

---

## STEP 2: WEAK POINT DETECTION

---

### CRITICAL RISKS

**1. Manual Payment Approval Bottleneck**
Every single paid subscription requires a human developer to log in and click approve. At 100 paying users this is daily overhead. At 1,000 users it's a full-time job. This is the single biggest operational risk in the system.

**2. Clerk Test Key in Production**
`pk_test_cHJvLWFhcmR2YXJrLTQ2LmNsZXJrLmFjY291bnRzLmRldiQ` is a test/development Clerk key. If this is used in production, Clerk's rate limits, reliability SLAs, and data isolation guarantees are those of the dev tier, not production.

**3. Emergency Access Credentials in Client Bundle**
`VITE_EMERGENCY_ACCESS`, `VITE_EMERGENCY_EMAIL`, `VITE_EMERGENCY_USER_ID`, `VITE_EMERGENCY_COMPANY_ID`, `VITE_EMERGENCY_ROLE` — all `VITE_` prefixed, meaning they're compiled into the JavaScript bundle and visible to anyone who opens DevTools. This is a backdoor.

**4. M-Pesa Callback Reliability**
M-Pesa STK callbacks are fire-and-forget webhooks. If the `mpesa-stk-callback` edge function is down, payment is lost with no retry. No dead-letter queue, no reconciliation job.

**5. No Idempotency on Payments**
User taps "Pay" twice (slow connection), two STK pushes sent, potential double charge. M-Pesa's Daraja API requires idempotency keys to prevent this.

**6. Rate Limiting Design Flaw**
The `check_rate_limit()` function records an attempt on every successful check. But if the outer INSERT (the actual business action) rolls back after `check_rate_limit` succeeds, the rate limit counter was already incremented. A failed insert costs the user a rate limit slot.

**7. `check_rate_limit` Permission Model Ambiguity**
The migration comment says "Intentionally not granted to authenticated; called only from SECURITY DEFINER context." But the RLS policies on `projects`, `harvest_collections`, etc. call `check_rate_limit(current_clerk_id(), ...)` directly inside a `WITH CHECK`. These policies execute in the context of the calling user, not a SECURITY DEFINER function. The permission model may be broken — the policies may silently fail or always return false for non-superusers.

**8. Developer Has Read Access to All Farmer Data**
`admin.*` schema provides read-all views. `DeveloperRecordViewPage` allows developer to read any farmer's notebook entries and records. This is a regulatory concern (Kenya Data Protection Act 2019) — no user consent, no data access log visible to users.

**9. No Row-Level Audit Trail for Business Data**
The `audit_logs` table exists but it's developer-facing. Farmers cannot see "who changed this expense record." At scale, disputes between farm owners and managers will require this.

**10. AuthContext is 79KB**
A single 79KB context file that handles auth, roles, onboarding, permissions, and emergency mode is a critical maintenance and performance liability. It's a God Object. Any bug in this file breaks the entire application.

---

### STRUCTURAL WEAKNESSES

**1. SPA with No SSR for SEO Pages**
45+ SEO/marketing pages built as React components in a Vite SPA. Client-side rendering means Google sees an empty HTML shell until JS executes. For "farm management software Kenya" keywords, competitors using Next.js or Astro have a structural SEO advantage.

**2. Firebase + MongoDB + Supabase**
`package.json` has `mongodb` and Firebase config alongside Supabase. These appear to be legacy dependencies but increase bundle size and indicate architectural drift.

**3. 164 Migrations for a Young System**
164 SQL migrations indicates rapid schema evolution without planning. The `get_user_plan()` fallback chain (`plan_code` → `plan_id` → `plan`) is evidence — three different column names for the same concept exist because the schema was renamed twice without cleanup.

**4. Multi-Schema Design Complexity**
public/core/admin/harvest/finance/projects schemas creates a complex dependency graph. The migration that copies public tables to a schema suggests the split was done without full planning.

**5. No Background Job System**
Critical async work (payment reconciliation, commission calculation, engagement emails) relies on edge functions triggered by pg_cron or webhooks. No job queue, no retry logic, no dead-letter handling.

**6. Rate Limiting Via RLS is Stateful and Slow**
Each INSERT into a rate-limited table triggers a `count(*)` query on `rate_limits` plus an INSERT into `rate_limits`. For high-throughput tables, this is 2 extra queries per write. The `rate_limits` table will grow unboundedly without the cleanup cron (which is commented out). At 100K users, this becomes a performance bottleneck.

**7. Single Supabase Region**
No mention of multi-region, read replicas, or CDN for database queries. No disaster recovery plan visible.

---

### UX PROBLEMS

1. **2 projects / 2 employees for basic plan** — These limits block real farmers immediately. A small Kenya farm runs 3-5 crop projects per year and has 3-8 workers. Basic plan is essentially unusable as-is.

2. **Manual payment approval delay** — Farmer pays M-Pesa, expects instant activation, waits hours/days for developer approval. High support ticket volume and churn risk at this junction.

3. **No offline mutation feedback** — User adds an expense on mobile with poor signal, gets no error, thinks it saved. Silent data loss.

4. **Post-trial plan modal** — Farmer comes out of Pro trial to a blocking modal. No grace period, no "see what you'll lose" comparison.

5. **No "add multiple items" flows** — Adding 10 inventory purchases requires 10 separate form submissions. Burning rate limit, wasting time.

6. **No search/filter persistence** — Filters reset on navigation. Frustrating for power users managing large datasets.

7. **PWA install is manual** — No smart prompt timing (e.g., after 3rd visit or first completed project).

8. **166 pages is a navigation complexity risk** — No mega-menu or contextual navigation strategy documented.

---

## STEP 3: MISSING FEATURES

### Security & Compliance
- [ ] User-visible data access log (who viewed your data)
- [ ] Kenya Data Protection Act consent flow
- [ ] GDPR-compliant data export (right to portability)
- [ ] Right to erasure flow for farmers
- [ ] MFA enforcement for developer/admin accounts
- [ ] IP allowlist for admin dashboard
- [ ] Penetration test
- [ ] Ambassador privacy disclosure (they see your company name)

### Data Integrity
- [ ] Soft delete for all entities (currently hard delete = data loss)
- [ ] Per-entity audit trail (who changed this record and when)
- [ ] Rollback for destructive operations
- [ ] Orphan record detection and cleanup jobs
- [ ] FK cascade/restrict rules documented and enforced

### Billing
- [ ] Automated M-Pesa payment verification (no manual approval)
- [ ] Card payment (Stripe) for international users
- [ ] Idempotency keys on payment initiation
- [ ] Dead-letter queue for failed M-Pesa callbacks
- [ ] Payment reconciliation job (daily: compare M-Pesa statement vs DB)
- [ ] Subscription dunning (retry failed renewals)
- [ ] Prorated billing on plan changes
- [ ] Billing portal (self-serve plan changes)
- [ ] Invoice PDF for accountants (not just receipts)
- [ ] Multi-currency support

### Operations
- [ ] Bulk CSV/Excel import for any module
- [ ] Bulk operations (delete, update, export) in tables
- [ ] Project templates ("start from last season")
- [ ] Project archival (not delete)
- [ ] Ownership transfer for companies
- [ ] Employee invite expiry
- [ ] Expense approval workflow
- [ ] Receipt/document attachment on expenses
- [ ] Inventory minimum stock alerts
- [ ] Inventory expiry date tracking
- [ ] Lot/batch tracking for chemicals

### Analytics & Insights
- [ ] Per-farm P&L dashboard (revenue vs. cost per project)
- [ ] Yield trend analysis
- [ ] Cost per kg/unit metrics
- [ ] Seasonal benchmarking vs. peers
- [ ] Export to Excel/PDF for any report
- [ ] Harvest payment batch settlement tracking

### Developer Operations
- [ ] Feature flag system (LaunchDarkly / self-hosted)
- [ ] Company impersonation / shadow login for support
- [ ] Automated alerting (error rate spikes, payment failures)
- [ ] Real-time system health dashboard
- [ ] Runbook for common incidents

### Ambassador
- [ ] Self-referral prevention
- [ ] Referral link expiry
- [ ] Commission clawback on refunded payments
- [ ] Ambassador tier system
- [ ] Ambassador payout integration (M-Pesa B2C directly to ambassador)

### PWA / Offline
- [ ] Offline write queue with sync on reconnect
- [ ] Conflict resolution UI ("you have unsynced changes")
- [ ] Background sync for pending uploads

### AI (Planned but Missing)
- [ ] Actual LLM integration
- [ ] Farm data context pipeline
- [ ] AI usage rate limiting
- [ ] Privacy disclosure for AI features
- [ ] Crop recommendation engine
- [ ] Pest/disease identification from photo

---

## STEP 4: IMPROVEMENTS

### Backend

1. **Automate M-Pesa payment verification** — Use M-Pesa transaction status query API to verify payment server-side immediately after callback, removing manual approval entirely.

2. **Add idempotency to all payment flows** — Store STK push `CheckoutRequestID` and deduplicate on callback.

3. **Replace in-RLS rate limiting with a dedicated edge function pre-flight** — The `rate-limit-check` edge function already exists. Route all creates through it instead of embedding rate limiting in RLS policies where it has permission model ambiguity.

4. **Implement a cleanup cron for `rate_limits`** — Uncomment the pg_cron setup. The table grows forever otherwise.

5. **Consolidate plan naming** — Pick one column (`plan_code`), add a NOT NULL constraint, write a migration to normalize existing data, drop `plan_id` and `plan` columns.

6. **Break up `AuthContext.tsx`** — Split into: `useClerkSession`, `useUserProfile`, `useCompanyContext`, `usePermissions`. 79KB is ~3,000 lines. Test coverage on this file is presumably zero.

7. **Harden the M-Pesa callback** — Add HMAC verification on the callback payload. The current webhook handler may accept spoofed callbacks from any source.

### Architecture

1. **Move SEO pages to Astro or Next.js static pages** — Keep the React app for authenticated pages. Use Astro for the 45+ marketing/SEO pages. This is the highest-leverage SEO improvement available.

2. **Implement a job queue** — Use `pg_boss` (PostgreSQL-native) or a Redis queue for async work (payment processing, commission calculation, email sending). This adds retry, dead-lettering, and monitoring.

3. **Remove Firebase and MongoDB from `package.json`** — If unused, they're dead weight in the bundle and a maintenance distraction.

4. **Create a feature flag table** — `feature_flags (flag_name, enabled_globally, enabled_plan_codes[], enabled_company_ids[])` with a `is_feature_enabled(flag_name text)` RPC. Deploy features without code pushes.

5. **Add a service layer in the frontend** — Direct Supabase client calls are scattered across page components. Centralize in service files per domain (`projectService.ts`, `harvestService.ts`) for testability.

### Security

1. **Rotate the emergency access credentials** — Remove `VITE_EMERGENCY_*` vars from client env immediately. Implement emergency access as a Supabase edge function with a server-side secret.

2. **Upgrade to Clerk production key** — `pk_test_*` must never be in production.

3. **Enforce MFA for developer/admin role** — Clerk supports this via organization settings.

4. **Add Content Security Policy headers** — Not visible in `vercel.json`. XSS protection for a system handling financial data.

5. **Audit `farm_notebook_structured_blocks` rendering** — If rendered as HTML, sanitize with DOMPurify.

### Monetization

1. **Add a Starter plan** between free and Pro — 5 projects, 5 employees, basic analytics. Current jump from basic (2 projects) to pro (unlimited) is too steep. A mid-tier reduces churn.

2. **Surface annual billing savings prominently** — Already have `BillingCycleSelector`. Show "Save 2 months with annual" front and center.

3. **Add a usage-based add-on** — Extra projects pack (KES X for 5 more projects) for users who don't want full Pro.

4. **Automate ambassador payouts** — Paying ambassadors manually will not scale. Integrate M-Pesa B2C for automated commission disbursement.

---

## STEP 5: SYSTEM MAP

```
┌─────────────────────────────────────────────────────────────────────┐
│  PUBLIC DOMAIN (farmvault.africa)                                   │
│  45+ SEO pages (React SPA — SSR gap)                                │
│  Marketing, calculators, crop guides, blog, pricing, legal          │
│  Ambassador landing, signup, terms                                  │
└────────────────────┬────────────────────────────────────────────────┘
                     │ Signup / Login (Clerk)
┌────────────────────▼────────────────────────────────────────────────┐
│  AUTH LAYER (Clerk)                                                 │
│  Signup → PostAuthContinue → Onboarding → create-company (EF)      │
│  AcceptInvitation → Employee linking                                │
│  EmergencyAccess → bypass (CRITICAL: client-side risk)             │
└────────────────────┬────────────────────────────────────────────────┘
                     │ JWT → Supabase current_clerk_id()
┌────────────────────▼────────────────────────────────────────────────┐
│  APP (app.farmvault.africa) — Authenticated SPA                     │
│                                                                     │
│  ROLE ROUTER                                                        │
│  ├── Owner/Manager → CompanyDashboard                               │
│  ├── Staff        → StaffDashboard                                  │
│  ├── Broker       → BrokerDashboard                                 │
│  ├── Driver       → DriverDashboard                                 │
│  ├── Developer    → DeveloperDashboard                              │
│  ├── Admin        → AdminDashboard                                  │
│  └── Ambassador   → AmbassadorDashboard                             │
│                                                                     │
│  CORE MODULES                                                       │
│  Projects ─── Stages ─── Work Cards ─── Operations                 │
│  Expenses ─── Budget Pools ─── Project Wallets                      │
│  Harvest ─── Collections ─── Pickers ─── Weigh Entries             │
│             └── Payment Batches ─── Harvest Wallets                 │
│  Inventory ─── Categories ─── Items ─── Purchases/Usage            │
│  Suppliers                                                          │
│  Employees ─── Invite Flow ─── Role Management                      │
│  Season Challenges                                                  │
│  Records ─── Notebooks ─── Crop Catalog                            │
│  Billing ─── M-Pesa STK ─── Manual Approval ─── Subscription       │
│                                                                     │
│  CROSS-CUTTING                                                      │
│  Rate Limiting (RLS-level) ─── Feature Gates ─── Plan Checks       │
│  Notifications (OneSignal + Resend + In-app)                        │
│  PWA (ServiceWorker + Workbox) ─── Offline (read-only)             │
│  Analytics (PostHog)                                                │
│  AI Chat (placeholder — not implemented)                            │
└────────────────────┬────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────────┐
│  SUPABASE BACKEND                                                   │
│                                                                     │
│  DATABASE (PostgreSQL)                                              │
│  public.*  — 30+ tables (multi-tenant via company_id + RLS)        │
│  core.*    — views keyed by Clerk user ID                           │
│  admin.*   — read-all views for developers                          │
│  harvest.* / finance.* / projects.* — schema-specific tables        │
│                                                                     │
│  EDGE FUNCTIONS (22)                                                │
│  create-company, create-company-onboarding                          │
│  invite-employee, resend-employee-invite, revoke-employee-invite    │
│  mpesa-stk-push, mpesa-stk-callback                                 │
│  billing-receipt-issue                                              │
│  send-farmvault-email, notify-* (8 functions)                       │
│  notification-push-dispatch, onesignal-notify, admin-alert-*        │
│  sync-push-subscription, rate-limit-check, engagement-email-cron    │
│                                                                     │
│  REALTIME — admin_alerts, notifications, subscription_payments       │
└────────────────────┬────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────────────┐
│  EXTERNAL SERVICES                                                  │
│  Clerk      — Auth identity                                         │
│  M-Pesa     — Payments (KES, Kenya only)                            │
│  Resend     — Transactional email                                   │
│  OneSignal  — Web push notifications                                │
│  PostHog    — Product analytics                                     │
│  Vercel     — Hosting (frontend)                                    │
│  Firebase   — Legacy / partially migrated off                       │
│  MongoDB    — Legacy / partially migrated off                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## STEP 6: FINAL VERDICT

### Maturity Scorecard

| Dimension | Score | Notes |
|---|---|---|
| Feature breadth | 7/10 | Impressive module coverage for a farm SaaS |
| Feature depth | 5/10 | Many features are shallow; bulk ops, analytics, approvals missing |
| Security | 4/10 | Emergency access in client bundle, test Clerk key, no MFA for admins |
| Data integrity | 4/10 | No soft deletes, no per-record audit trail, orphan risks |
| Billing reliability | 3/10 | Manual approval, no idempotency, no reconciliation |
| Scalability | 4/10 | Rate limiting design flaws, single-region, no job queue |
| UX maturity | 5/10 | Good breadth but friction in key flows (payment delay, plan limits) |
| Observability | 5/10 | PostHog + audit logs + email logs, but no APM or error tracking |
| SEO | 4/10 | Good intent, SPA rendering undermines execution |
| Ops readiness | 3/10 | No feature flags, no impersonation, no incident runbooks |

### Verdict

**LATE BETA / PRE-PRODUCTION**

The system demonstrates real product thinking — the multi-schema RLS design, Clerk+Supabase integration, M-Pesa payment flow, PWA, ambassador program, and 166-page scope are not trivial. A real product has been built here.

But it cannot scale to 100,000 users in its current state. The blockers are not cosmetic.

---

### Must-Fix Before Scaling (Ordered by Risk)

| Priority | Item | Why |
|---|---|---|
| 1 | Automate M-Pesa payment approval | Will kill the business at scale; currently a human bottleneck |
| 2 | Move emergency access out of client bundle | Live backdoor visible in DevTools |
| 3 | Upgrade to Clerk production key | `pk_test_*` in production = dev-tier SLAs |
| 4 | Add M-Pesa idempotency + callback dead-letter queue | Prevent double charges and lost payments |
| 5 | Fix rate limiting permission model | `check_rate_limit` may silently return false in RLS context; needs load testing |
| 6 | Add payment reconciliation job | Know if M-Pesa sent money that wasn't recorded |
| 7 | Break up AuthContext.tsx | 79KB God Object; any bug breaks the entire app |
| 8 | Implement offline write queue | Or remove offline claims; current impl silently drops writes |
| 9 | Add soft deletes | Hard deletes on financial data are not acceptable in production billing |
| 10 | Normalize plan naming | `basic`/`starter`/`pro`/`professional`/`enterprise` must be one canonical value before thousands of subscriptions accumulate |
