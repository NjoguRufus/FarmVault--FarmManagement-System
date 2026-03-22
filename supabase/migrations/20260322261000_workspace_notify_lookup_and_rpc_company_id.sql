-- 1) Developer-only lookup for workspace-ready email (canonical core.companies + member ids; bypasses core RLS from PostgREST).
-- 2) set_company_subscription_state returns company_id so the client never relies on a mismatched UI id.

begin;

create or replace function public.get_company_workspace_notify_lookup(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
declare
  v_id uuid;
  v_name text;
  v_email text;
  v_created_by text;
  v_source text := 'core';
  v_admin_ids jsonb := '[]'::jsonb;
  v_all_ids jsonb := '[]'::jsonb;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select c.id, c.name, c.email, c.created_by
  into v_id, v_name, v_email, v_created_by
  from core.companies c
  where c.id = p_company_id;

  if v_id is null and to_regclass('public.companies') is not null then
    select pc.id::uuid, pc.name, null::text,
      coalesce(nullif(trim(pc.created_by_clerk_user_id), ''), nullif(trim(pc.created_by), ''))
    into v_id, v_name, v_email, v_created_by
    from public.companies pc
    where pc.id::text = p_company_id::text
    limit 1;
    if v_id is not null then
      v_source := 'public';
    end if;
  end if;

  if v_id is null then
    return null;
  end if;

  select coalesce(
    jsonb_agg(cm.clerk_user_id order by cm.created_at nulls last)
      filter (where nullif(trim(cm.clerk_user_id), '') is not null),
    '[]'::jsonb
  )
  into v_admin_ids
  from core.company_members cm
  where cm.company_id = v_id
    and lower(replace(cm.role, '-', '_')) in ('company_admin', 'companyadmin', 'owner', 'admin');

  select coalesce(
    jsonb_agg(cm.clerk_user_id order by cm.created_at nulls last)
      filter (where nullif(trim(cm.clerk_user_id), '') is not null),
    '[]'::jsonb
  )
  into v_all_ids
  from core.company_members cm
  where cm.company_id = v_id;

  if jsonb_array_length(v_all_ids) = 0 and to_regclass('public.company_members') is not null then
    select coalesce(
      jsonb_agg(m.user_id order by m.created_at nulls last)
        filter (where nullif(trim(m.user_id), '') is not null),
      '[]'::jsonb
    )
    into v_all_ids
    from public.company_members m
    where m.company_id::text = v_id::text;

    select coalesce(
      jsonb_agg(m.user_id order by m.created_at nulls last)
        filter (where nullif(trim(m.user_id), '') is not null),
      '[]'::jsonb
    )
    into v_admin_ids
    from public.company_members m
    where m.company_id::text = v_id::text
      and lower(replace(m.role, '-', '_')) in ('company_admin', 'companyadmin', 'owner', 'admin');
  end if;

  return jsonb_build_object(
    'source_table', v_source,
    'company_id', v_id,
    'name', v_name,
    'email', v_email,
    'created_by', v_created_by,
    'admin_clerk_ids', case when jsonb_array_length(v_admin_ids) > 0 then v_admin_ids else '[]'::jsonb end,
    'all_clerk_ids', case when jsonb_array_length(v_all_ids) > 0 then v_all_ids else '[]'::jsonb end
  );
end;
$$;

grant execute on function public.get_company_workspace_notify_lookup(uuid) to authenticated;

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

  return jsonb_build_object(
    'workspace_ready_email', v_workspace_ready_email,
    'company_id', _company_id
  );
end;
$$;

grant execute on function public.set_company_subscription_state(uuid, text, text, text, int) to authenticated;

commit;

notify pgrst, 'reload schema';
