-- Central paid activation + gate read fix + backfill drift.
--
-- 1) public.activate_company_subscription — single path to end trial snapshot and upsert paid rows
--    (callable from service_role STK path or developer manual approve; not for tenant self-serve).
-- 2) activate_subscription_from_mpesa_stk + approve_subscription_payment delegate to it.
-- 3) get_subscription_gate_state: approved payment forces "active" for any pre-paid subscription row
--    (trial / trialing / pending_approval / pending_payment / pending), not only trial/trialing.
-- 4) Backfill companies still showing trial/pending snapshot when an approved payment exists.

begin;

-- ---------------------------------------------------------------------------
-- activate_company_subscription
-- ---------------------------------------------------------------------------
create or replace function public.activate_company_subscription(
  p_company_id uuid,
  p_plan text,
  p_cycle text,
  p_billing_mode text default 'mpesa_stk',
  p_actor text default null
)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_plan text;
  v_cycle text;
  v_active_until timestamptz;
  v_now timestamptz := clock_timestamp();
  v_mode text := lower(trim(coalesce(p_billing_mode, 'mpesa_stk')));
  v_actor text := nullif(trim(coalesce(p_actor, '')), '');
begin
  if p_company_id is null then
    raise exception 'company_id required' using errcode = 'P0001';
  end if;

  -- Prefer auth.role() (Supabase) so nested calls from STK (service_role) still authorize reliably.
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
    p_company_id,
    v_plan,
    v_plan,
    v_plan,
    'active',
    v_mode,
    v_cycle,
    false,
    null,
    null,
    null,
    v_now,
    v_active_until,
    v_active_until,
    v_now,
    v_actor,
    v_now,
    v_actor
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

  update core.companies
  set
    plan                 = v_plan,
    payment_confirmed    = true,
    pending_confirmation = false,
    active_until         = v_active_until,
    trial_ends_at        = null,
    trial_started_at     = null,
    subscription_status  = 'active',
    access_level         = v_plan,
    updated_at           = v_now
  where id = p_company_id;
end;
$$;

