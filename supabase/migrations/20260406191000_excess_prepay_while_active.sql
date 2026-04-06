-- Excess credit when the tenant pays again while still covered (active_until > now):
--   - Credit the full payment to excess_balance (prepay wallet).
--   - Do not stack another period in activate_company_subscription (consumption extends from credit).
-- When not in that situation, excess is only catalog overpayment: max(0, amount - billing_plan_price_kes).

begin;

drop function if exists public.apply_excess_for_subscription_payment(uuid);
create function public.apply_excess_for_subscription_payment(
  _payment_id uuid,
  _prep_overlap boolean default false
)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_now              timestamptz := clock_timestamp();
  v_pay_plan         text;
  v_pay_cycle        text;
  v_amount           numeric;
  v_company_id_txt   text;
  v_company_id       uuid;
  v_pay_plan_price   numeric;
  v_excess_add       numeric;
  v_consume_plan     text;
  v_consume_cycle    text;
  v_consume_price    numeric;
  v_int              interval;
  v_bal              numeric;
  v_cau              timestamptz;
  v_has_sub          boolean;
begin
  if coalesce(auth.role()::text, '') is distinct from 'service_role' and not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select
    sp.company_id,
    sp.plan_id,
    sp.billing_cycle,
    sp.amount
  into v_company_id_txt, v_pay_plan, v_pay_cycle, v_amount
  from public.subscription_payments sp
  where sp.id = _payment_id
    and sp.status = 'approved'::public.subscription_payment_status;

  if v_company_id_txt is null then
    raise exception 'Approved payment not found' using errcode = 'P0001';
  end if;

  begin
    v_company_id := trim(v_company_id_txt)::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Invalid company_id on payment' using errcode = 'P0001';
  end;

  v_pay_plan := lower(trim(coalesce(v_pay_plan, 'basic')));
  if v_pay_plan not in ('basic', 'pro') then
    v_pay_plan := case when v_pay_plan like '%pro%' then 'pro' else 'basic' end;
  end if;

  v_pay_cycle := lower(trim(coalesce(v_pay_cycle, 'monthly')));
  if v_pay_cycle not in ('monthly', 'seasonal', 'annual') then
    v_pay_cycle := 'monthly';
  end if;

  v_pay_plan_price := public.billing_plan_price_kes(v_pay_plan, v_pay_cycle);

  if coalesce(_prep_overlap, false) then
    v_excess_add := coalesce(v_amount, 0);
  elsif v_pay_plan_price is null or v_pay_plan_price <= 0 then
    v_excess_add := 0;
  else
    v_excess_add := greatest(0::numeric, coalesce(v_amount, 0) - v_pay_plan_price);
  end if;

  update core.companies c
  set
    excess_balance = coalesce(c.excess_balance, 0) + coalesce(v_excess_add, 0),
    updated_at     = v_now
  where c.id = v_company_id;

  select exists (
    select 1
    from public.company_subscriptions cs
    where cs.company_id::text = v_company_id::text
  )
  into v_has_sub;

  if v_has_sub is true then
    select
      lower(trim(coalesce(nullif(trim(cs.plan_code::text), ''), nullif(trim(cs.plan_id::text), ''), 'basic'))),
      lower(trim(coalesce(nullif(trim(cs.billing_cycle::text), ''), 'monthly')))
    into v_consume_plan, v_consume_cycle
    from public.company_subscriptions cs
    where cs.company_id::text = v_company_id::text
    limit 1;
  else
    v_consume_plan := v_pay_plan;
    v_consume_cycle := v_pay_cycle;
  end if;

  if v_consume_plan not in ('basic', 'pro') then
    v_consume_plan := case when v_consume_plan like '%pro%' then 'pro' else 'basic' end;
  end if;

  if v_consume_cycle not in ('monthly', 'seasonal', 'annual') then
    v_consume_cycle := 'monthly';
  end if;

  v_consume_price := public.billing_plan_price_kes(v_consume_plan, v_consume_cycle);

  if v_consume_price is null or v_consume_price <= 0 then
    return;
  end if;

  if v_consume_cycle = 'seasonal' then
    v_int := interval '3 months';
  elsif v_consume_cycle = 'annual' then
    v_int := interval '1 year';
  else
    v_int := interval '1 month';
  end if;

  loop
    select coalesce(c.excess_balance, 0)
    into v_bal
    from core.companies c
    where c.id = v_company_id
    for update;

    exit when v_bal < v_consume_price;

    select c.active_until
    into v_cau
    from core.companies c
    where c.id = v_company_id;

    update core.companies c
    set
      active_until = greatest(coalesce(v_cau, v_now), v_now) + v_int,
      excess_balance = coalesce(c.excess_balance, 0) - v_consume_price,
      updated_at = v_now
    where c.id = v_company_id;

    update public.company_subscriptions s
    set
      current_period_end = c.active_until,
      active_until = c.active_until,
      updated_at = v_now
    from core.companies c
    where s.company_id::text = c.id::text
      and c.id = v_company_id;
  end loop;
