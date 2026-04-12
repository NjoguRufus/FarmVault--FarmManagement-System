# FarmVault — Launch readiness QA audit

**Date:** 2026-04-12  
**Scope:** Stabilization and hardening review (no new features). Focus: payments, data integrity, multi-user behavior, analytics, UX, security, edge cases, performance, production config, real-user flows.

**Method:** Static review of the repository (application code, Supabase migrations, Edge functions, RLS, routing guards) plus alignment with existing internal audits (`docs/SYSTEM_AUDIT_2026-04-12.md`, `docs/AUDIT_NOT_IMPLEMENTED.md`, `docs/SPRINT_01_PAYMENTS_SECURITY.md`). This document is **not** a substitute for full E2E runs against staging/production with live Clerk, Supabase, and Daraja.

---

## Phase 1 — Critical system testing (findings)

### 1. Payments (highest priority)

| Scenario | Assessment |
|----------|------------|
| Single payment flow (STK + manual) | STK path uses callback → `activate_subscription_from_mpesa_stk`; manual path uses `submit_manual_subscription_payment` RPC. Idempotency flags exist on `subscription_payments` (`success_processed`, etc.). |
| Double-click / duplicate prevention | Client: `BillingModal` uses `busy` from `mutation.isPending` and STK loading; server: 30-minute window blocks duplicate `pending_verification` per company. |
| Slow network | `StkPushConfirmation` retries initial fetch; Realtime subscription on `mpesa_payments`. |
| Callback delay or failure | Reconcile job / `payment_reconciliation_log` and DLQ-style inserts documented in sprint payment docs — verify in staging. |
| Payment success but UI not updated | Risk if Clerk JWT bridge is late: `StkPushConfirmation` uses default `supabase` client with global token getter; polling + Realtime usually cover lag. |
| Payment failure recovery | FAILED status path in `StkPushConfirmation`; manual flow remains `pending_verification` until approve/reject. |

**Critical gaps**

1. **Manual M-Pesa path** depends on **human approval** before subscription advances — operational SPOF, latency, and fraud-review load at scale.
2. **STK Query verification:** On **exception** during server-side STK Query (when verification is enabled), callback **still trusts** Daraja callback for activation (`stk_query_error_trust_callback` in `mpesa-stk-callback`). Raises risk if verification fails due to attack or misconfiguration during outages.
3. **No global uniqueness** found in migrations for `transaction_code` / `mpesa_receipt` across **all** tenants for manual submissions — duplicate or fraudulent reuse across companies needs explicit enforcement or reconciliation rules.

### 2. Data integrity

- **Soft delete:** Pending migrations (`20260412340000_*`, `20260412350000_*`) must be applied in step with UI queries or analytics RPCs will disagree with lists (`deleted_at` filters).
- **Project delete → expenses / harvest:** Cascade/orphan behavior must be verified per FK + app services; audit doc flags project delete + children as needing explicit test passes.
- **`updateProject`** does not use `row_version` — **last write wins** for concurrent editors.

### 3. Multi-user behavior

- Without optimistic concurrency on many entities (projects example documented below), **no data overwrites** cannot be guaranteed — only “last save wins.”

### 4. Analytics

- After soft-delete standardization, validate **crop yield / profit / monthly revenue** RPCs against known fixtures; watch for SQL errors when `deleted_at` is null vs set.

---

## Phase 2 — UX and flow

- Manual payment: make **pending verification** state highly visible (banner + history link).
- STK deferred activation: user-facing copy when activation is deferred to reconcile (avoid infinite “waiting” perception).
- Loading / error / success: generally present in billing stack; align **empty states** on reports with “archived” vs “no data” after soft deletes.

---

## Phase 3 — Security and permissions

- **`/billing`** uses `PermissionRoute` with `module="settings"`. Anyone with `settings.view` (including mis-scoped staff presets) may reach billing UI — align presets and verify RLS on billing tables.
- **`/developer`**, **`/admin/*`**: wrapped with `RequireDeveloper` / `DeveloperRoute` — good for URL direct access; developer role remains broad (MFA and ops policy are org-level).
- Production: **`pk_live_`**, no **`VITE_EMERGENCY_*`** in client bundle, **`VITE_ENABLE_DEV_GATEWAY=false`** — use `npm run validate:env` / strict CI.

---

## Phase 4 — Edge cases

- Offline / service worker: sync-on-reconnect for queued writes not fully verified in static review — high risk for ops data if writes drop.
- Partial forms, invalid inputs, rapid actions: rely on per-module validation; rate limits exist on several RPCs (see system audit).

---

## Phase 5 — Performance

- Dashboard and reports: measure with production-like data volumes; soft-delete may add predicates — confirm indexes and explain plans after migrations.
- Avoid unnecessary refetches after billing success (already invalidates several query keys in `BillingModal`).

---

## Phase 6 — Production readiness

- No test Clerk key in prod (`src/lib/clerkProductionGuard.ts`, `scripts/lib/envPublicValidation.mjs`).
- Edge functions: review **console logging** for PII retention and access control.
- **Dual stack:** Farmer billing on **Supabase**; some admin/legacy flows still reference **Firebase** `subscriptionPaymentService` — ops must know the system of record to avoid “paid in one place, not shown in the other.”

