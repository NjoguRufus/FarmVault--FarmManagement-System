-- P0: M-Pesa STK durability — activation guard, orphan callback reconcile support, optional named unique index.

begin;

-- Idempotent activation guard (paired with subscription_activated in Edge + RPC).
alter table public.mpesa_payments
  add column if not exists success_processed boolean not null default false;

comment on column public.mpesa_payments.success_processed is
  'True once activate_subscription_from_mpesa_stk completed successfully for this checkout (prevents duplicate activation).';

update public.mpesa_payments
set success_processed = true
where coalesce(subscription_activated, false) = true
  and coalesce(success_processed, false) = false;

-- checkout_request_id is already UNIQUE on public.mpesa_payments (20260403201000); keeps idempotent STK rows.

-- Callback audit table (baseline from 20260403190000). Some DBs never applied that migration — create if missing.
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

grant usage on schema public to service_role;
grant insert, select on table public.mpesa_stk_callbacks to service_role;

-- Orphan callbacks (payment row never inserted) — used by mpesa-payment-reconcile Edge Function.
-- Explicit RETURNS TABLE avoids dependency on composite type "public.mpesa_stk_callbacks" when the table was missing.
drop function if exists public.list_mpesa_stk_callbacks_without_payment(integer);
drop function if exists public.list_mpesa_stk_callbacks_without_payment(int);

create function public.list_mpesa_stk_callbacks_without_payment(p_limit integer default 40)
returns table (
  id uuid,
  checkout_request_id text,
  merchant_request_id text,
  result_code int,
  result_desc text,
  mpesa_receipt_number text,
  amount text,
  phone_number text,
  raw_payload jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.checkout_request_id,
    c.merchant_request_id,
    c.result_code,
    c.result_desc,
    c.mpesa_receipt_number,
    c.amount,
    c.phone_number,
    c.raw_payload,
    c.created_at
  from public.mpesa_stk_callbacks c
  left join public.mpesa_payments p
    on p.checkout_request_id is not distinct from c.checkout_request_id
  where c.checkout_request_id is not null
    and btrim(c.checkout_request_id) <> ''
    and p.id is null
  order by c.created_at asc
  limit greatest(1, least(coalesce(p_limit, 40), 200));
$$;

revoke all on function public.list_mpesa_stk_callbacks_without_payment(integer) from public;
grant execute on function public.list_mpesa_stk_callbacks_without_payment(integer) to service_role;

comment on function public.list_mpesa_stk_callbacks_without_payment(integer) is
  'STK callbacks with no mpesa_payments row (push insert failure / race); reconcile uses this to self-heal.';

-- Resolve FV-{first 8 hex of uuid} account reference to company id when unambiguous.
create or replace function public.try_resolve_company_from_fv_account_ref(p_ref text)
returns uuid
language sql
stable
security definer
set search_path = core, public
as $$
  with p as (
    select case
      when lower(btrim(p_ref)) like 'fv-%' then nullif(substr(lower(btrim(p_ref)), 4, 8), '')
      else null::text
    end as pref
  ),
  m as (
    select c.id, count(*) over () as cnt
    from core.companies c
    cross join p
    where p.pref is not null
      and length(p.pref) = 8
      and left(replace(c.id::text, '-', ''), 8) = p.pref
  )
  select id from m where cnt = 1 limit 1;
$$;

revoke all on function public.try_resolve_company_from_fv_account_ref(text) from public;
grant execute on function public.try_resolve_company_from_fv_account_ref(text) to service_role;

-- ---------------------------------------------------------------------------
-- STK activation — require SUCCESS status + result_code 0; set success_processed.
-- ---------------------------------------------------------------------------
create or replace function public.activate_subscription_from_mpesa_stk(_checkout_request_id text)
returns uuid
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_payment          record;
  v_company_id       uuid;
  v_plan             text;
  v_cycle            text;
  v_now              timestamptz := clock_timestamp();
  v_receipt          text;
  v_new_payment_id   uuid;
  v_cau              timestamptz;
  v_sub_stat         text;
  v_pay_conf         boolean;
  v_prep_overlap     boolean;
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

  if lower(trim(coalesce(v_payment.status, ''))) <> 'success' then
    raise exception 'Payment status not SUCCESS for: %', _checkout_request_id using errcode = 'P0001';
  end if;

  if coalesce(v_payment.result_code, -1) <> 0 then
    raise exception 'Payment not successful for: %', _checkout_request_id using errcode = 'P0001';
  end if;

  if coalesce(v_payment.subscription_activated, false) then
    if v_payment.company_id is null then
      raise exception 'mpesa_payments row missing company_id' using errcode = 'P0001';
    end if;

    update public.mpesa_payments
    set success_processed = true
    where checkout_request_id = btrim(_checkout_request_id)
      and coalesce(success_processed, false) = false;

    select sp.id
    into v_new_payment_id
    from public.subscription_payments sp
    where lower(btrim(sp.company_id)) = lower(btrim(v_payment.company_id::text))
      and sp.billing_mode = 'mpesa_stk'
      and (
        sp.transaction_code = nullif(trim(coalesce(v_payment.mpesa_receipt, '')), '')
        or sp.notes like '%' || coalesce(v_payment.mpesa_receipt, '') || '%'
      )
    order by sp.created_at desc
    limit 1;

    return v_new_payment_id;
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
  if v_cycle not in ('monthly', 'seasonal', 'annual') then
    v_cycle := 'monthly';
  end if;

  v_receipt := nullif(trim(coalesce(v_payment.mpesa_receipt, '')), '');

  select c.active_until, c.subscription_status::text, coalesce(c.payment_confirmed, false)
  into v_cau, v_sub_stat, v_pay_conf
  from core.companies c
  where c.id = v_company_id;

  v_prep_overlap := coalesce(v_pay_conf, false) = true
    and lower(trim(coalesce(v_sub_stat, ''))) = 'active'
    and v_cau is not null
    and v_cau > v_now;

  perform public.activate_company_subscription(
    v_company_id,
    v_plan,
    v_cycle,
    'mpesa_stk',
    'mpesa_stk',
    v_prep_overlap
  );

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
    lower(btrim(v_company_id::text)),
    v_plan,
    coalesce(v_payment.amount, 0),
    'approved',
    'mpesa_stk',
    'mpesa_stk',
    v_receipt,
    v_cycle,
    'Auto activated via STK',
    'KES',
    v_now,
    v_now,
    v_now,
    v_now,
    'mpesa_stk'
  )
  returning id into v_new_payment_id;

  perform public.apply_excess_for_subscription_payment(v_new_payment_id, v_prep_overlap);

  update public.mpesa_payments
  set
    subscription_activated = true,
    success_processed = true
  where checkout_request_id = btrim(_checkout_request_id);

  return v_new_payment_id;
end;
$$;

revoke all on function public.activate_subscription_from_mpesa_stk(text) from public;
grant execute on function public.activate_subscription_from_mpesa_stk(text) to service_role;

commit;
