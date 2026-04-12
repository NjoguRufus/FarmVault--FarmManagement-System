# FarmVault — Launch readiness (≈100 real users / CTO view)

**Date:** 2026-04-12  
**Scope:** Production readiness for **~100 real farmer workspaces** (not feature review, not general code cleanup).  
**Method:** Static review of application code, Supabase migrations, Edge functions, routing, offline queue, and alignment with internal audits (`docs/LAUNCH_READINESS_QA_AUDIT_2026-04-12.md`, sprint payment docs). **Not** a substitute for full staging E2E with live Clerk, Supabase, and Safaricom Daraja.

---

## Launch readiness verdict

| Stage | Verdict |
|--------|---------|
| **Soft launch (10 users)** | **Yes** — if billing is **STK-first**, **manual review is staffed**, **migrations + app** ship together, and **strict prod env** is enforced (`npm run validate:env:strict`, live Clerk keys, no client emergency flags). |
| **Controlled launch (50 users)** | **Caution (borderline)** — same controls; **manual M-Pesa approval** and **support load** scale worse than raw database QPS. |
| **Full launch (~100 users)** | **No (not as hands-off production)** — **operational and correctness gaps** remain that are unacceptable as default without compensating controls. |

**Throughput note:** **100 subscription payments/day** is technically feasible for Daraja/Supabase at that volume **if** `mpesa_payments` rows exist, callbacks and reconcile run, and secrets/cron are correct. The limiting factor is **correctness and recovery**, not aggregate QPS.

---

## Critical blockers (must fix or explicitly accept)

### 1. STK push API can report success when `mpesa_payments` insert fails

After a failed insert that is **not** a uniqueness/idempotency replay, the Edge function still returns `success: true` with `checkoutRequestId`. Reconciliation (`mpesa-payment-reconcile`) only scans **existing** `mpesa_payments` rows, so a **missing row is not self-healed**. A user can complete M-Pesa while the app has **no durable payment row** → activation and support risk.

**Reference:** `supabase/functions/mpesa-stk-push/index.ts` — `mpesa_payments.insert` error branch followed by unconditional `return jsonOk({ success: true, ... checkoutRequestId })`.

### 2. STK Query failure falls back to “trust callback” in production verification mode

When `shouldVerifyStkSuccessWithQuery()` is true (default in production when the env flag is unset), an **exception during STK Query** still allows activation (`stk_query_error_trust_callback`). This weakens the “confirm with Daraja before activate” story during outages or misconfiguration.

**Reference:** `supabase/functions/mpesa-stk-callback/index.ts` — `catch` after `queryStkPush` with `action_taken: "stk_query_error_trust_callback"`.

### 3. Manual subscription path is an operational SPOF

Manual submit can remain **pending / pending_verification until a human approves**; notifications are best-effort. At 50–100 companies, **paid-but-blocked** and **approval latency** dominate unless auto-validate paths and monitoring cover the load.

### 4. Reconcile job does not repair “no `mpesa_payments` row”

`mpesa-payment-reconcile` only reconciles rows already in `mpesa_payments`. Orphan STKs (e.g. insert failure after Daraja success) need **runbooks or code** (e.g. backfill from `mpesa_stk_callbacks`).

### 5. Deploy coherence (pending migrations)

Soft-delete, analytics RPCs, and manual payment uniqueness (`20260412401000_manual_payment_tx_unique_auto_validate.sql`, etc.) must be **applied in lockstep** with the app. Version skew → wrong totals, missing rows, or client/RPC errors.

---

## High priority risks

- **Concurrent edits / last-write-wins** — e.g. `updateProject` updates by `id` without optimistic concurrency; two users can overwrite each other (see `docs/LAUNCH_READINESS_QA_AUDIT_2026-04-12.md` code references).
- **`/billing` uses `PermissionRoute module="settings"`** (`src/App.tsx`) — mis-scoped staff presets can expose billing UI; **RLS/RPC** must remain the real enforcement; verify in staging.
- **Dual ledger** — Supabase-centric farmer billing vs Firebase `subscriptionPaymentService` for some flows → **support and reconciliation** confusion if both are used.
- **STK confirmation** — default `supabase` client vs explicit authed client can produce **JWT timing** edge cases under refresh.
- **Edge logs** — payment-adjacent PII; define **retention and access** for compliance and incidents.

