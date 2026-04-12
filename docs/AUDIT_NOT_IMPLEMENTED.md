# FarmVault — Not implemented (from `SYSTEM_AUDIT_2026-04-12.md`)

This file tracks **what the audit called out that is still missing or only partially done**. It is derived from `docs/SYSTEM_AUDIT_2026-04-12.md` and follow-up remediation work. Update this file when large items ship.

**Legend:** `—` not done · `~` partial / needs verification · `✓` done (see repo or other docs; not listed here)

### Sprint 1 (Payments + security) — 2026-04-12

See **`docs/SPRINT_01_PAYMENTS_SECURITY.md`** for implementation notes, env keys, and test matrix. Summary: production STK Query gate before activation, DLQ inserts on callback/persist/activate failures, required billing idempotency key on Edge + client, stuck SUCCESS activation pass in `mpesa-payment-reconcile`, optional pg_cron migration, `validate:env` rejects `VITE_EMERGENCY_*`.

---

## Must-fix before scaling (audit ordered list)

| # | Item | Status |
|---|------|--------|
| 1 | Fully automated M-Pesa payment verification (no manual developer approval) | ~ (Daraja STK Query + reconcile auto-activate; **manual developer approval** in business process may still exist — product) |
| 2 | Emergency access: no client-bundled secrets; policy + rotation | ~ (`validate:env` **error** on `VITE_EMERGENCY_*`; Edge `emergency-access` only — ops must enforce) |
| 3 | Clerk **production** publishable key in production | — (deployment; `validate:env` warns on `pk_test_`) |
| 4 | M-Pesa idempotency end-to-end + callback dead-letter / replay story | ~ (required `Idempotency-Key` billing; unique `idempotency_key`; DLQ rows on callback failures; reconcile retries activation) |
| 5 | Rate limiting: resolve RLS vs `check_rate_limit` permission ambiguity; optional move to Edge-only preflight | ~ |
| 6 | Payment reconciliation job (M-Pesa vs DB) | ~ (`mpesa-payment-reconcile` extended + optional **pg_cron** migration `20260412230000_*`; not a full Daraja C2B statement diff) |
| 7 | Split `AuthContext.tsx` into smaller hooks/providers | — |
| 8 | Offline write queue for **all** critical mutations + conflict UI | ~ (harvest-oriented queue exists; not universal; little user-facing conflict UX) |
| 9 | Soft deletes for **all** business entities | ~ (Phase 2 + Sprint 2: `harvest.harvests`; not every table) |
| 10 | Single canonical plan naming across **all** billing columns (`plan_code` / `plan_id` / `plan` consolidation) | ~ (`core.companies.plan` normalized to basic/pro/enterprise; wider schema cleanup TBD) |

---

## Step 3 — Missing features (checklist)

### Security & compliance

- [ ] User-visible “who accessed my data” log  
- [ ] Kenya Data Protection Act–style consent flow  
- [ ] GDPR data export (portability)  
- [ ] Right to erasure for farmers  
- [ ] MFA enforcement for developer/admin (Clerk + app policy)  
- [ ] IP allowlist for admin/developer surfaces  
- [ ] Penetration test / formal security review  
- [ ] Ambassador privacy disclosure (referrer sees farmer/company identifiers)  

### Data integrity

- [ ] Soft delete on every entity the audit implied  
- [~] Per-entity audit trail visible to **farmers** (`record_audit_log` RLS + Settings “Record change history”; not per-field UI on entities)  
- [ ] Rollback for destructive operations  
- [~] Orphan detection + cleanup jobs (`public.data_integrity_findings` + `public.fv_run_data_integrity_checks`; developer/service_role; no automated cleanup)  
- [ ] Documented + enforced FK cascade/restrict across modules  

### Billing

- [ ] Automated M-Pesa verification replacing manual approval  
- [ ] Card / Stripe (international)  
- [ ] Idempotency keys on every payment initiation path  
- [ ] Full dead-letter + replay for failed callbacks  
- [ ] Daily reconciliation job  
- [ ] Subscription dunning  
- [ ] Prorated plan changes  
- [ ] Self-serve billing portal  
- [ ] Accountant-grade invoices (beyond receipts)  
- [ ] Multi-currency  

### Operations