---

## Phase 7 — Real user simulation

- Daily logging, expenses, harvest, reports: run scripted walkthroughs on staging with owner + employee accounts; document any crashers or wrong totals.

---

## Issue register

### 1. Critical issues (must fix or explicitly accept before launch)

| ID | Issue |
|----|--------|
| C1 | Manual subscription verification is a **human bottleneck** and SPOF for paid activation. |
| C2 | STK callback may **activate on callback alone** when STK Query throws (trust-callback fallback). |
| C3 | **No proven DB-wide uniqueness** for M-Pesa manual `transaction_code` / receipt across tenants (fraud + double-claim risk). |
| C4 | **Production config:** Clerk test keys, client emergency env vars, dev gateway must be absent in production builds. |
| C5 | **Concurrent edits:** e.g. `updateProject` ignores `row_version` — silent overwrites. |
| C6 | **Dual payment ledgers** (Supabase vs Firebase admin paths) — reconciliation and support confusion risk. |

### 2. High priority issues

| ID | Issue |
|----|--------|
| H1 | `StkPushConfirmation` uses global `supabase` client vs explicit `getAuthedSupabase` — timing edge cases with JWT bridge. |
| H2 | Billing coupled to **`settings`** permission — misconfiguration exposes billing to staff. |
| H3 | Edge logs may contain **payment-adjacent PII** — policy and retention. |
| H4 | Offline queue replay not proven for financial/harvest writes. |
| H5 | Soft-delete + analytics migrations must deploy **atomically** with app expectations. |
| H6 | Developer role = wide tenant access; enforce MFA and least privilege outside the repo. |

### 3. Minor issues

| ID | Issue |
|----|--------|
| M1 | 30-minute duplicate window is not global idempotency for manual pay. |
| M2 | Residual `console.warn` / logs in billing paths in production builds. |
| M3 | Naming drift: owner/manager/employee vs `company-admin` / presets in code and docs. |
| M4 | Company admins can open `/staff/*` routes — odd but usually harmless. |

### 4. UX improvements (friction only)

- Persistent **pending payment** state after manual submit.
- Clear copy when STK activation is **deferred** to reconciliation.
- Retry affordance for subscription gate refetch after STK.
- Post–soft-delete **empty states** on reports.

---

## Code references (audit trail)

**STK Query error → trust callback**

```159:167:supabase/functions/mpesa-stk-callback/index.ts
          } catch (e) {
            console.warn("[mpesa-stk-callback] STK Query verification failed (proceeding with callback for activation)", e);
            await admin.from("payment_reconciliation_log").insert({
              checkout_request_id: checkoutId,
              db_status: "callback_success",
              daraja_result_code: null,
              daraja_result_desc: (e instanceof Error ? e.message : String(e)).slice(0, 500),
              action_taken: "stk_query_error_trust_callback",
            });
          }
```

**Project update without row_version check**

```327:344:src/services/projectsService.ts
export async function updateProject(
  projectId: string,
  updates: Partial<Pick<Project, 'name' | 'status' | 'location' | 'acreage' | 'budget'>>,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (updates.name != null) payload.name = updates.name;
  if (updates.status != null) payload.status = updates.status;
  if (updates.location != null) payload.notes = updates.location;
  if (updates.acreage != null) payload.field_size = updates.acreage;
  if (updates.budget !== undefined) payload.budget = updates.budget;

  if (Object.keys(payload).length === 0) return;

  const { error } = await db.projects()
    .from('projects')
    .update(payload)
    .eq('id', projectId)
    .is('deleted_at', null);
```

**STK confirmation reads `mpesa_payments` via default client**

```34:42:src/components/subscription/billing/StkPushConfirmation.tsx
  const { data, error } = await supabase
    .from('mpesa_payments')
    .select('*')
    .eq('checkout_request_id', checkoutId)
    .maybeSingle();
```

---

## Final verdict

| Launch type | Verdict |
|-------------|---------|
| **Full public launch** (open signup, marketing at scale, expectation of immediate paid access) | **Not ready** — C1–C6 must be resolved, automated, or explicitly accepted with operational compensating controls. |
| **Soft launch** (limited users, STK-first, staffed manual approvals, strict env validation in CI, monitoring on payment reconciliation tables) | **Ready for soft launch** — codebase shows meaningful hardening (RLS on `mpesa_payments`, payment success idempotency flags, client submit guards, documented reconcile paths). |

---

## Recommended validation matrix (execution checklist)

Run in **staging** with production-like secrets policy (not production test keys):

1. **Payments:** double-click STK, airplane mode mid-flow, callback replay, manual submit → approve / reject / duplicate code across two test companies (if allowed).
2. **Data:** create → update → delete (soft) → report totals.
3. **Multi-user:** two browsers, same project, simultaneous save — observe overwrite.
4. **Analytics:** spot-check yield/profit/revenue after mutations.
5. **Security:** staff URL direct to `/billing`, `/settings`, `/developer`.
6. **Production:** `validate:env:strict`, Clerk `pk_live_`, no dev gateway.

---

*End of document.*
