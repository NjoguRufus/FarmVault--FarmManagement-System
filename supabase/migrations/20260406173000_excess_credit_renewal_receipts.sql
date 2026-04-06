-- Excess credit balance, renewal anchoring, apply overpayment + consume full cycles from credit.
-- Receipt email extended in billing-receipt-issue (separate deploy).

begin;

-- ---------------------------------------------------------------------------
-- 1) Column
-- ---------------------------------------------------------------------------
alter table core.companies
  add column if not exists excess_balance numeric not null default 0;

comment on column core.companies.excess_balance is
  'KES credit from overpayments; consumed in full-plan-price cycles to extend active_until.';

-- ---------------------------------------------------------------------------
-- 2) Plan price helper (core.billing_prices)
-- ---------------------------------------------------------------------------
create or replace function public.billing_plan_price_kes(p_plan text, p_cycle text)
returns numeric
language sql
stable
security definer
set search_path = core, public
as $$
  select coalesce(
    (
      select bp.amount::numeric
      from core.billing_prices bp
      where lower(trim(bp.plan::text)) = lower(trim(coalesce(p_plan, '')))
        and lower(trim(bp.cycle::text)) = lower(trim(coalesce(p_cycle, '')))
      limit 1
    ),
    0::numeric
  );
$$;

revoke all on function public.billing_plan_price_kes(text, text) from public;
grant execute on function public.billing_plan_price_kes(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Apply overpayment + consume excess cycles (per approved subscription_payment)
-- ---------------------------------------------------------------------------
create or replace function public.apply_excess_for_subscription_payment(_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_now            timestamptz := clock_timestamp();
  v_plan           text;
  v_cycle          text;
  v_amount         numeric;
  v_company_id_txt text;
  v_company_id     uuid;
  v_plan_price     numeric;
  v_excess_add     numeric;
  v_int            interval;
  v_bal            numeric;
  v_cau            timestamptz;
begin
  if coalesce(auth.role()::text, '') is distinct from 'service_role' and not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select
    sp.company_id,
    sp.plan_id,
    sp.billing_cycle,
    sp.amount
  into v_company_id_txt, v_plan, v_cycle, v_amount
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

  v_plan := lower(trim(coalesce(v_plan, 'basic')));
  if v_plan not in ('basic', 'pro') then
    v_plan := case when v_plan like '%pro%' then 'pro' else 'basic' end;
  end if;

  v_cycle := lower(trim(coalesce(v_cycle, 'monthly')));
  if v_cycle not in ('monthly', 'seasonal', 'annual') then
    v_cycle := 'monthly';
  end if;

  v_plan_price := public.billing_plan_price_kes(v_plan, v_cycle);

  if v_plan_price is null or v_plan_price <= 0 then
    v_excess_add := 0;
  else
    v_excess_add := greatest(0::numeric, coalesce(v_amount, 0) - v_plan_price);
  end if;

  update core.companies c
  set
    excess_balance = coalesce(c.excess_balance, 0) + coalesce(v_excess_add, 0),
    updated_at     = v_now
  where c.id = v_company_id;

  if v_plan_price is null or v_plan_price <= 0 then
    return;
  end if;

  if v_cycle = 'seasonal' then
    v_int := interval '3 months';
  elsif v_cycle = 'annual' then
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

    exit when v_bal < v_plan_price;

    select c.active_until
    into v_cau
    from core.companies c
    where c.id = v_company_id;

    update core.companies c
    set
      active_until = greatest(coalesce(v_cau, v_now), v_now) + v_int,
      excess_balance = coalesce(c.excess_balance, 0) - v_plan_price,
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

revoke all on function public.apply_excess_for_subscription_payment(uuid) from public;
grant execute on function public.apply_excess_for_subscription_payment(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) activate_company_subscription — renew from current active_until when already paid active
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
  v_cau          timestamptz;
  v_sub_stat     text;
  v_pay_conf     boolean;
  v_anchor       timestamptz;
  v_int          interval;
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

  v_anchor := v_now;
  if coalesce(v_pay_conf, false) = true
     and lower(trim(coalesce(v_sub_stat, ''))) = 'active'
     and v_cau is not null
     and v_cau > v_now
  then
    v_anchor := v_cau;
  end if;

  v_active_until := v_anchor + v_int;

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

revoke all on function public.activate_company_subscription(uuid, text, text, text, text) from public;
grant execute on function public.activate_company_subscription(uuid, text, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) STK activation — apply excess after payment row exists
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

  perform public.apply_excess_for_subscription_payment(v_new_payment_id);

  update public.mpesa_payments
  set subscription_activated = true
  where checkout_request_id = btrim(_checkout_request_id);

  return v_new_payment_id;
end;
$$;

revoke all on function public.activate_subscription_from_mpesa_stk(text) from public;
grant execute on function public.activate_subscription_from_mpesa_stk(text) to service_role;

-- ---------------------------------------------------------------------------
-- 6) Manual approve — apply excess after activation
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

  perform public.activate_company_subscription(
    v_company_id, v_plan, v_cycle, 'manual', v_reviewer
  );

  update public.subscription_payments sp
  set company_id = lower(btrim(sp.company_id))
  where sp.id = _payment_id;

  perform public.apply_excess_for_subscription_payment(_payment_id);

  perform public.apply_farmer_referral_subscription_commission(
    v_company_id, coalesce(v_amount, 0), 'manual_approval'
  );
end;
$$;

grant execute on function public.approve_subscription_payment(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Developer: excess snapshot for company details UI
-- ---------------------------------------------------------------------------
create or replace function public.developer_company_billing_excess(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
declare
  v_row record;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_company_id is null then
    return jsonb_build_object('error', 'company_id required');
  end if;

  select
    coalesce(c.excess_balance, 0)::numeric as excess_balance,
    c.active_until
  into v_row
  from core.companies c
  where c.id = p_company_id;

  if not found then
    return jsonb_build_object('error', 'company_not_found');
  end if;

  return jsonb_build_object(
    'excess_balance', v_row.excess_balance,
    'active_until', v_row.active_until
  );
end;
$$;

revoke all on function public.developer_company_billing_excess(uuid) from public;
grant execute on function public.developer_company_billing_excess(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) list_companies — include excess_balance
-- ---------------------------------------------------------------------------
create or replace function public.list_companies(
  p_search text default null,
  p_limit int default 200,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
declare
  v_result jsonb;
  v_total bigint;
  v_plan_expr text;
  v_trial_start_expr text;
  v_active_until_expr text;
  v_billing_mode_expr text;
  v_billing_cycle_expr text;
  v_sql text;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select count(*) into v_total
  from core.companies c
  where (p_search is null or p_search = '' or c.name ilike '%' || p_search || '%');

  v_plan_expr := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'company_subscriptions' and column_name = 'plan_code'
    ) then 'coalesce(cs.plan_code, cs.plan_id, ''basic'')'
    else 'coalesce(cs.plan_id, ''basic'')'
  end;

  v_trial_start_expr := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'company_subscriptions' and column_name = 'trial_starts_at'
    ) then 'cs.trial_starts_at'
    else 'cs.trial_started_at'
  end;

  v_active_until_expr := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'company_subscriptions' and column_name = 'active_until'
    ) then 'coalesce(c.active_until, cs.active_until)'
    else 'coalesce(c.active_until, cs.current_period_end)'
  end;

  v_billing_mode_expr := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'company_subscriptions' and column_name = 'billing_mode'
    ) then 'cs.billing_mode'
    else '(cs.override->>''billing_mode'')'
  end;

  v_billing_cycle_expr := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'company_subscriptions' and column_name = 'billing_cycle'
    ) then 'cs.billing_cycle'
    else '(cs.override->>''billing_cycle'')'
  end;

  v_sql := format($f$
    select jsonb_build_object(
      'rows', coalesce(jsonb_agg(row_data order by (row_data->>'created_at')::timestamptz desc nulls last), '[]'::jsonb),
      'total', %s
    )
    from (
      select jsonb_build_object(
        'company_id', c.id,
        'company_name', c.name,
        'created_at', c.created_at,
        'users_count', (
          select count(*) from core.company_members cm where cm.company_id::text = c.id::text
        ),
        'employees_count', (
          select count(*) from public.employees e where e.company_id::text = c.id::text
        ),
        'plan', c.plan,
        'payment_confirmed', c.payment_confirmed,
        'pending_confirmation', c.pending_confirmation,
        'company_subscription_status', c.subscription_status,
        'access_level', c.access_level,
        'onboarding_completed', c.onboarding_completed,
        'company_trial_started_at', c.trial_started_at,
        'subscription_status', coalesce(cs.status, 'none'),
        'plan_code', %s,
        'billing_mode', %s,
        'billing_cycle', %s,
        'is_trial', coalesce(cs.is_trial, cs.status = 'trialing', false),
        'trial_ends_at', coalesce(c.trial_ends_at, cs.trial_ends_at),
        'active_until', %s,
        'excess_balance', coalesce(c.excess_balance, 0),
        'override_reason', coalesce(cs.override_reason, cs.override->>'reason'),
        'override_by', coalesce(cs.override_by, cs.override->>'granted_by'),
        'override', cs.override,
        'latest_subscription_payment', case
          when to_regclass('public.subscription_payments') is null then null::jsonb
          else (
            select jsonb_build_object(
              'id', sp.id,
              'status', sp.status::text,
              'amount', sp.amount,
              'currency', sp.currency,
              'plan_id', sp.plan_id,
              'billing_cycle', sp.billing_cycle,
              'billing_mode', sp.billing_mode,
              'payment_method', sp.payment_method::text,
              'submitted_at', coalesce(sp.submitted_at, sp.created_at),
              'mpesa_name', sp.mpesa_name,
              'transaction_code', sp.transaction_code
            )
            from public.subscription_payments sp
            where sp.company_id = c.id::text
            order by coalesce(sp.submitted_at, sp.created_at) desc nulls last
            limit 1
          )
        end,
        'subscription', jsonb_build_object(
          'plan', %s,
          'plan_code', %s,
          'status', cs.status,
          'is_trial', coalesce(cs.is_trial, cs.status = 'trialing', false),
          'trial_start', %s,
          'trial_end', coalesce(c.trial_ends_at, cs.trial_ends_at),
          'active_until', %s,
          'billing_mode', %s,
          'billing_cycle', %s
        )
      ) as row_data
      from core.companies c
      left join public.company_subscriptions cs on cs.company_id::text = c.id::text
      where (coalesce(%L, '') = '' or c.name ilike '%%' || %L || '%%')
      order by c.created_at desc nulls last
      limit %s
      offset %s
    ) q
  $f$,
    v_total,
    v_plan_expr,
    v_billing_mode_expr,
    v_billing_cycle_expr,
    v_active_until_expr,
    v_plan_expr,
    v_plan_expr,
    v_trial_start_expr,
    v_active_until_expr,
    v_billing_mode_expr,
    v_billing_cycle_expr,
    p_search, p_search, p_limit, p_offset
  );

  execute v_sql into v_result;
  return coalesce(v_result, '{"rows": [], "total": 0}'::jsonb);
