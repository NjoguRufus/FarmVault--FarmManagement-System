-- Force correct subscription state for companies with approved payments.
--
-- Root cause: activate_company_subscription was not always called (missing migration or STK race),
-- leaving access_level='pro_trial', subscription_status='trialing', is_trial=true even after
-- payment approval. The gate RPC override catches this at read time, but the developer companies
-- table reads raw columns and shows stale state.
--
-- This migration:
-- 1) Recreates activate_company_subscription to set ALL required columns atomically.
-- 2) Backfills every company where an approved payment exists but DB columns are still in trial state.
-- 3) Backfills company_subscriptions rows to match.

begin;

-- ---------------------------------------------------------------------------
-- 1) Recreate activate_company_subscription — force ALL fields on paid activation
-- ---------------------------------------------------------------------------
create or replace function public.activate_company_subscription(
  p_company_id   uuid,
  p_plan         text,
  p_cycle        text,
  p_billing_mode text default 'mpesa_stk',
  p_actor        text default null
)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_plan         text;
  v_cycle        text;
  v_active_until timestamptz;
  v_now          timestamptz := clock_timestamp();
  v_mode         text := lower(trim(coalesce(p_billing_mode, 'mpesa_stk')));
  v_actor        text := nullif(trim(coalesce(p_actor, '')), '');
begin
  if p_company_id is null then
    raise exception 'company_id required' using errcode = 'P0001';
  end if;

  if coalesce(auth.role()::text, '') is distinct from 'service_role' and not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_actor is null then
    v_actor := 'system';
  end if;

  v_plan := lower(trim(coalesce(p_plan, 'basic')));
  if v_plan not in ('basic', 'pro') then
    v_plan := case when v_plan like '%pro%' then 'pro' else 'basic' end;
  end if;

  v_cycle := lower(trim(coalesce(p_cycle, 'monthly')));
  if v_cycle = 'seasonal' then
    v_active_until := v_now + interval '3 months';
  elsif v_cycle = 'annual' then
    v_active_until := v_now + interval '1 year';
  else
    v_cycle := 'monthly';
    v_active_until := v_now + interval '1 month';
  end if;

  -- Upsert company_subscriptions — clear all trial fields atomically.
  insert into public.company_subscriptions (
    company_id, plan_id, plan_code, plan, status,
    billing_mode, billing_cycle,
    is_trial, trial_started_at, trial_starts_at, trial_ends_at,
    current_period_start, current_period_end, active_until,
    approved_at, approved_by, updated_at, updated_by
  )
  values (
    p_company_id, v_plan, v_plan, v_plan, 'active',
    v_mode, v_cycle,
    false, null, null, null,
    v_now, v_active_until, v_active_until,
    v_now, v_actor, v_now, v_actor
  )
  on conflict (company_id) do update set
    plan_id              = excluded.plan_id,
    plan_code            = excluded.plan_code,
    plan                 = excluded.plan,
    status               = 'active',
    billing_mode         = excluded.billing_mode,
    billing_cycle        = excluded.billing_cycle,
    is_trial             = false,
    trial_started_at     = null,
    trial_starts_at      = null,
    trial_ends_at        = null,
    current_period_start = excluded.current_period_start,
    current_period_end   = excluded.current_period_end,
    active_until         = excluded.active_until,
    approved_at          = excluded.approved_at,
    approved_by          = excluded.approved_by,
    updated_at           = excluded.updated_at,
    updated_by           = excluded.updated_by;

  -- Update core.companies — ALL subscription-related columns.
  update core.companies
  set
    plan                 = v_plan,
    access_level         = v_plan,
    subscription_status  = 'active',
    payment_confirmed    = true,
    pending_confirmation = false,
    active_until         = v_active_until,
    trial_ends_at        = null,
    trial_started_at     = null,
    updated_at           = v_now
  where id = p_company_id;
end;
$$;