revoke all on function public.activate_company_subscription(uuid, text, text, text, text) from public;
grant execute on function public.activate_company_subscription(uuid, text, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- STK activation — delegate core sync, then insert payment row
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
    select id into v_new_payment_id
    from public.subscription_payments
    where lower(btrim(company_id)) = lower(btrim(v_payment.company_id::text))
      and billing_mode = 'mpesa_stk'
      and (
        transaction_code = nullif(trim(coalesce(v_payment.mpesa_receipt, '')), '')
        or notes like '%' || coalesce(v_payment.mpesa_receipt, '') || '%'
      )
    order by created_at desc
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

  perform public.activate_company_subscription(
    v_company_id,
    v_plan,
    v_cycle,
    'mpesa_stk',
    'mpesa_stk'
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

  update public.mpesa_payments
  set subscription_activated = true
  where checkout_request_id = btrim(_checkout_request_id);

  return v_new_payment_id;
end;
$$;

revoke all on function public.activate_subscription_from_mpesa_stk(text) from public;
grant execute on function public.activate_subscription_from_mpesa_stk(text) to service_role;

-- ---------------------------------------------------------------------------
-- Manual approve — delegate core sync after marking payment approved
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
    status = 'approved'::public.subscription_payment_status,
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

  perform public.activate_company_subscription(
    v_company_id,
    v_plan,
    v_cycle,
    'manual',
    v_reviewer
  );

  update public.subscription_payments sp
  set company_id = lower(btrim(sp.company_id))
  where sp.id = _payment_id;

  perform public.apply_farmer_referral_subscription_commission(
    v_company_id,
    coalesce(v_amount, 0),
    'manual_approval'
  );
end;
$$;

grant execute on function public.approve_subscription_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_subscription_gate_state — approved payment wins for all non-terminal rows
-- ---------------------------------------------------------------------------
create or replace function public.get_subscription_gate_state()
returns table (
  company_id uuid,
  company_name text,
  company_status text,
  billing_reference text,
  selected_plan text,
  billing_mode text,
  status text,
  created_at timestamptz,
  approved_at timestamptz,
  approved_by text,
  rejection_reason text,
  override_reason text,
  is_trial boolean,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  developer_override_active boolean,
  billing_cycle text,
  current_period_end timestamptz,
  active_until timestamptz
)
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
declare
  v_company_id uuid;
begin
  v_company_id := core.current_company_id();

  if v_company_id is null then
    return;
  end if;

  return query
  select
    c.id as company_id,
    c.name as company_name,
    c.status::text as company_status,
    nullif(btrim(c.billing_reference::text), '') as billing_reference,
    coalesce(
      case
        when g.eff_status = 'active' and pay.pay_plan is not null and btrim(pay.pay_plan) <> '' then
          case
            when lower(pay.pay_plan) like '%pro%' then 'pro'::text
            else 'basic'::text
          end
        else null
      end,
      s.plan_id,
      s.plan_code,
      'basic'
    )::text as selected_plan,
    coalesce(s.billing_mode, 'manual')::text as billing_mode,
    g.eff_status::text as status,
    c.created_at,
    s.approved_at,
    s.approved_by,
    s.rejection_reason,
    coalesce(s.override_reason, s.override ->> 'reason') as override_reason,
    case
      when g.eff_status = 'active' then false
      else coalesce(s.is_trial, false)
    end as is_trial,
    case
      when g.eff_status = 'active' then null::timestamptz
      else coalesce(s.trial_started_at, s.trial_starts_at)
    end as trial_started_at,
    case
      when g.eff_status = 'active' then null::timestamptz
      else s.trial_ends_at
    end as trial_ends_at,
    exists (
      select 1
      from admin.subscription_overrides o
      where o.company_id = c.id
        and (o.expires_at is null or o.expires_at > now())
    ) as developer_override_active,
    s.billing_cycle,
    coalesce(s.current_period_end, c.active_until) as current_period_end,
    coalesce(s.active_until, c.active_until) as active_until
  from core.companies c
  left join public.company_subscriptions s on s.company_id::text = c.id::text
  cross join lateral (
    select
      exists (
        select 1
        from public.subscription_payments sp
        where lower(btrim(sp.company_id)) = lower(btrim(c.id::text))
          and sp.status = 'approved'::public.subscription_payment_status
      ) as has_approved,
      (
        select sp.plan_id::text
        from public.subscription_payments sp
        where lower(btrim(sp.company_id)) = lower(btrim(c.id::text))
          and sp.status = 'approved'::public.subscription_payment_status
        order by sp.approved_at desc nulls last, sp.created_at desc
        limit 1
      ) as pay_plan
  ) pay
  cross join lateral (
    select
      case
        when pay.has_approved
          and (
            s.company_id is null
            or lower(btrim(coalesce(s.status::text, ''))) not in (
              'active',
              'suspended',
              'rejected',
              'expired'
            )
          )
        then 'active'::text
        else coalesce(nullif(btrim(s.status::text), ''), 'pending_approval')
      end as eff_status
  ) g
  where c.id = v_company_id;
end;
$$;

grant execute on function public.get_subscription_gate_state() to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: approved payment exists but company snapshot still pre-paid
-- ---------------------------------------------------------------------------
with latest as (
  select distinct on (lower(btrim(sp.company_id)))
    lower(btrim(sp.company_id)) as company_id_norm,
    case
      when lower(btrim(coalesce(sp.plan_id, ''))) like '%pro%' then 'pro'::text
      else 'basic'::text
    end as plan_norm,
    lower(btrim(coalesce(nullif(btrim(sp.billing_cycle::text), ''), 'monthly'))) as cycle_norm
  from public.subscription_payments sp
  where sp.status = 'approved'::public.subscription_payment_status
    and sp.company_id is not null
    and btrim(sp.company_id) <> ''
  order by lower(btrim(sp.company_id)), sp.approved_at desc nulls last, sp.created_at desc
),
norm as (
  select
    company_id_norm,
    plan_norm,
    case
      when cycle_norm = 'seasonal' then clock_timestamp() + interval '3 months'
      when cycle_norm = 'annual' then clock_timestamp() + interval '1 year'
      else clock_timestamp() + interval '1 month'
    end as period_end,
    cycle_norm
  from latest
)
update core.companies c
set
  subscription_status  = 'active',
  access_level         = n.plan_norm,
  plan                 = n.plan_norm,
  trial_ends_at        = null,
  trial_started_at     = null,
  payment_confirmed    = true,
  pending_confirmation = false,
  active_until         = coalesce(c.active_until, n.period_end),
  updated_at           = clock_timestamp()
from norm n
where lower(btrim(c.id::text)) = n.company_id_norm
  and (
    lower(btrim(coalesce(c.subscription_status, ''))) in (
      'trialing',
      'trial',
      'pending_approval',
      'pending_payment',
      'pending'
    )
    or c.trial_ends_at is not null
  );

with latest as (
  select distinct on (lower(btrim(sp.company_id)))
    lower(btrim(sp.company_id)) as company_id_norm,
    case
      when lower(btrim(coalesce(sp.plan_id, ''))) like '%pro%' then 'pro'::text
      else 'basic'::text
    end as plan_norm,
    lower(btrim(coalesce(nullif(btrim(sp.billing_cycle::text), ''), 'monthly'))) as cycle_norm
  from public.subscription_payments sp
  where sp.status = 'approved'::public.subscription_payment_status
    and sp.company_id is not null
    and btrim(sp.company_id) <> ''
  order by lower(btrim(sp.company_id)), sp.approved_at desc nulls last, sp.created_at desc
),
norm as (
  select
    company_id_norm,
    plan_norm,
    case
      when cycle_norm = 'seasonal' then clock_timestamp() + interval '3 months'
      when cycle_norm = 'annual' then clock_timestamp() + interval '1 year'
      else clock_timestamp() + interval '1 month'
    end as period_end,
    cycle_norm
  from latest
)
update public.company_subscriptions s
set
  plan_id          = n.plan_norm,
  plan_code        = n.plan_norm,
  plan             = n.plan_norm,
  status           = 'active',
  billing_cycle    = case
    when n.cycle_norm in ('seasonal', 'annual', 'monthly') then n.cycle_norm
    else s.billing_cycle
  end,
  is_trial         = false,
  trial_started_at = null,
  trial_starts_at  = null,
  trial_ends_at    = null,
  current_period_start = coalesce(s.current_period_start, clock_timestamp()),
  current_period_end   = coalesce(s.current_period_end, n.period_end),
  active_until         = coalesce(s.active_until, n.period_end),
  updated_at       = clock_timestamp()
from norm n
where lower(btrim(s.company_id::text)) = n.company_id_norm
  and lower(btrim(coalesce(s.status::text, ''))) in (
    'trial',
    'trialing',
    'pending_approval',
    'pending_payment',
    'pending'
  );

commit;

notify pgrst, 'reload schema';
