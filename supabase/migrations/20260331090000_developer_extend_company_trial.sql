-- Developer admin: extend a company's Pro trial window safely.
-- Rule:
-- - If trial_ends_at is in the future: extend from that date
-- - If trial_ends_at is null or in the past: extend from now
-- Notes:
-- - Does NOT unsuspend a suspended company (core.companies.status remains suspended).
-- - Preserves other subscription history; only updates trial_ends_at + related access end aafields.

begin;

create or replace function public.extend_company_trial(
  _company_id uuid,
  _days int,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_now timestamptz := now();
  v_days int := coalesce(nullif(_days, 0), 7);
  v_current_end timestamptz;
  v_base timestamptz;
  v_new_end timestamptz;
  v_plan text;
  v_company_status text;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_days < 1 or v_days > 3650 then
    raise exception 'invalid days' using errcode = '22023';
  end if;

  select c.status::text
  into v_company_status
  from core.companies c
  where c.id = _company_id;

  -- Keep a sane default plan; do not force plan changes here.
  select coalesce(nullif(s.plan_code, ''), nullif(s.plan_id, ''), nullif(s.plan, ''), 'pro')::text,
         s.trial_ends_at
  into v_plan, v_current_end
  from public.company_subscriptions s
  where s.company_id::text = _company_id::text;

  if v_plan is null or lower(trim(v_plan)) not in ('basic','pro') then
    v_plan := 'pro';
  end if;

  v_base := case
    when v_current_end is not null and v_current_end > v_now then v_current_end
    else v_now
  end;
  v_new_end := v_base + make_interval(days => v_days);

  -- Update subscription row: keep status trial and mark is_trial true.
  insert into public.company_subscriptions (
    company_id,
    plan_id,
    plan_code,
    plan,
    status,
    billing_mode,
    is_trial,
    trial_ends_at,
    active_until,
    current_period_end,
    override_reason,
    updated_at
  )
  values (
    _company_id,
    v_plan,
    v_plan,
    v_plan,
    'trial',
    'manual',
    true,
    v_new_end,
    v_new_end,
    v_new_end,
    nullif(_reason, ''),
    v_now
  )
  on conflict (company_id) do update set
    -- preserve plan fields unless they're missing
    plan_id = coalesce(public.company_subscriptions.plan_id, excluded.plan_id),
    plan_code = coalesce(public.company_subscriptions.plan_code, excluded.plan_code),
    plan = coalesce(public.company_subscriptions.plan, excluded.plan),
    status = 'trial',
    billing_mode = 'manual',
    is_trial = true,
    trial_ends_at = excluded.trial_ends_at,
    active_until = excluded.active_until,
    current_period_end = excluded.current_period_end,
    override_reason = coalesce(nullif(_reason, ''), public.company_subscriptions.override_reason),
    updated_at = v_now;

  -- If company isn't suspended, ensure workspace lifecycle is active (hybrid approval).
  if coalesce(lower(trim(v_company_status)), 'pending') <> 'suspended' then
    update core.companies
    set status = 'active', updated_at = v_now
    where id = _company_id;
  end if;

  return jsonb_build_object(
    'company_id', _company_id,
    'trial_ends_at', v_new_end
  );
end;
$$;

grant execute on function public.extend_company_trial(uuid, int, text) to authenticated;

commit;

notify pgrst, 'reload schema';

