-- FarmVault: billing receipts (PDF + email), storage bucket, RLS.
-- Receipt numbers: FV-RCT-0001, FV-RCT-0002, …
-- STK activation RPC returns new subscription_payment id for receipt issuance.

begin;

-- ---------------------------------------------------------------------------
-- Sequence + allocator (service_role / security definer only)
-- ---------------------------------------------------------------------------
create sequence if not exists public.billing_receipt_number_seq;

create or replace function public.alloc_billing_receipt_number()
returns text
language sql
security definer
set search_path = public
as $$
  select 'FV-RCT-' || lpad(nextval('public.billing_receipt_number_seq')::text, 4, '0');
$$;

revoke all on function public.alloc_billing_receipt_number() from public;
grant execute on function public.alloc_billing_receipt_number() to service_role;

-- ---------------------------------------------------------------------------
-- Receipts table (links to canonical subscription_payment)
-- ---------------------------------------------------------------------------
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null,
  company_id uuid not null references core.companies (id) on delete cascade,
  user_id text,
  subscription_payment_id uuid not null references public.subscription_payments (id) on delete restrict,
  amount numeric(14, 2) not null,
  currency text not null default 'KES',
  payment_method text not null,
  transaction_reference text,
  plan text,
  status text not null default 'paid',
  issued_at timestamptz not null default now(),
  pdf_storage_path text not null,
  pdf_url text,
  line_items jsonb not null default '[]'::jsonb,
  billing_period text,
  subtotal numeric(14, 2),
  vat_amount numeric(14, 2),
  discount_amount numeric(14, 2),
  company_name_snapshot text,
  workspace_name_snapshot text,
  admin_name_snapshot text,
  customer_email text,
  customer_phone text,
  email_sent_at timestamptz,
  customer_since timestamptz,
  payment_cycle text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint receipts_status_chk check (status in ('paid', 'refunded', 'void', 'pending')),
  constraint receipts_number_unique unique (receipt_number),
  constraint receipts_sub_payment_unique unique (subscription_payment_id)
);

create index if not exists receipts_company_id_issued_at_idx
  on public.receipts (company_id, issued_at desc);

create index if not exists receipts_receipt_number_idx
  on public.receipts (receipt_number);

comment on table public.receipts is 'FarmVault payment receipts; PDF in storage bucket billing-receipts.';

alter table public.receipts enable row level security;

drop policy if exists receipts_select_authenticated on public.receipts;
create policy receipts_select_authenticated
  on public.receipts
  for select
  to authenticated
  using (
    public.is_developer()
    or public.row_company_matches_user(company_id)
  );

drop policy if exists receipts_update_developer on public.receipts;
create policy receipts_update_developer
  on public.receipts
  for update
  to authenticated
  using (public.is_developer())
  with check (public.is_developer());

grant select on public.receipts to authenticated;
grant all on public.receipts to service_role;

-- Tenant / edge: can user resend email for this receipt?
create or replace function public.billing_receipt_tenant_can_access(_receipt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.receipts r
    where r.id = _receipt_id
      and public.row_company_matches_user(r.company_id)
  );
$$;

revoke all on function public.billing_receipt_tenant_can_access(uuid) from public;
grant execute on function public.billing_receipt_tenant_can_access(uuid) to authenticated;
grant execute on function public.billing_receipt_tenant_can_access(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Storage: billing-receipts (private PDFs; path = {company_id}/{receipt_id}.pdf)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'billing-receipts',
  'billing-receipts',
  false,
  5242880,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists billing_receipts_objects_select on storage.objects;
create policy billing_receipts_objects_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'billing-receipts'
    and (
      public.is_developer()
      or (
        public.current_company_id() is not null
        and (storage.foldername(name))[1] = public.current_company_id()::text
      )
    )
  );

-- ---------------------------------------------------------------------------
-- STK activation: return new subscription_payment id (null if already activated)
-- ---------------------------------------------------------------------------
-- Postgres cannot change the return type with CREATE OR REPLACE (42P13).
drop function if exists public.activate_subscription_from_mpesa_stk(text);

create function public.activate_subscription_from_mpesa_stk(_checkout_request_id text)
returns uuid
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_payment record;
  v_company_id uuid;
  v_plan text;
  v_cycle text;
  v_active_until timestamptz;
  v_now timestamptz := clock_timestamp();
  v_receipt text;
  v_sub_payment_id uuid;
