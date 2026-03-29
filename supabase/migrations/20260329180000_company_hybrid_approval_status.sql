-- Hybrid approval: core.companies.status (pending | active | suspended).
-- New companies default to pending; existing rows backfilled to active.
-- Gate RPC exposes company_status; admin approve/activate/suspend updates company row.

begin;

-- ---------------------------------------------------------------------------
-- 1) core.companies.status
-- ---------------------------------------------------------------------------
alter table core.companies
  add column if not exists status text;

-- Existing production workspaces: already operating → active
update core.companies
set status = 'active'
where status is null;

alter table core.companies
  alter column status set default 'pending';

alter table core.companies
  alter column status set not null;

alter table core.companies
  drop constraint if exists core_companies_status_check;

alter table core.companies
  add constraint core_companies_status_check
  check (status in ('pending', 'active', 'suspended'));

comment on column core.companies.status is
  'Farm workspace lifecycle: pending (awaiting admin approval), active, suspended.';

-- ---------------------------------------------------------------------------
-- 2) get_subscription_gate_state — include company_status
-- ---------------------------------------------------------------------------
drop function if exists public.get_subscription_gate_state();

create or replace function public.get_subscription_gate_state()
returns table (
  company_id uuid,
  company_name text,
  company_status text,
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
    c.status::text as company_status,
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
-- 3) set_company_subscription_state — sync core.companies.status
-- ---------------------------------------------------------------------------
drop function if exists public.set_company_subscription_state(uuid, text, text, text, int);

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
    case when v_action in ('activate', 'approve', 'extend') then coalesce(v_until, v_now + interval '30 days') else null end,
    case when v_action in ('activate', 'approve', 'extend') then coalesce(v_until, v_now + interval '30 days') else null end,
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
    current_period_end = coalesce(excluded.current_period_end, public.company_subscriptions.current_period_end),
    active_until = coalesce(excluded.active_until, public.company_subscriptions.active_until),
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
