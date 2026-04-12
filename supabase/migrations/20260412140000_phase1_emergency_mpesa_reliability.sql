-- Phase 1: emergency access audit trail, payment webhook dead-letter, reconciliation log,
--         idempotency key on M-Pesa STK rows (client-supplied, optional).

begin;

-- ---------------------------------------------------------------------------
-- Emergency access — attempts logged by Edge (service_role only).
-- ---------------------------------------------------------------------------
create table if not exists public.emergency_access_attempts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email_normalized text,
  success boolean not null default false,
  error_code text,
  client_hint text,
  edge_request_id text
);

comment on table public.emergency_access_attempts is
  'Audit log for emergency-access Edge Function (no PII beyond normalized email).';

alter table public.emergency_access_attempts enable row level security;

grant select, insert on table public.emergency_access_attempts to service_role;

-- ---------------------------------------------------------------------------
-- Payment webhooks — dead-letter when callback processing fails (retry target).
-- ---------------------------------------------------------------------------
create table if not exists public.payment_webhook_failures (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null default 'mpesa_stk_callback',
  checkout_request_id text,
  raw_body text,
  error_message text,
  attempts int not null default 0,
  last_retry_at timestamptz,
  resolved_at timestamptz
);

comment on table public.payment_webhook_failures is
  'Failed or partially processed payment webhooks; reconciled by mpesa-payment-reconcile Edge Function.';

create index if not exists payment_webhook_failures_unresolved_idx
  on public.payment_webhook_failures (created_at desc)
  where resolved_at is null;

alter table public.payment_webhook_failures enable row level security;

grant select, insert, update on table public.payment_webhook_failures to service_role;

-- ---------------------------------------------------------------------------
-- Reconciliation / STK query outcomes (operator visibility).
-- ---------------------------------------------------------------------------
create table if not exists public.payment_reconciliation_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  checkout_request_id text,
  db_status text,
  daraja_result_code int,
  daraja_result_desc text,
  action_taken text
);

comment on table public.payment_reconciliation_log is
  'Append-only log from mpesa-payment-reconcile (STK Query vs DB).';

alter table public.payment_reconciliation_log enable row level security;

grant select, insert on table public.payment_reconciliation_log to service_role;

-- ---------------------------------------------------------------------------
-- STK idempotency — same key replays prior CheckoutRequestID without new Daraja push.
-- ---------------------------------------------------------------------------
alter table public.mpesa_payments
  add column if not exists idempotency_key text;

create unique index if not exists mpesa_payments_idempotency_key_uidx
  on public.mpesa_payments (idempotency_key)
  where idempotency_key is not null and btrim(idempotency_key) <> '';

comment on column public.mpesa_payments.idempotency_key is
  'Optional client idempotency key (header Idempotency-Key); unique when set.';

commit;
