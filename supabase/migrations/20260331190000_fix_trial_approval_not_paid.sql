-- Fix: approving a company starts a Pro trial, not a paid subscription.
-- Trials must NOT write active_until/current_period_end (those represent paid/subscription access).
-- Billing Confirmation approval is the only flow that should create paid active_until.

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
    case when v_action in ('approve', 'activate') then 'pro' else v_plan end,
    case when v_action in ('approve', 'activate') then 'pro' else v_plan end,
    case when v_action in ('approve', 'activate') then 'pro' else v_plan end,
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
      when v_action = 'start_trial' then coalesce(v_until, v_now + interval '7 days')
      else null
    end,
    -- IMPORTANT: do NOT set paid/subscription end dates for trial actions.
    case
      when v_action = 'extend' then coalesce(v_until, v_now + interval '30 days')
      else null
    end,
    case
      when v_action = 'extend' then coalesce(v_until, v_now + interval '30 days')
      else null
    end,
    case when v_action in ('approve', 'activate', 'start_trial') then v_now else null end,
    case when v_action in ('approve', 'activate', 'start_trial') then v_user_id else null end,
    case when v_action = 'reject' then nullif(_reason, '') else null end,
    case when v_action in ('extend', 'set_plan', 'suspend') then nullif(_reason, '') else null end,
    v_now
  )
  on conflict (company_id) do update set
    plan_id = case when v_action in ('approve', 'activate') then 'pro' else coalesce(excluded.plan_id, public.company_subscriptions.plan_id) end,
    plan_code = case when v_action in ('approve', 'activate') then 'pro' else coalesce(excluded.plan_code, public.company_subscriptions.plan_code) end,
    plan = case when v_action in ('approve', 'activate') then 'pro' else coalesce(excluded.plan, public.company_subscriptions.plan) end,
    status = excluded.status,
    billing_mode = 'manual',
    is_trial = case
      when v_action in ('approve', 'activate') then true
      when v_action = 'start_trial' then true
      when v_action = 'reject' then false
      else coalesce(excluded.is_trial, public.company_subscriptions.is_trial)
    end,
    trial_started_at = case
      when v_action in ('approve', 'activate', 'start_trial') then coalesce(excluded.trial_started_at, public.company_subscriptions.trial_started_at)
      else public.company_subscriptions.trial_started_at
    end,
    trial_starts_at = case
      when v_action in ('approve', 'activate', 'start_trial') then coalesce(excluded.trial_starts_at, public.company_subscriptions.trial_starts_at)
      else public.company_subscriptions.trial_starts_at
    end,
    trial_ends_at = case
      when v_action in ('approve', 'activate') then coalesce(excluded.trial_ends_at, public.company_subscriptions.trial_ends_at)
      when v_action = 'start_trial' then coalesce(excluded.trial_ends_at, public.company_subscriptions.trial_ends_at)
      else public.company_subscriptions.trial_ends_at
    end,
    -- IMPORTANT: never carry forward "paid-like" active_until for trial actions.
    current_period_end = case
      when v_action in ('approve', 'activate', 'start_trial') then null
      else coalesce(excluded.current_period_end, public.company_subscriptions.current_period_end)
    end,
    active_until = case
      when v_action in ('approve', 'activate', 'start_trial') then null
      else coalesce(excluded.active_until, public.company_subscriptions.active_until)
    end,
    approved_at = coalesce(excluded.approved_at, public.company_subscriptions.approved_at),
    approved_by = coalesce(excluded.approved_by, public.company_subscriptions.approved_by),
    rejection_reason = case when v_action = 'reject' then nullif(_reason, '') else public.company_subscriptions.rejection_reason end,
    override_reason = case when v_action in ('extend', 'set_plan', 'suspend') then nullif(_reason, '') else public.company_subscriptions.override_reason end,
    updated_at = v_now;

  -- Mirror subscription admin action onto company workspace status (hybrid approval banner).
  update core.companies c
  set
    status = case
      when v_action in ('approve', 'activate', 'start_trial', 'extend') then 'active'
      when v_action = 'suspend' then 'suspended'
      else c.status
    end,
    updated_at = v_now
  where c.id = _company_id;

  return jsonb_build_object(
    'workspace_ready_email', v_workspace_ready_email,
    'company_id', _company_id
  );
end;
$$;

grant execute on function public.set_company_subscription_state(uuid, text, text, text, int) to authenticated;

commit;

notify pgrst, 'reload schema';

