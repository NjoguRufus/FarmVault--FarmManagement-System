-- Fix: get_company_subscription performs INSERT (self-heal) so it must be VOLATILE.

begin;

create or replace function public.get_company_subscription(p_company_id uuid)
returns public.company_subscription_resolved
language plpgsql
volatile
security definer
set search_path = admin, core, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.company_subscription_resolved;
  v_grace interval := interval '7 days';
begin
  if p_company_id is null then
    raise exception 'company_id required' using errcode = 'P0001';
  end if;

  -- Self-heal: ensure subscription row exists.
  insert into public.company_subscriptions (
    company_id,
    plan_id,
    plan_code,
    plan,
    status,
    billing_mode,
    updated_at
  )
  values (
    p_company_id,
    'basic',
    'basic',
    'basic',
    'pending_approval',
    'manual',
    v_now
  )
  on conflict (company_id) do nothing;

  with c as (
    select id, active_until
    from core.companies
    where id = p_company_id
  ),
  s as (
    select *
    from public.company_subscriptions
    where company_id = p_company_id
    limit 1
  ),
  override_active as (
    select exists (
      select 1
      from admin.subscription_overrides o
      where o.company_id = p_company_id
        and (o.expires_at is null or o.expires_at > v_now)
    ) as is_active
  ),
  pay as (
    select
      (
        exists (
          select 1
          from public.subscription_payments sp
          where lower(btrim(sp.company_id)) = lower(btrim(p_company_id::text))
            and sp.status = 'approved'::public.subscription_payment_status
        )
        or
        exists (
          select 1
          from public.mpesa_payments mp
          where mp.company_id = p_company_id
            and mp.result_code = 0
        )
      ) as has_paid,
      coalesce(
        (
          select sp.plan_id::text
          from public.subscription_payments sp
          where lower(btrim(sp.company_id)) = lower(btrim(p_company_id::text))
            and sp.status = 'approved'::public.subscription_payment_status
          order by sp.approved_at desc nulls last, sp.created_at desc
          limit 1
        ),
        (
          select
            case
              when lower(btrim(coalesce(mp.plan, ''))) like '%pro%' then 'pro'
              when lower(btrim(coalesce(mp.plan, ''))) = 'basic' then 'basic'
              else 'pro'
            end
          from public.mpesa_payments mp
          where mp.company_id = p_company_id
            and mp.result_code = 0
          order by mp.paid_at desc nulls last, mp.created_at desc
          limit 1
        )
      ) as paid_plan
  ),
  resolved as (
    select
      case
        when (select is_active from override_active) then 'pro'
        when (select has_paid from pay) then
          case when lower(coalesce((select paid_plan from pay), 'pro')) like '%pro%' then 'pro' else 'basic' end
        else
          case
            when lower(coalesce((select plan_code from s), (select plan_id from s), 'basic')) like '%pro%' then 'pro'
            else 'basic'
          end
      end as plan_norm,

      case
        when (select is_active from override_active) then coalesce((select current_period_end from s), (select active_until from s), (select active_until from c), 'infinity'::timestamptz)
        when (select has_paid from pay) then coalesce((select current_period_end from s), (select active_until from s), (select active_until from c), v_now)
        when coalesce((select is_trial from s), false) and (select trial_ends_at from s) is not null then (select trial_ends_at from s)
        else 'infinity'::timestamptz
      end as valid_until_norm,

      (coalesce((select is_trial from s), false) = true and (select trial_ends_at from s) is not null and (select trial_ends_at from s) > v_now) as is_trial_norm
  )
  select
    r.plan_norm,
    case
      when r.plan_norm = 'basic' then 'active'
      when r.valid_until_norm = 'infinity'::timestamptz then 'active'
      when r.valid_until_norm > v_now then 'active'
      when v_now <= r.valid_until_norm + v_grace then 'grace'
      else 'expired'
    end as status_norm,
    r.valid_until_norm,
    v_now as resolved_at,
    r.is_trial_norm
  into v_row
  from resolved r;

  if v_row.plan is null then
    v_row.plan := 'basic';
  end if;
  if v_row.status is null then
    v_row.status := 'active';
  end if;
  if v_row.valid_until is null then
    v_row.valid_until := 'infinity'::timestamptz;
  end if;
  if v_row.resolved_at is null then
    v_row.resolved_at := v_now;
  end if;
  if v_row.is_trial is null then
    v_row.is_trial := false;
  end if;

  return v_row;
end;
$$;

grant execute on function public.get_company_subscription(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

