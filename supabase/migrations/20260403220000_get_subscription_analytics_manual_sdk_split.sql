-- Split manual vs SDK in subscription analytics payment_stats.
-- Manual: subscription_payments approved where payment_method is not mpesa_stk (default mpesa_manual).
-- SDK: mpesa_payments with status SUCCESS (Daraja STK lifecycle).
-- Combined approved_count / approved_revenue = manual + SDK.
-- Pending / rejected remain subscription_payments only (manual pipeline).

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
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

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
        coalesce((select sum(amount) from public.subscription_payments where status = 'rejected'::public.subscription_payment_status), 0)
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
