# Phase 0 — Environment validation checklist

Use this before every production deploy and after rotating credentials.

## Automated check

```bash
npm run validate:env
```

Use strict mode (warnings fail CI):

```bash
npm run validate:env:strict
```

Point at a specific file:

```bash
node scripts/validate-env-public.mjs --file .env.production --strict
```

## Rules enforced by `validate:env`

1. **No server secrets in `VITE_*` keys** — Any `VITE_` variable whose name suggests service role, private keys, Resend/OpenAI/Stripe secrets, or M-Pesa server credentials must be removed or renamed. Client bundles cannot hold these values.
2. **No JWT-like / API-secret-shaped values in `VITE_*` values** — Patterns such as `eyJ...` (three-part JWT) or Stripe `sk_live_` / `sk_test_` in any `VITE_` value are rejected.
3. **Warnings (non-fatal unless `--strict`)**  
   - `VITE_CLERK_PUBLISHABLE_KEY` starting with `pk_test_` — use `pk_live_` in production.  
   - `VITE_ENABLE_DEV_GATEWAY=true` — disable for production.

## Manual checklist (human verification)

- [ ] **Supabase** — `SUPABASE_SERVICE_ROLE_KEY`, database URL, and JWT secret exist only in Supabase Dashboard / CI secrets — never in `VITE_*`.
- [ ] **Clerk** — Production instance uses `pk_live_*` in the deployed frontend env; `CLERK_SECRET_KEY` only on server (edge functions / backend).
- [ ] **M-Pesa** — `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY` only in Edge secrets, not in the repo or `VITE_*`.
- [ ] **Resend / OneSignal** — API keys only server-side (`RESEND_API_KEY` and OneSignal keys in Supabase Edge secrets — never `VITE_*`).
- [ ] **Backup** — `DATABASE_URL` (direct / session mode) documented in a password manager; `npm run backup:db` tested at least once from an operator machine with `pg_dump` installed. Alternatively: Supabase Dashboard → Database → Backups (paid tier) for hosted snapshots.
- [ ] **Edge logs** — After deploy, confirm Supabase Edge Function logs show JSON lines `edge_request_start` / `edge_request_end` / `edge_request_error` with `requestId` for tracing.

## Phase 0 validation tests (run after deploy / CI wiring)

| Test | Expected |
|------|----------|
| `npm run validate:env` on production `.env` | Exit 0; no `[ERROR]` lines |
| `npm run validate:env:strict` on staging `.env` | Exit 0; address any `[WARN]` |
| Invoke any Edge Function (e.g. OPTIONS then POST to `rate-limit-check`) | Response header `x-farmvault-request-id` present; Supabase logs show `edge_request_start` / `edge_request_end` JSON |
| Corrupt handler (dev only) | Uncaught error → log line `edge_request_error` with `stack`; client gets JSON `{ error, requestId }` with HTTP 500 |
| `npm run backup:db` | Folder `backups/FarmVault_*` created; `full_custom_format.dump` exists; `critical_public.sql` or README note if some tables missing |

## Phase 1 (implemented elsewhere in repo)

Emergency access is served by the `emergency-access` Edge Function (secrets in Supabase, not `VITE_*`). Configure `EMERGENCY_*` secrets and deploy that function before relying on `/emergency-access` in production.
