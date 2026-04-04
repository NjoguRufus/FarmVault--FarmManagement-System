-- Expose subscription_payments.payment_method on latest_subscription_payment for Manual vs SDK UI.

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
        'subscription_status', coalesce(cs.status, 'none'),
        'plan_code', %s,
        'billing_mode', %s,
        'billing_cycle', %s,
        'is_trial', coalesce(cs.is_trial, cs.status = 'trialing', false),
        'trial_ends_at', coalesce(c.trial_ends_at, cs.trial_ends_at),
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

notify pgrst, 'reload schema';