---

## Medium risks

- **Client bundle / dashboard** — Vite `chunkSizeWarningLimit: 600` (KB); heavy dependencies can hurt **first load on poor networks**; measure with Lighthouse and field data.
- **Reports / analytics** after soft-delete — extra predicates; validate **indexes and EXPLAIN** on production-like volume.
- **Offline** — `offlineQueueSync` covers **harvest intake, picker payments, wallet entries**, not all modules (e.g. not a blanket guarantee for every expense flow). Dexie + retry reduces silent loss for queued types only.
- **Reconcile automation** — cron + `MPESA_RECONCILE_SECRET` must be **actually configured**; otherwise stuck STKs accumulate.

---

## Root cause analysis

- **Payments** chain **external M-Pesa**, **Edge limits**, and **Postgres**. Fragility appears in **exception paths** (trust callback on query throw; success response after failed insert) and in **jobs that only heal rows that already exist**.
- **Multi-user** issues stem from **standard PATCH updates** without **version columns or merge** on many entities.
- **~100 DAU farmers** is usually **low QPS** but **high correctness and ops** sensitivity (money, approvals, rural connectivity).

---

## Final recommendation

1. **Launch now (safe)** — **No** for unattended full commercial launch at ~100 workspaces.  
2. **Launch with caution (monitor closely)** — **Yes** for **10–50** with STK-first billing, staffed manual path, reconcile + webhook failure visibility, strict env validation, and a **written runbook** for stuck payments.  
3. **Do not launch** — **No** as blanket advice; use (2) with explicit acceptance of residual risks until blockers are fixed or compensated.

---

## Realistic scenario simulation (100 farmers / day)

| Activity | Likely outcome |
|----------|----------------|
| **Expenses + harvest** | Mostly fine at this scale; **two editors** on same entity → **last save wins**; possible confusion until refresh. |
| **STK subscription payments** | Usually OK with idempotency key, DB uniqueness, callback, and reconcile; **first severe breakage** under stress: **DB insert blip after Daraja success** (orphan STK), or **STK Query outage** → **trust-callback** behavior. |
| **Manual pay** | **Queues on humans**; support load rises; **duplicate receipt** risk mitigated by normalized unique index on `subscription_payments` **when** migration `20260412401000` is applied. |
| **What slows first** | **Client bundle and reports** on weak networks before the database becomes the bottleneck. |
| **Manual intervention** | **Approvals**, **cron/reconcile**, **`payment_webhook_failures` / `payment_reconciliation_log`**, and **orphan STK** handling if insert/success mismatch occurs. |

---

## Mandatory analysis areas (summary)

| Area | Verdict at ~100 real users |
|------|----------------------------|
| **Payments** | Volume OK; **rare but severe** edge cases (insert vs response; query error trust-callback). |
| **Data integrity** | **Yes**, data can diverge if migrations/app skew; soft delete must be consistent; concurrency can lose edits. |
| **Multi-user** | **Overwrites** possible without optimistic locking. |
| **Performance** | **Unlikely** DB-bound at this DAU; watch **client + reports**. |
| **Backend** | Depends on **Edge + cron + secrets**; reconcile **does not** fix missing `mpesa_payments` rows. |
| **Security / tenancy** | Architecture assumes **RLS + RPC**; validate **role presets** and **cross-tenant** reads in staging. |
| **Offline / network** | **Partial** queue coverage; not full-app offline safety. |
| **Operations** | **Manual approvals** and **human support** remain load-bearing. |

---

## Relation to other docs

- **`docs/LAUNCH_READINESS_QA_AUDIT_2026-04-12.md`** — Detailed QA matrix and code citations; use alongside this document.  
- **`docs/SPRINT_01_PAYMENTS_SECURITY.md`** — Sprint-delivered payment hardening checklist.  
- **Additional critical finding for engineering backlog:** `mpesa-stk-push` returning HTTP success with a checkout ID when `mpesa_payments` insert fails (non-`23505`) — treat as **P0** payment durability fix or compensating alert + backfill process.

---

*End of document.*
