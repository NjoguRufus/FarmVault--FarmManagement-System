# Sprint 1 — Payments + security (Late Beta → production hardening)

**Goal:** Reduce real-money risk: duplicate STK, silent callback failures, paid-but-not-activated rows, and client-bundled emergency bypass env vars.

**Scope delivered in this sprint (code + migrations + tests).** Items that remain **operational** (Clerk `pk_live_`, disabling manual approval in your process) are called out explicitly.

---

## 1. Automated M-Pesa verification (technical)

| Mechanism | Status |
|-----------|--------|
| **Production STK Query gate** — before `activate_subscription_from_mpesa_stk`, Daraja `stkpushquery` must return `ResultCode === 0` when `MPESA_VERIFY_SUCCESS_WITH_STK_QUERY` is unset and `MPESA_ENV=production` | ✓ `mpesa-stk-callback` |
| **Sandbox** — verify off by default (set `MPESA_VERIFY_SUCCESS_WITH_STK_QUERY=true` to force on) | ✓ |
| **Reconcile job** — `mpesa-payment-reconcile` phase 1 queries **PENDING** STKs and completes activation | ✓ (pre-existing; unchanged contract) |
| **Stuck SUCCESS** — rows `status=SUCCESS` + `subscription_activated=false` retried (activation + finalize) | ✓ phase 2 in `mpesa-payment-reconcile` |
| **Remove human “approve payment” in FarmVault admin** | — product / process (not changed here) |

**Env**

- `MPESA_VERIFY_SUCCESS_WITH_STK_QUERY` — `true` / `false` / unset (see `.env.example`).
- Legacy `MPESA_VERIFY_WITH_STK_QUERY` — removed from callback logic; use the new flag.

---

## 2. Payment idempotency (end-to-end)

| Layer | Detail |
|-------|--------|
| DB | Partial unique index on `mpesa_payments.idempotency_key` (existing migration `20260412140000_phase1_emergency_mpesa_reliability.sql`) |
| Edge `mpesa-stk-push` | **Billing** requests **must** include `Idempotency-Key` header or body `idempotency_key`; developer STK test unchanged |
| Client | `initiateMpesaStkPush` requires `idempotencyKey`; `BillingModal` already pins one UUID per modal open |
| Tests | `src/services/mpesaStkService.test.ts` — header/body alignment + missing-key throw |

---

## 3. Callback reliability (DLQ + visibility)

`payment_webhook_failures` rows are inserted when:

- `mpesa_stk_callbacks` insert fails  
- `mpesa_payments` update fails  
- STK Query **mismatch** with callback success (production gate)  
- `activate_subscription_from_mpesa_stk` RPC fails  

`payment_reconciliation_log` records STK Query outcomes on the callback path.

Safaricom still receives HTTP 200 `Accepted` where appropriate so they do not disable the callback URL.

---

## 4. Clerk production key

Not settable in application code. **Actions:** deploy `VITE_CLERK_PUBLISHABLE_KEY=pk_live_…`; run `npm run validate:env:strict` in CI (warns on `pk_test_`).

---

## 5. Remove client-side emergency secrets

- `scripts/lib/envPublicValidation.mjs` — any `VITE_EMERGENCY*` key is an **error** (blocks CI if present in `.env` used for validate).
- `.env.example` documents Edge-only `EMERGENCY_*` secrets (unchanged intent).

---

## 6. Reconciliation job (scheduled)

- **Edge:** `mpesa-payment-reconcile` (existing) — extended as above.  
- **Cron (optional):** `supabase/migrations/20260412230000_sprint1_mpesa_reconcile_pg_cron.sql` schedules `net.http_post` every **15 minutes** when Vault secrets `mpesa_reconcile_project_url` and `mpesa_reconcile_bearer_secret` exist.

---

## Validation matrix (run manually + CI)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Double-click Pay in billing modal | Same `Idempotency-Key` → at most one Daraja STK (replay returns same `checkoutRequestId`) |
| 2 | Billing STK without idempotency key (curl) | Edge returns `success: false`, “Missing Idempotency-Key” |
| 3 | Callback DB insert fails | Row in `payment_webhook_failures`; Safaricom still 200 |
| 4 | Production + Query disagrees with callback | No activation; DLQ row; reconcile can fix after Query aligns |
| 5 | SUCCESS paid row, `subscription_activated=false` | Next reconcile run activates + finalize |
| 6 | `.env` contains `VITE_EMERGENCY_ACCESS=true` | `npm run validate:env` fails with `vite_emergency_forbidden` |

**CI:** `npm test` includes `mpesaStkService.test.ts` and `envPublicValidation.test.mjs`.

---

## Risk (before → after) — Sprint 1 only

| Area | Before | After |
|------|--------|-------|
| Duplicate STK | Client could omit key; edge accepted | Billing requires key; DB unique |
| Spoofed / wrong callback vs reality | Callback trusted alone in all envs | Production: Daraja Query must agree before activation |
| Paid not activated | Manual / one-off SQL | Reconcile phase 2 + cron option |
| Emergency secrets in VITE | Doc risk | Validator **error** |

**Production readiness (whole product):** Sprint 1 improves the **payment path only**; overall score in `SYSTEM_AUDIT` sense remains **Late Beta** until Sprints 2–3+ (data integrity, AuthContext, rate limits, etc.).

---

## Remaining (optional / next sprints)

- Daraja **Transaction Status** / C2B statement reconciliation vs bank  
- HMAC / IP allowlist on callback (if Safaricom documents a supported pattern for your integration)  
- Remove manual payment approval in **product workflow**  
- Sprint 2: soft deletes completeness, FK/orphan jobs, farmer-visible audit  

---

## Files touched (reference)

- `supabase/functions/mpesa-stk-push/index.ts`
- `supabase/functions/mpesa-stk-callback/index.ts`
- `supabase/functions/mpesa-payment-reconcile/index.ts`
- `supabase/migrations/20260412230000_sprint1_mpesa_reconcile_pg_cron.sql`
- `src/services/mpesaStkService.ts` + `src/services/mpesaStkService.test.ts`
- `scripts/lib/envPublicValidation.mjs` + `scripts/lib/envPublicValidation.test.mjs`
- `.env.example`
- `docs/AUDIT_NOT_IMPLEMENTED.md`
