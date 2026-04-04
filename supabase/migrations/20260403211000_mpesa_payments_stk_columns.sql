-- Extra columns for STK activation RPC and PayBill reference (idempotent).

begin;

alter table public.mpesa_payments
  add column if not exists billing_reference text,
  add column if not exists plan text,
  add column if not exists billing_cycle text,
  add column if not exists result_code int,
  add column if not exists subscription_activated boolean not null default false;

-- Align status with callback (uppercase enums in app); column already exists on older DBs.
alter table public.mpesa_payments
  alter column status set default 'PENDING';

commit;