end;
$$;

grant execute on function public.list_companies(text, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 9) get_subscription_analytics — excess metrics in payment_stats
-- ---------------------------------------------------------------------------
create or replace function public.get_subscription_analytics(
  _date_from timestamptz default null,
  _date_to timestamptz default null,
  _plan text default null,
  _status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
declare
  v_payment_stats jsonb;
  v_summary jsonb;
  v_plan_distribution jsonb;
  v_status_distribution jsonb;
  v_rows jsonb;
  v_sdk_cnt bigint;
  v_sdk_rev numeric;
  v_total_excess numeric;
  v_excess_cos bigint;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select coalesce(sum(coalesce(c.excess_balance, 0)), 0)::numeric,
         count(*) filter (where coalesce(c.excess_balance, 0) > 0)::bigint
  into v_total_excess, v_excess_cos
  from core.companies c;

  if to_regclass('public.mpesa_payments') is not null then
    select count(*)::bigint,
           coalesce(sum(amount::numeric), 0)
      into v_sdk_cnt, v_sdk_rev
    from public.mpesa_payments
    where upper(trim(coalesce(status, ''))) = 'SUCCESS';
  else
    v_sdk_cnt := 0;
    v_sdk_rev := 0;
  end if;

  if to_regclass('public.subscription_payments') is not null then
    select jsonb_build_object(
      'pending_verification_count',
        (select count(*)::bigint from public.subscription_payments where status = 'pending_verification'::public.subscription_payment_status),
      'pending_legacy_count',
        (select count(*)::bigint from public.subscription_payments where status = 'pending'::public.subscription_payment_status),
      'pending_total_count',
        (select count(*)::bigint from public.subscription_payments where status in (
          'pending'::public.subscription_payment_status,
          'pending_verification'::public.subscription_payment_status
        )),
      'manual_approved_count',
        (select count(*)::bigint from public.subscription_payments sp
          where sp.status = 'approved'::public.subscription_payment_status
            and lower(trim(coalesce(sp.payment_method, 'mpesa_manual'))) <> 'mpesa_stk'),
      'sdk_success_count', v_sdk_cnt,
      'approved_count',
        (select count(*)::bigint from public.subscription_payments sp
          where sp.status = 'approved'::public.subscription_payment_status
            and lower(trim(coalesce(sp.payment_method, 'mpesa_manual'))) <> 'mpesa_stk')
        + v_sdk_cnt,
      'rejected_count',
        (select count(*)::bigint from public.subscription_payments where status = 'rejected'::public.subscription_payment_status),
      'pending_revenue',
        coalesce((select sum(amount) from public.subscription_payments where status in (
          'pending'::public.subscription_payment_status,
          'pending_verification'::public.subscription_payment_status
        )), 0),
      'manual_approved_revenue',
        coalesce((select sum(sp.amount) from public.subscription_payments sp
          where sp.status = 'approved'::public.subscription_payment_status
            and lower(trim(coalesce(sp.payment_method, 'mpesa_manual'))) <> 'mpesa_stk'), 0),
      'sdk_confirmed_revenue', v_sdk_rev,
      'approved_revenue',
        coalesce((select sum(sp.amount) from public.subscription_payments sp
          where sp.status = 'approved'::public.subscription_payment_status
            and lower(trim(coalesce(sp.payment_method, 'mpesa_manual'))) <> 'mpesa_stk'), 0)
        + v_sdk_rev,
      'rejected_revenue',
        coalesce((select sum(amount) from public.subscription_payments where status = 'rejected'::public.subscription_payment_status), 0),
      'total_excess_balance', v_total_excess,
      'companies_with_excess_count', v_excess_cos
    )
    into v_payment_stats;
  else
    v_payment_stats := jsonb_build_object(
      'pending_verification_count', 0,
      'pending_legacy_count', 0,
      'pending_total_count', 0,
      'manual_approved_count', 0,
      'sdk_success_count', v_sdk_cnt,
      'approved_count', v_sdk_cnt,
      'rejected_count', 0,
      'pending_revenue', 0,
      'manual_approved_revenue', 0,
      'sdk_confirmed_revenue', v_sdk_rev,
      'approved_revenue', v_sdk_rev,
      'rejected_revenue', 0,
      'total_excess_balance', v_total_excess,
      'companies_with_excess_count', v_excess_cos
    );
  end if;

  if to_regclass('public.company_subscriptions') is null then
    return jsonb_build_object(
      'summary', jsonb_build_object(
        'total_subscriptions', 0,
        'active_subscriptions', 0,
        'trialing_subscriptions', 0,
        'expired_subscriptions', 0,
        'rejected_subscriptions', 0
      ),
      'plan_distribution', '[]'::jsonb,
      'status_distribution', '[]'::jsonb,
      'rows', '[]'::jsonb,
      'payment_stats', v_payment_stats
    );
  end if;

  select jsonb_build_object(
    'total_subscriptions', (select count(*)::bigint from public.company_subscriptions cs2
      where (_date_from is null or coalesce(cs2.updated_at, cs2.created_at) >= _date_from)
        and (_date_to is null or coalesce(cs2.updated_at, cs2.created_at) <= _date_to)),
    'active_subscriptions', (select count(*)::bigint from public.company_subscriptions where lower(trim(coalesce(status, ''))) = 'active'),
    'trialing_subscriptions', (select count(*)::bigint from public.company_subscriptions cs
      where lower(trim(coalesce(cs.status, ''))) <> 'active'
        and (
          lower(trim(coalesce(cs.status, ''))) in ('trial', 'trialing')
          or coalesce(cs.is_trial, false) = true
        )),
    'expired_subscriptions', (select count(*)::bigint from public.company_subscriptions
      where coalesce(status, '') in ('expired', 'cancelled', 'canceled')),
    'rejected_subscriptions', (select count(*)::bigint from public.company_subscriptions where coalesce(status, '') = 'rejected')
  )
  into v_summary;

  select coalesce(jsonb_agg(jsonb_build_object('plan', plan_id, 'count', cnt)), '[]'::jsonb)
  into v_plan_distribution
  from (
    select coalesce(nullif(plan_code, ''), nullif(plan_id, ''), 'basic') as plan_id, count(*)::bigint as cnt
    from public.company_subscriptions
    group by 1
    order by cnt desc
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object('status', st, 'count', cnt)), '[]'::jsonb)
  into v_status_distribution
  from (
    select coalesce(nullif(status, ''), 'none') as st, count(*)::bigint as cnt
    from public.company_subscriptions
    group by 1
    order by cnt desc
  ) q;

  select coalesce(jsonb_agg(row_json order by company_name nulls last), '[]'::jsonb)
  into v_rows
  from (
    select
      jsonb_build_object(
        'id', c.id::text,
        'company_id', c.id::text,
        'company_name', c.name,
        'plan', coalesce(cs.plan_id, cs.plan),
        'plan_code', coalesce(cs.plan_code, cs.plan_id, 'basic'),
        'billing_cycle', cs.billing_cycle,
        'billing_mode', cs.billing_mode,
        'status', coalesce(cs.status, 'none'),
        'is_trial', case
          when lower(trim(coalesce(cs.status, ''))) = 'active' then false
          else coalesce(cs.is_trial, false)
            or lower(trim(coalesce(cs.status, ''))) in ('trial', 'trialing')
        end,
        'trial_starts_at', case
          when lower(trim(coalesce(cs.status, ''))) = 'active' then null::timestamptz
          else coalesce(cs.trial_starts_at, cs.trial_started_at)
        end,
        'trial_ends_at', case
          when lower(trim(coalesce(cs.status, ''))) = 'active' then null::timestamptz
          else cs.trial_ends_at
        end,
        'active_until', coalesce(cs.active_until, cs.current_period_end),
        'excess_balance', coalesce(c.excess_balance, 0),
        'created_at', cs.created_at,
        'updated_at', cs.updated_at
      ) as row_json,
      c.name as company_name
    from core.companies c
    left join public.company_subscriptions cs on cs.company_id::text = c.id::text
    where (_date_from is null or c.created_at >= _date_from)
      and (_date_to is null or c.created_at <= _date_to)
      and (_plan is null or _plan = '' or lower(coalesce(cs.plan_code, cs.plan_id, '')) = lower(_plan))
      and (
        _status is null or _status = ''
        or lower(coalesce(cs.status, 'none')) = lower(_status)
      )
    limit 500
  ) r;

  return jsonb_build_object(
    'summary', coalesce(v_summary, '{}'::jsonb),
    'plan_distribution', coalesce(v_plan_distribution, '[]'::jsonb),
    'status_distribution', coalesce(v_status_distribution, '[]'::jsonb),
    'rows', coalesce(v_rows, '[]'::jsonb),
    'payment_stats', v_payment_stats
  );
end;
$$;

grant execute on function public.get_subscription_analytics(timestamptz, timestamptz, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10) Realtime: core.companies (excess_balance / active_until)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table core.companies';
    exception
      when duplicate_object then null;
    end;
  end if;
end$$;

commit;

notify pgrst, 'reload schema';
