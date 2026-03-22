-- Onboarding: default Pro + 7-day trial after approval; post-trial plan choice RPC.
-- Extends subscription gate state for trial countdown and developer override bypass.

begin;

-- ---------------------------------------------------------------------------
-- 1) initialize_company_subscription — always seed Pro trial intent (no plan UI).
--    Trial clock starts only after developer approval (see set_company_subscription_state).
-- ---------------------------------------------------------------------------
create or replace function public.initialize_company_subscription(
  _company_id uuid,
  _plan_code text default 'pro'
)
returns jsonb
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_user_id text := core.current_user_id();
  v_now timestamptz := now();
  v_allowed boolean := false;
begin
  if _company_id is null then
    raise exception 'company id is required';
  end if;

  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select exists (
    select 1
    from core.company_members cm
    where cm.company_id::text = _company_id::text
      and cm.clerk_user_id = v_user_id
  ) into v_allowed;

  if not v_allowed then
    raise exception 'not authorized for company %', _company_id using errcode = '42501';
  end if;

  insert into public.company_subscriptions (
    company_id,
    plan_id,
    plan_code,
    plan,
    status,
    billing_mode,
    is_trial,
    trial_started_at,
    trial_starts_at,
    trial_ends_at,
    approved_at,
    approved_by,
    rejection_reason,
    override_reason,
    updated_at
  )
  values (
    _company_id,
    'pro',
    'pro',
    'pro',
    'pending_approval',
    'manual',
    true,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    v_now
  )
  on conflict (company_id) do update set
    plan_id = 'pro',
    plan_code = 'pro',
    plan = coalesce(public.company_subscriptions.plan, 'pro'),
    status = case
      when public.company_subscriptions.approved_at is not null then public.company_subscriptions.status
      else 'pending_approval'
    end,
    billing_mode = 'manual',
    is_trial = case
      when public.company_subscriptions.approved_at is not null then public.company_subscriptions.is_trial
      else true
    end,
    approved_at = public.company_subscriptions.approved_at,
    approved_by = public.company_subscriptions.approved_by,
    rejection_reason = null,
    override_reason = public.company_subscriptions.override_reason,
    updated_at = v_now;

  return jsonb_build_object(
    'success', true,
    'company_id', _company_id::text,
    'status', 'pending_approval',
    'plan_code', 'pro'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) set_company_subscription_state — on approve: status trial, 7-day Pro trial.
