-- Active paid wins over stale trial flags everywhere:
-- 1) get_subscription_gate_state: when status is active, expose is_trial=false and no trial_ends_at
-- 2) get_subscription_analytics: trialing counts exclude status=active; row JSON normalizes is_trial
-- 3) list_companies: company row + nested subscription JSON align with active paid
-- 4) approve_subscription_payment: richer logs (payment id, subscription row before/after as jsonb)

begin;

-- ---------------------------------------------------------------------------
-- 1) Gate state — tenants never see trial countdown when subscription is active
-- ---------------------------------------------------------------------------
drop function if exists public.get_subscription_gate_state();

create or replace function public.get_subscription_gate_state()
returns table (
  company_id uuid,
  company_name text,
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
    coalesce(s.plan_id, s.plan_code, 'basic')::text as selected_plan,
    coalesce(s.billing_mode, 'manual')::text as billing_mode,
    coalesce(s.status, 'pending_approval')::text as status,
    c.created_at,
    s.approved_at,
    s.approved_by,
    s.rejection_reason,
    coalesce(s.override_reason, s.override ->> 'reason') as override_reason,
    case
      when lower(trim(coalesce(s.status, ''))) = 'active' then false
      else coalesce(s.is_trial, false)
    end as is_trial,
    case
      when lower(trim(coalesce(s.status, ''))) = 'active' then null::timestamptz
      else coalesce(s.trial_started_at, s.trial_starts_at)
    end as trial_started_at,
    case
      when lower(trim(coalesce(s.status, ''))) = 'active' then null::timestamptz
      else s.trial_ends_at
    end as trial_ends_at,
    exists (
      select 1
      from admin.subscription_overrides o
      where o.company_id = c.id
        and (o.expires_at is null or o.expires_at > now())
    ) as developer_override_active,
    s.billing_cycle,
    s.current_period_end,
    s.active_until
  from core.companies c
  left join public.company_subscriptions s on s.company_id::text = c.id::text
  where c.id = v_company_id;
end;
$$;

grant execute on function public.get_subscription_gate_state() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Approve payment — same behavior, clearer logging (single transaction)
-- ---------------------------------------------------------------------------
create or replace function public.approve_subscription_payment(_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_company_id_text text;
  v_company_id uuid;
  v_plan text;
  v_cycle text;
  v_reviewer text;
  v_period_end timestamptz;
  v_now timestamptz := clock_timestamp();
  v_before jsonb;
  v_after jsonb;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_reviewer := core.current_user_id();

  select to_jsonb(s)
  into v_before
  from public.subscription_payments sp
  left join public.company_subscriptions s on s.company_id::text = sp.company_id
  where sp.id = _payment_id;

  raise notice '[approve_subscription_payment] start payment_id=% reviewer=%', _payment_id, v_reviewer;

  update public.subscription_payments sp
  set
    status = 'approved'::public.subscription_payment_status,
    approved_at = v_now,
    reviewed_at = v_now,
    reviewed_by = v_reviewer
  where sp.id = _payment_id
    and sp.status in (
      'pending'::public.subscription_payment_status,
      'pending_verification'::public.subscription_payment_status
    )
  returning sp.company_id, sp.plan_id, sp.billing_cycle
  into v_company_id_text, v_plan, v_cycle;

  if v_company_id_text is null then
    raise exception 'Payment not found or not pending' using errcode = 'P0001';
  end if;

  raise notice '[approve_subscription_payment] payment approved company_id_text=% plan_id=% billing_cycle=%',
    v_company_id_text, v_plan, v_cycle;

  begin
    v_company_id := v_company_id_text::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Invalid company_id on payment row' using errcode = 'P0001';
  end;

  v_plan := lower(trim(coalesce(v_plan, 'basic')));
  if v_plan not in ('basic', 'pro') then
    v_plan := case when v_plan like '%pro%' then 'pro' else 'basic' end;
  end if;

  v_cycle := lower(trim(coalesce(v_cycle, 'monthly')));
  if v_cycle = 'seasonal' then
    v_period_end := v_now + interval '3 months';
  elsif v_cycle = 'annual' then
    v_period_end := v_now + interval '1 year';
  else
    v_cycle := 'monthly';
    v_period_end := v_now + interval '1 month';
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
    v_company_id,
    v_plan,
    v_plan,
    v_plan,
    'active',
    'manual',
    v_cycle,
    false,
    null,
    null,
    null,
    v_now,
    v_period_end,
    v_period_end,
    v_now,
    v_reviewer,
    v_now,
    v_reviewer
  )
  on conflict (company_id) do update set
    plan_id = excluded.plan_id,
    plan_code = excluded.plan_code,
    plan = excluded.plan,
    status = 'active',
    billing_mode = 'manual',
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

  select to_jsonb(s) into v_after
  from public.company_subscriptions s
  where s.company_id = v_company_id;

  raise notice '[approve_subscription_payment] subscription row before=%', v_before;
  raise notice '[approve_subscription_payment] subscription row after=%', v_after;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Subscription analytics — trialing must not include active paid workspaces
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
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
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
      'approved_count',
        (select count(*)::bigint from public.subscription_payments where status = 'approved'::public.subscription_payment_status),
      'rejected_count',
        (select count(*)::bigint from public.subscription_payments where status = 'rejected'::public.subscription_payment_status),
      'pending_revenue',
        coalesce((select sum(amount) from public.subscription_payments where status in (
          'pending'::public.subscription_payment_status,
          'pending_verification'::public.subscription_payment_status
        )), 0),
      'approved_revenue',
        coalesce((select sum(amount) from public.subscription_payments where status = 'approved'::public.subscription_payment_status), 0),
      'rejected_revenue',
        coalesce((select sum(amount) from public.subscription_payments where status = 'rejected'::public.subscription_payment_status), 0)
    )
    into v_payment_stats;
  else
    v_payment_stats := jsonb_build_object(
      'pending_verification_count', 0,
      'pending_legacy_count', 0,
      'pending_total_count', 0,
      'approved_count', 0,
      'rejected_count', 0,
      'pending_revenue', 0,
      'approved_revenue', 0,
      'rejected_revenue', 0
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
-- 4) list_companies — active subscription rows must not surface as trial in JSON
-- ---------------------------------------------------------------------------
drop function if exists public.list_companies(text, int, int);

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
    ) then 'cs.active_until'
    else 'cs.current_period_end'
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
        'subscription_status', coalesce(cs.status, 'none'),
        'plan_code', %s,
        'billing_mode', %s,
        'billing_cycle', %s,
        'is_trial', case
          when lower(trim(coalesce(cs.status, ''))) = 'active' then false
          else coalesce(cs.is_trial, cs.status = 'trialing', false)
        end,
        'trial_ends_at', case
          when lower(trim(coalesce(cs.status, ''))) = 'active' then null
          else cs.trial_ends_at
        end,
        'active_until', %s,
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
          'is_trial', case
            when lower(trim(coalesce(cs.status, ''))) = 'active' then false
            else coalesce(cs.is_trial, cs.status = 'trialing', false)
          end,
          'trial_start', %s,
          'trial_end', case
            when lower(trim(coalesce(cs.status, ''))) = 'active' then null
            else cs.trial_ends_at
          end,
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

commit;

notify pgrst, 'reload schema';