- [ ] Bulk CSV/Excel import (any module)  
- [ ] Bulk table operations (delete/update/export)  
- [ ] Project templates (“like last season”)  
- [ ] Project archival (non-destructive)  
- [ ] Company ownership transfer  
- [ ] Employee invite expiry  
- [ ] Expense approval workflow  
- [ ] Receipt attachments on expenses  
- [ ] Inventory min-stock alerts  
- [ ] Inventory expiry tracking  
- [ ] Lot/batch tracking for chemicals  

### Analytics & insights

- [ ] Per-farm P&L dashboard  
- [ ] Yield trend analysis  
- [ ] Cost per kg / unit  
- [ ] Peer benchmarking  
- [ ] Export any report to Excel/PDF  
- [ ] Harvest batch settlement tracking (as specified in audit)  

### Developer operations

- [ ] Feature flag system (LaunchDarkly or DB-backed flags + RPC)  
- [ ] Company impersonation / shadow login for support  
- [ ] Automated alerting (errors, payment failures)  
- [ ] Real-time system health dashboard  
- [ ] Incident runbooks  

### Ambassador

- [ ] Self-referral prevention  
- [ ] Referral link expiry  
- [ ] Commission clawback on refunds  
- [ ] Ambassador tier system  
- [ ] Automated M-Pesa B2C ambassador payouts  

### PWA / offline

- [ ] Offline queue covering **all** critical writes  
- [ ] Conflict resolution UI (“unsynced changes”)  
- [ ] Background sync for pending uploads (beyond current reconnect sync)  

### AI (planned)

- [ ] LLM integration  
- [ ] Farm data context pipeline  
- [ ] AI rate limits + privacy copy  
- [ ] Crop recommendation / pest ID from photo  

---

## Step 4 — Improvements not fully done

### Backend

- [ ] Daraja transaction status query to auto-confirm payments post-callback  
- [ ] Idempotency on **all** payment flows (verify `mpesa-stk-push` + DB constraints)  
- [ ] Replace in-RLS rate limits with Edge preflight **everywhere** (if that is the chosen architecture)  
- [ ] `rate_limits` cleanup cron enabled and monitored  
- [ ] Drop redundant billing plan columns after single `plan_code` migration  
- [ ] M-Pesa callback HMAC / origin verification (confirm Safaricom signing model)  

### Architecture

- [ ] Marketing/SEO on Astro or Next static export  
- [ ] Job queue (pg_boss, Redis, etc.) with retries + DLQ  
- [ ] Remove Firebase + MongoDB from `package.json` when truly unused  
- [ ] Central feature-flags table + `is_feature_enabled` RPC  
- [ ] Frontend: all domain access via service modules (reduce direct Supabase in pages)  

### Security (remaining)

- [ ] Clerk production keys + org MFA policy for privileged roles  
- [ ] Any remaining client-exposed emergency or bootstrap secrets audited  

### Monetization

- [ ] New mid-tier “Starter” SKU (5 projects / etc.) as audit suggested  
- [ ] Prominent annual savings messaging  
- [ ] Usage add-ons (e.g. extra project packs)  
- [ ] Automated ambassador commission payouts  

---

## Critical risks (Step 2) — still open or partial

| Risk | Notes |
|------|--------|
| Manual payment approval at scale | Still the main ops bottleneck until automated |
| Clerk test key in prod | Ops / env |
| Callback reliability if Edge is down | Partial logging to `payment_webhook_failures`; no full queue |
| Double STK / idempotency | Needs explicit product + API review |
| `check_rate_limit` inside RLS | Architecture / testing still open |
| Developer read-all access + DPA | Policy, logging, consent — not implemented |
| Farmer-visible row audit | Not implemented |
| AuthContext size / testability | Not implemented |
| SPA SEO vs SSR | Not implemented |
| 164 migrations / plan column sprawl | Partially addressed for `core.companies.plan` only |
| No background job platform | Not implemented |
| Single-region / DR | Not implemented |

---

## UX gaps (audit Step “UX problems”) — not implemented

- [ ] Basic plan limits vs real farm size (product decision)  
- [ ] Instant expectation after M-Pesa vs manual approval  
- [ ] Clear offline failure feedback everywhere  
- [ ] Post-trial modal grace / comparison  
- [ ] Multi-item bulk entry flows  
- [ ] Search/filter persistence across navigation  
- [ ] Smarter PWA install prompt timing  
- [ ] Navigation strategy for 166 routes  

---

*Source: `docs/SYSTEM_AUDIT_2026-04-12.md`. Complemented by remediation phases (soft delete, offline harvest queue, CSP headers, plan column normalization, analytics RPC soft-delete, blog HTML sanitization) documented elsewhere in git history.*