-- ---------------------------------------------------------------------------
create or replace function public.set_company_subscription_state(
  _company_id uuid,
  _action text,
  _plan_code text default null,
  _reason text default null,
  _days int default null
)
returns void
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
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_action not in ('approve', 'reject', 'suspend', 'activate', 'start_trial', 'extend', 'set_plan') then
    raise exception 'unsupported action: %', v_action;
  end if;

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
    when 'activate' then 'active'
    when 'start_trial' then 'trial'
    when 'extend' then 'active'
    when 'set_plan' then coalesce((select status from public.company_subscriptions where company_id::text = _company_id::text), 'pending_approval')
    else 'pending_approval'
  end;

  v_until := case
    when _days is not null and _days > 0 then v_now + make_interval(days => _days)
    else null
  end;

  insert into public.company_subscriptions (
    company_id, plan_id, plan_code, plan, status, billing_mode,
    is_trial, trial_started_at, trial_starts_at, trial_ends_at,
    current_period_end, active_until,
    approved_at, approved_by, rejection_reason, override_reason, updated_at
  )
  values (
    _company_id,
    case when v_action = 'approve' then 'pro' else v_plan end,
    case when v_action = 'approve' then 'pro' else v_plan end,
    case when v_action = 'approve' then 'pro' else v_plan end,
    v_status,
    'manual',
    case when v_action in ('approve', 'start_trial') then true
         when v_action in ('activate', 'extend', 'set_plan') then coalesce((select is_trial from public.company_subscriptions where company_id::text = _company_id::text), false)
         else false
    end,
    case when v_action in ('approve', 'start_trial') then v_now else null end,
    case when v_action in ('approve', 'start_trial') then v_now else null end,
    case
      when v_action = 'approve' then v_now + make_interval(days => v_trial_days)
      when v_action = 'start_trial' then coalesce(v_until, v_now + interval '7 days')
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
    plan_id = case when v_action = 'approve' then 'pro' else coalesce(excluded.plan_id, public.company_subscriptions.plan_id) end,
    plan_code = case when v_action = 'approve' then 'pro' else coalesce(excluded.plan_code, public.company_subscriptions.plan_code) end,
    plan = case when v_action = 'approve' then 'pro' else coalesce(excluded.plan, public.company_subscriptions.plan) end,
    status = excluded.status,
    billing_mode = 'manual',
    is_trial = case
      when v_action = 'approve' then true
      when v_action = 'start_trial' then true
      when v_action = 'reject' then false
      else coalesce(excluded.is_trial, public.company_subscriptions.is_trial)
    end,
    trial_started_at = case
      when v_action in ('approve', 'start_trial') then coalesce(excluded.trial_started_at, public.company_subscriptions.trial_started_at)
      else public.company_subscriptions.trial_started_at
    end,
    trial_starts_at = case
      when v_action in ('approve', 'start_trial') then coalesce(excluded.trial_starts_at, public.company_subscriptions.trial_starts_at)
      else public.company_subscriptions.trial_starts_at
    end,
    trial_ends_at = case
      when v_action = 'approve' then coalesce(excluded.trial_ends_at, public.company_subscriptions.trial_ends_at)
      when v_action = 'start_trial' then coalesce(excluded.trial_ends_at, public.company_subscriptions.trial_ends_at)
      else public.company_subscriptions.trial_ends_at
    end,
    current_period_end = coalesce(excluded.current_period_end, public.company_subscriptions.current_period_end),
    active_until = coalesce(excluded.active_until, public.company_subscriptions.active_until),
    approved_at = coalesce(excluded.approved_at, public.company_subscriptions.approved_at),
    approved_by = coalesce(excluded.approved_by, public.company_subscriptions.approved_by),
    rejection_reason = case when v_action = 'reject' then nullif(_reason, '') else public.company_subscriptions.rejection_reason end,
    override_reason = case when v_action in ('extend', 'set_plan', 'suspend') then nullif(_reason, '') else public.company_subscriptions.override_reason end,
    updated_at = v_now;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) get_subscription_gate_state — extra fields for UI + override bypass.
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
  developer_override_active boolean
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
    coalesce(s.is_trial, false) as is_trial,
    coalesce(s.trial_started_at, s.trial_starts_at) as trial_started_at,
    s.trial_ends_at,
    exists (
      select 1
      from admin.subscription_overrides o
      where o.company_id = c.id
        and (o.expires_at is null or o.expires_at > now())
    ) as developer_override_active
  from core.companies c
  left join public.company_subscriptions s on s.company_id::text = c.id::text
  where c.id = v_company_id;
end;
$$;

grant execute on function public.get_subscription_gate_state() to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Post–trial plan choice (company admin only).
-- ---------------------------------------------------------------------------
create or replace function public.choose_post_trial_plan(_plan_code text)
returns jsonb
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_company_id uuid := core.current_company_id();
  v_user_id text := core.current_user_id();
  v_plan text := lower(coalesce(nullif(trim(_plan_code), ''), 'basic'));
  v_allowed boolean := false;
  v_trial_end timestamptz;
  v_is_trial boolean;
  v_now timestamptz := now();
begin
  if v_company_id is null or v_user_id is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_plan not in ('basic', 'pro') then
    v_plan := 'basic';
  end if;

  select exists (
    select 1 from core.company_members cm
    where cm.company_id = v_company_id
      and cm.clerk_user_id = v_user_id
      and lower(coalesce(cm.role, '')) in ('company_admin', 'admin')
  ) into v_allowed;

  if not v_allowed then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select s.is_trial, s.trial_ends_at
  into v_is_trial, v_trial_end
  from public.company_subscriptions s
  where s.company_id::text = v_company_id::text;

  if not found then
    raise exception 'subscription not found' using errcode = '42501';
  end if;

  if v_trial_end is null or v_trial_end > v_now then
    raise exception 'trial has not ended yet' using errcode = '42501';
  end if;

  if coalesce(v_is_trial, false) = false then
    raise exception 'no active post-trial selection required' using errcode = '42501';
  end if;

  update public.company_subscriptions
  set
    plan_id = v_plan,
    plan_code = v_plan,
    plan = v_plan,
    is_trial = false,
    status = 'active',
    updated_at = v_now
  where company_id::text = v_company_id::text;

  return jsonb_build_object(
    'success', true,
    'company_id', v_company_id::text,
    'plan_code', v_plan
  );
end;
$$;

grant execute on function public.choose_post_trial_plan(text) to authenticated;

notify pgrst, 'reload schema';

commit;
