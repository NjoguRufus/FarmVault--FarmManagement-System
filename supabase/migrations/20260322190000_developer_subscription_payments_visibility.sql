-- Developer visibility for public.subscription_payments (manual M-Pesa flow).
-- 1) list_pending_payments: add submitted_at, currency
-- 2) list_companies: include latest_subscription_payment per company
-- 3) public.get_subscription_analytics: unified JSON for developer analytics UI + payment_stats

begin;

-- ---------------------------------------------------------------------------
-- 1) Pending payments listing (drop/recreate — return type change)
-- ---------------------------------------------------------------------------
drop function if exists public.list_pending_payments();
drop function if exists admin.list_pending_payments();

create or replace function admin.list_pending_payments()
returns table (
  id uuid,
  company_id text,
  company_name text,
  plan_id text,
  amount numeric,
  status text,
  billing_mode text,
  billing_cycle text,
  mpesa_name text,
  mpesa_phone text,
  transaction_code text,
  created_at timestamptz,
  submitted_at timestamptz,
  currency text
)
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    sp.id,
    sp.company_id,
    c.name::text as company_name,
    sp.plan_id,
    sp.amount,
    sp.status::text,
    sp.billing_mode,
    sp.billing_cycle,
    sp.mpesa_name,
    sp.mpesa_phone,
    sp.transaction_code,
    sp.created_at,
    coalesce(sp.submitted_at, sp.created_at) as submitted_at,
    sp.currency
  from public.subscription_payments sp
  left join core.companies c on c.id::text = sp.company_id
  where sp.status in (
    'pending'::public.subscription_payment_status,
    'pending_verification'::public.subscription_payment_status
  )
  order by coalesce(sp.submitted_at, sp.created_at) desc nulls last;
end;
$$;

create or replace function public.list_pending_payments()
returns table (
  id uuid,
  company_id text,
  company_name text,
  plan_id text,
  amount numeric,
  status text,
  billing_mode text,
  billing_cycle text,
  mpesa_name text,
  mpesa_phone text,
  transaction_code text,
  created_at timestamptz,
  submitted_at timestamptz,
  currency text
)
language sql
stable
security definer
set search_path = admin, public
as $$
  select * from admin.list_pending_payments();
$$;

grant execute on function public.list_pending_payments() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) list_companies — latest manual M-Pesa submission per workspace
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
        'is_trial', coalesce(cs.is_trial, cs.status = 'trialing', false),
        'trial_ends_at', cs.trial_ends_at,
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
          'is_trial', coalesce(cs.is_trial, cs.status = 'trialing', false),
          'trial_start', %s,
          'trial_end', cs.trial_ends_at,
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

create or replace function public.list_companies_v2(
  p_search text default null,
  p_limit int default 200,
  p_offset int default 0
)
returns jsonb
language sql
stable
security definer
set search_path = admin, core, public
as $$
  select public.list_companies(p_search, p_limit, p_offset);
$$;

grant execute on function public.list_companies_v2(text, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Developer subscription + payment analytics (public RPC for PostgREST)
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
    'active_subscriptions', (select count(*)::bigint from public.company_subscriptions where status = 'active'),
    'trialing_subscriptions', (select count(*)::bigint from public.company_subscriptions
      where coalesce(status, '') in ('trial', 'trialing') or coalesce(is_trial, false) = true),
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
        'is_trial', coalesce(cs.is_trial, false),
        'trial_starts_at', coalesce(cs.trial_starts_at, cs.trial_started_at),
        'trial_ends_at', cs.trial_ends_at,
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

commit;

notify pgrst, 'reload schema';
