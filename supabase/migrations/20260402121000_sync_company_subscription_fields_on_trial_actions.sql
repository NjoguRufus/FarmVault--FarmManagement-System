-- Sync core.companies canonical subscription fields on developer trial/plan actions.
-- Rules:
-- - Access never depends on plan.
-- - Grant trial: plan='pro', trial_ends_at=now+7d (or _days), payment_confirmed=false, active_until=null
-- - Extend trial: trial_ends_at += extension_days, payment_confirmed remains false
-- - Set plan basic: plan='basic', payment_confirmed=false, active_until=null, trial_ends_at=null
-- - Set plan pro: plan='pro', payment_confirmed=false (does not grant access)

begin;

create or replace function public.set_company_subscription_state(
  _company_id uuid,
  _action text,
  _plan_code text default null,
  _reason text default null,
  _days int default null
)
returns jsonb
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_action text := lower(coalesce(_action, ''));
  v_status text;
  v_plan text;
  v_now timestamptz := now();
  v_until timestamptz;
  v_user_id text := core.current_user_id();
  v_trial_days int := coalesce(nullif(_days, 0), 7);
  v_old_status text;
  v_workspace_ready_email boolean := false;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_action not in ('approve', 'reject', 'suspend', 'activate', 'start_trial', 'extend', 'set_plan') then
    raise exception 'unsupported action: %', v_action;
  end if;

  select s.status::text
  into v_old_status
  from public.company_subscriptions s
  where s.company_id::text = _company_id::text;

  v_plan := lower(coalesce(nullif(_plan_code, ''), ''));
  if v_plan = '' then
    select coalesce(nullif(plan_code, ''), nullif(plan_id, ''), 'pro') into v_plan
    from public.company_subscriptions
    where company_id::text = _company_id::text;
  end if;
  if v_plan not in ('basic', 'pro') then
    v_plan := 'pro';
  end if;

  -- Subscription row status (legacy UI still reads this).
  v_status := case v_action
    when 'approve' then 'trial'
    when 'reject' then 'rejected'
    when 'suspend' then 'suspended'
    when 'activate' then 'trial'
    when 'start_trial' then 'trial'
    when 'extend' then 'active'
    when 'set_plan' then coalesce((select status from public.company_subscriptions where company_id::text = _company_id::text), 'pending_approval')
    else 'pending_approval'
  end;

  v_until := case
    when _days is not null and _days > 0 then v_now + make_interval(days => _days)
    else null
  end;

  v_workspace_ready_email :=
    coalesce(v_old_status, '') = 'pending_approval'
    and v_action in ('approve', 'activate')
    and v_status in ('trial', 'active');

  insert into public.company_subscriptions (
    company_id, plan_id, plan_code, plan, status, billing_mode,
    is_trial, trial_started_at, trial_starts_at, trial_ends_at,
    current_period_end, active_until,
    approved_at, approved_by, rejection_reason, override_reason, updated_at
  )
  values (
    _company_id,
    case when v_action in ('approve', 'activate', 'start_trial') then 'pro' else v_plan end,
    case when v_action in ('approve', 'activate', 'start_trial') then 'pro' else v_plan end,
    case when v_action in ('approve', 'activate', 'start_trial') then 'pro' else v_plan end,
    v_status,
    'manual',
    case
      when v_action in ('approve', 'activate', 'start_trial') then true
      when v_action in ('extend', 'set_plan') then coalesce((select is_trial from public.company_subscriptions where company_id::text = _company_id::text), false)
      else false
    end,
    case when v_action in ('approve', 'activate', 'start_trial') then v_now else null end,
    case when v_action in ('approve', 'activate', 'start_trial') then v_now else null end,
    case
      when v_action in ('approve', 'activate') then v_now + make_interval(days => v_trial_days)
      when v_action = 'start_trial' then coalesce(v_until, v_now + make_interval(days => v_trial_days))
      else null
    end,
    case when v_action in ('activate', 'approve', 'extend') then coalesce(v_until, v_now + interval '30 days') else null end,
    case when v_action in ('activate', 'approve', 'extend') then coalesce(v_until, v_now + interval '30 days') else null end,
    case when v_action in ('approve', 'activate', 'start_trial') then v_now else null end,
    case when v_action in ('approve', 'activate', 'start_trial') then v_user_id else null end,
    case when v_action = 'reject' then nullif(_reason, '') else null end,
    case when v_action in ('extend', 'set_plan', 'suspend') then nullif(_reason, '') else null end,
    v_now
  )
  on conflict (company_id) do update set
    plan_id = excluded.plan_id,
    plan_code = excluded.plan_code,
    plan = excluded.plan,
    status = excluded.status,
    billing_mode = excluded.billing_mode,
    is_trial = excluded.is_trial,
    trial_started_at = excluded.trial_started_at,
    trial_starts_at = excluded.trial_starts_at,
    trial_ends_at = excluded.trial_ends_at,
    current_period_end = excluded.current_period_end,
    active_until = excluded.active_until,
    approved_at = excluded.approved_at,
    approved_by = excluded.approved_by,
    rejection_reason = excluded.rejection_reason,
    override_reason = excluded.override_reason,
    updated_at = excluded.updated_at;

  -- Canonical company-level fields used by access computation.
  if v_action in ('approve', 'activate', 'start_trial') then
    update core.companies
    set
      plan = 'pro',
      trial_ends_at = v_now + make_interval(days => v_trial_days),
      payment_confirmed = false,
      active_until = null
    where id = _company_id;
  elsif v_action = 'extend' then
    update core.companies
    set
      trial_ends_at = coalesce(trial_ends_at, v_now) + make_interval(days => v_trial_days),
      payment_confirmed = false
    where id = _company_id;
  elsif v_action = 'set_plan' then
    if v_plan = 'basic' then
      update core.companies
      set
        plan = 'basic',
        payment_confirmed = false,
        active_until = null,
        trial_ends_at = null
      where id = _company_id;
    else
      update core.companies
      set
        plan = 'pro',
        payment_confirmed = false
      where id = _company_id;
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'company_id', _company_id::text,
    'action', v_action,
    'status', v_status,
    'plan', v_plan,
    'trial_ends_at', (select trial_ends_at from core.companies where id = _company_id),
    'active_until', (select active_until from core.companies where id = _company_id),
    'payment_confirmed', (select payment_confirmed from core.companies where id = _company_id)
  );
end;
$$;

grant execute on function public.set_company_subscription_state(uuid, text, text, text, int) to authenticated;

commit;

notify pgrst, 'reload schema';

