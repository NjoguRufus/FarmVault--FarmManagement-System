-- Persist M-Pesa STK callback payloads (Daraja Lipa Na M-Pesa Online).
-- Written by Edge Function `mpesa-stk-callback` using service_role (bypasses RLS).

create table if not exists public.mpesa_stk_callbacks (
  id uuid primary key default gen_random_uuid(),
  checkout_request_id text,
  merchant_request_id text,
  result_code int,
  result_desc text,
  mpesa_receipt_number text,
  amount text,
  phone_number text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mpesa_stk_callbacks_checkout_request_id_idx
  on public.mpesa_stk_callbacks (checkout_request_id);

create index if not exists mpesa_stk_callbacks_created_at_idx
  on public.mpesa_stk_callbacks (created_at desc);

alter table public.mpesa_stk_callbacks enable row level security;

comment on table public.mpesa_stk_callbacks is 'M-Pesa STK callbacks from Safaricom (inserted by Edge Function only).';

grant usage on schema public to service_role;
grant insert, select on table public.mpesa_stk_callbacks to service_role;