begin
  if _checkout_request_id is null or btrim(_checkout_request_id) = '' then
    raise exception 'checkout_request_id required' using errcode = 'P0001';
  end if;

  select *
  into v_payment
  from public.mpesa_payments
  where checkout_request_id = btrim(_checkout_request_id);

  if not found then
    raise exception 'Payment not found: %', _checkout_request_id using errcode = 'P0001';
  end if;

  if coalesce(v_payment.result_code, -1) <> 0 then
    raise exception 'Payment not successful for: %', _checkout_request_id using errcode = 'P0001';
  end if;

  if coalesce(v_payment.subscription_activated, false) then
    return null;
  end if;

  if v_payment.company_id is null then
    raise exception 'mpesa_payments row missing company_id' using errcode = 'P0001';
  end if;

  v_company_id := v_payment.company_id::uuid;

  v_plan := lower(trim(coalesce(v_payment.plan, 'basic')));
  if v_plan not in ('basic', 'pro') then
    v_plan := case when v_plan like '%pro%' then 'pro' else 'basic' end;
  end if;

  v_cycle := lower(trim(coalesce(v_payment.billing_cycle, 'monthly')));
  if v_cycle = 'seasonal' then
    v_active_until := v_now + interval '3 months';
  elsif v_cycle = 'annual' then
    v_active_until := v_now + interval '1 year';
  else
    v_cycle := 'monthly';
    v_active_until := v_now + interval '1 month';
  end if;

  v_receipt := nullif(trim(coalesce(v_payment.mpesa_receipt, '')), '');

  insert into public.company_subscriptions (
    company_id,
    plan_id,
    plan_code,
    plan,
    status,
    billing_mode,
    billing_cycle,
    is_trial,
    trial_started_at,
    trial_starts_at,
    trial_ends_at,
    current_period_start,
    current_period_end,
    active_until,
    approved_at,
    approved_by,
    updated_at,
    updated_by
  )
  values (
    v_company_id,
    v_plan,
    v_plan,
    v_plan,
    'active',
    'mpesa_stk',
    v_cycle,
    false,
    null,
    null,
    null,
    v_now,
    v_active_until,
    v_active_until,
    v_now,
    'mpesa_stk',
    v_now,
    'mpesa_stk'
  )
  on conflict (company_id) do update set
    plan_id = excluded.plan_id,
    plan_code = excluded.plan_code,
    plan = excluded.plan,
    status = 'active',
    billing_mode = 'mpesa_stk',
    billing_cycle = excluded.billing_cycle,
    is_trial = false,
    trial_started_at = null,
    trial_starts_at = null,
    trial_ends_at = null,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    active_until = excluded.active_until,
    approved_at = excluded.approved_at,
    approved_by = excluded.approved_by,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  update core.companies
  set
    plan = v_plan,
    payment_confirmed = true,
    pending_confirmation = false,
    active_until = v_active_until,
    trial_ends_at = null,
    updated_at = v_now
  where id = v_company_id;

  insert into public.subscription_payments (
    company_id,
    plan_id,
    amount,
    status,
    billing_mode,
    payment_method,
    transaction_code,
    billing_cycle,
    notes,
    currency,
    created_at,
    submitted_at,
    approved_at,
    reviewed_at,
    reviewed_by
  )
  values (
    v_company_id::text,
    v_plan,
    coalesce(v_payment.amount, 0),
    'approved',
    'mpesa_stk',
    'mpesa_stk',
    v_receipt,
    v_cycle,
    'Auto-activated via M-Pesa STK. Receipt: ' || coalesce(v_receipt, 'N/A'),
    'KES',
    v_now,
    v_now,
    v_now,
    v_now,
    'mpesa_stk'
  )
  returning id into v_sub_payment_id;

  update public.mpesa_payments
  set subscription_activated = true
  where checkout_request_id = btrim(_checkout_request_id);

  return v_sub_payment_id;
end;
$$;

revoke all on function public.activate_subscription_from_mpesa_stk(text) from public;
grant execute on function public.activate_subscription_from_mpesa_stk(text) to service_role;

commit;

notify pgrst, 'reload schema';