revoke all on function public.activate_company_subscription(uuid, text, text, text, text) from public;
grant execute on function public.activate_company_subscription(uuid, text, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Recreate approve_subscription_payment — delegates to activate_company_subscription
--    and also normalises company_id on the payment row.
-- ---------------------------------------------------------------------------
create or replace function public.approve_subscription_payment(_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_company_id_text text;
  v_company_id       uuid;
  v_plan             text;
  v_cycle            text;
  v_reviewer         text;
  v_now              timestamptz := clock_timestamp();
  v_amount           numeric;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_reviewer := core.current_user_id();

  update public.subscription_payments sp
  set
    status      = 'approved'::public.subscription_payment_status,
    approved_at = v_now,
    approved_by = v_reviewer,
    reviewed_at = v_now,
    reviewed_by = v_reviewer,
    rejected_at = null
  where sp.id = _payment_id
    and sp.status in (
      'pending'::public.subscription_payment_status,
      'pending_verification'::public.subscription_payment_status
    )
  returning sp.company_id, sp.plan_id, sp.billing_cycle, sp.amount
  into v_company_id_text, v_plan, v_cycle, v_amount;

  if v_company_id_text is null then
    raise exception 'Payment not found or not pending' using errcode = 'P0001';
  end if;

  begin
    v_company_id := trim(v_company_id_text)::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Invalid company_id on payment row' using errcode = 'P0001';
  end;

  v_plan := lower(trim(coalesce(v_plan, 'basic')));
  if v_plan not in ('basic', 'pro') then
    v_plan := case when v_plan like '%pro%' then 'pro' else 'basic' end;
  end if;

  v_cycle := lower(trim(coalesce(v_cycle, 'monthly')));
  if v_cycle not in ('monthly', 'seasonal', 'annual') then
    v_cycle := 'monthly';
  end if;

  -- Single activation path — sets ALL columns atomically.
  perform public.activate_company_subscription(
    v_company_id, v_plan, v_cycle, 'manual', v_reviewer
  );

  -- Normalise company_id text on the payment row.
  update public.subscription_payments sp
  set company_id = lower(btrim(sp.company_id))
  where sp.id = _payment_id;

  perform public.apply_farmer_referral_subscription_commission(
    v_company_id, coalesce(v_amount, 0), 'manual_approval'
  );
end;
$$;

grant execute on function public.approve_subscription_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Backfill — every company with an approved payment but stale trial state
-- ---------------------------------------------------------------------------
with latest_pay as (
  select distinct on (lower(btrim(sp.company_id)))
    lower(btrim(sp.company_id))                                                  as cid,
    case when lower(btrim(coalesce(sp.plan_id, ''))) like '%pro%'
         then 'pro'::text else 'basic'::text end                                 as plan_norm,
    lower(btrim(coalesce(nullif(btrim(sp.billing_cycle::text), ''), 'monthly'))) as cycle_norm,
    coalesce(sp.approved_at, sp.created_at)                                      as pay_at
  from public.subscription_payments sp
  where sp.status = 'approved'::public.subscription_payment_status
    and sp.company_id is not null
    and btrim(sp.company_id) <> ''
  order by lower(btrim(sp.company_id)), sp.approved_at desc nulls last, sp.created_at desc
),
pay_norm as (
  select
    cid,
    plan_norm,
    cycle_norm,
    pay_at,
    case
      when cycle_norm = 'seasonal' then pay_at + interval '3 months'
      when cycle_norm = 'annual'   then pay_at + interval '1 year'
      else                              pay_at + interval '1 month'
    end as period_end
  from latest_pay
)
update core.companies c
set
  plan                 = p.plan_norm,
  access_level         = p.plan_norm,
  subscription_status  = 'active',
  payment_confirmed    = true,
  pending_confirmation = false,
  trial_ends_at        = null,
  trial_started_at     = null,
  active_until         = coalesce(c.active_until, p.period_end),
  updated_at           = clock_timestamp()
from pay_norm p
where lower(btrim(c.id::text)) = p.cid
  and (
    lower(btrim(coalesce(c.subscription_status, ''))) <> 'active'
    or lower(btrim(coalesce(c.access_level, '')))     not in ('pro', 'basic')
    or c.trial_ends_at is not null
    or coalesce(c.payment_confirmed, false) = false
  );

-- Backfill company_subscriptions
with latest_pay as (
  select distinct on (lower(btrim(sp.company_id)))
    lower(btrim(sp.company_id))                                                  as cid,
    case when lower(btrim(coalesce(sp.plan_id, ''))) like '%pro%'
         then 'pro'::text else 'basic'::text end                                 as plan_norm,
    lower(btrim(coalesce(nullif(btrim(sp.billing_cycle::text), ''), 'monthly'))) as cycle_norm,
    coalesce(sp.approved_at, sp.created_at)                                      as pay_at
  from public.subscription_payments sp
  where sp.status = 'approved'::public.subscription_payment_status
    and sp.company_id is not null
    and btrim(sp.company_id) <> ''
  order by lower(btrim(sp.company_id)), sp.approved_at desc nulls last, sp.created_at desc
),
pay_norm as (
  select
    cid,
    plan_norm,
    cycle_norm,
    pay_at,
    case
      when cycle_norm = 'seasonal' then pay_at + interval '3 months'
      when cycle_norm = 'annual'   then pay_at + interval '1 year'
      else                              pay_at + interval '1 month'
    end as period_end
  from latest_pay
)
update public.company_subscriptions s
set
  plan_id              = p.plan_norm,
  plan_code            = p.plan_norm,
  plan                 = p.plan_norm,
  status               = 'active',
  is_trial             = false,
  trial_started_at     = null,
  trial_starts_at      = null,
  trial_ends_at        = null,
  current_period_start = coalesce(s.current_period_start, p.pay_at),
  current_period_end   = coalesce(s.current_period_end, p.period_end),
  active_until         = coalesce(s.active_until, p.period_end),
  updated_at           = clock_timestamp()
from pay_norm p
where lower(btrim(s.company_id::text)) = p.cid
  and (
    lower(btrim(coalesce(s.status::text, ''))) <> 'active'
    or coalesce(s.is_trial, false) = true
    or s.trial_ends_at is not null
  );

commit;

notify pgrst, 'reload schema';