end;
$$;

comment on function public.apply_excess_for_subscription_payment(uuid, boolean) is
  'Prep overlap: full payment to excess; else catalog overpayment. Consumes credit using current subscription plan/cycle.';

revoke all on function public.apply_excess_for_subscription_payment(uuid, boolean) from public;
grant execute on function public.apply_excess_for_subscription_payment(uuid, boolean) to authenticated, service_role;

drop function if exists public.activate_company_subscription(uuid, text, text, text, text);
create function public.activate_company_subscription(
  p_company_id   uuid,
  p_plan         text,
  p_cycle        text,
  p_billing_mode text default 'mpesa_stk',
  p_actor        text default null,
  p_prepay_wallet_only boolean default false
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
  v_cau          timestamptz;
  v_sub_stat     text;
  v_pay_conf     boolean;
  v_anchor       timestamptz;
  v_int          interval;
  v_prepay_only  boolean := coalesce(p_prepay_wallet_only, false);
  v_overlap      boolean;
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
    v_int := interval '3 months';
  elsif v_cycle = 'annual' then
    v_int := interval '1 year';
  else
    v_cycle := 'monthly';
    v_int := interval '1 month';
  end if;

  select c.active_until, c.subscription_status::text, coalesce(c.payment_confirmed, false)
  into v_cau, v_sub_stat, v_pay_conf
  from core.companies c
  where c.id = p_company_id;

  v_overlap := coalesce(v_pay_conf, false) = true
    and lower(trim(coalesce(v_sub_stat, ''))) = 'active'
    and v_cau is not null
    and v_cau > v_now;

  v_anchor := v_now;
  if v_overlap then
    v_anchor := v_cau;
  end if;

  if v_prepay_only and v_overlap then
    v_active_until := v_cau;
  else
    v_active_until := v_anchor + v_int;
  end if;

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

revoke all on function public.activate_company_subscription(uuid, text, text, text, text, boolean) from public;
grant execute on function public.activate_company_subscription(uuid, text, text, text, text, boolean) to authenticated, service_role;

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
  set subscription_activated = true
  where checkout_request_id = btrim(_checkout_request_id);

  return v_new_payment_id;
end;
$$;

revoke all on function public.activate_subscription_from_mpesa_stk(text) from public;
grant execute on function public.activate_subscription_from_mpesa_stk(text) to service_role;

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
  v_cau              timestamptz;
  v_sub_stat         text;
  v_pay_conf         boolean;
  v_prep_overlap     boolean;
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

  select c.active_until, c.subscription_status::text, coalesce(c.payment_confirmed, false)
  into v_cau, v_sub_stat, v_pay_conf
  from core.companies c
  where c.id = v_company_id;

  v_prep_overlap := coalesce(v_pay_conf, false) = true
    and lower(trim(coalesce(v_sub_stat, ''))) = 'active'
    and v_cau is not null
    and v_cau > v_now;

  perform public.activate_company_subscription(
    v_company_id, v_plan, v_cycle, 'manual', v_reviewer, v_prep_overlap
  );

  update public.subscription_payments sp
  set company_id = lower(btrim(sp.company_id))
  where sp.id = _payment_id;

  perform public.apply_excess_for_subscription_payment(_payment_id, v_prep_overlap);

  perform public.apply_farmer_referral_subscription_commission(
    v_company_id, coalesce(v_amount, 0), 'manual_approval'
  );
end;
$$;

grant execute on function public.approve_subscription_payment(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
