-- Fix Developer Companies page subscription override and listing errors
-- 
-- Real schema: public.company_subscriptions.company_id is UUID
-- Real columns: company_id, plan_code, plan, billing_mode, billing_cycle, status,
--               is_trial, trial_starts_at, trial_ends_at, active_until,
--               payment_note, override_reason, override_by, updated_by, updated_at, created_by

begin;

-- =============================================================================
-- 1) Safely drop billing.company_subscriptions view if it exists
-- =============================================================================

create schema if not exists billing;

do $$
begin
  if exists (
    select 1 from information_schema.views 
    where table_schema = 'billing' and table_name = 'company_subscriptions'
  ) then
    drop view billing.company_subscriptions cascade;
  end if;
end $$;

-- =============================================================================
-- 2) Recreate billing.company_subscriptions as a read-only view
-- =============================================================================

create or replace view billing.company_subscriptions as
select
  s.company_id,
  s.plan_code,
  s.plan,
  s.billing_mode,
  s.billing_cycle,
  s.status,
  s.is_trial,
  s.trial_starts_at,
  s.trial_ends_at,
  s.active_until,
  s.payment_note,
  s.override_reason,
  s.override_by,
  s.updated_by,
  s.updated_at,
  s.created_by
from public.company_subscriptions s;

grant select on billing.company_subscriptions to authenticated;

-- =============================================================================
-- 3) Fix list_companies - UUID to UUID join (no casting needed)
-- =============================================================================

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
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Get total count
  select count(*) into v_total
  from core.companies c
  where (p_search is null or p_search = '' or c.name ilike '%' || p_search || '%');

  -- Build result - UUID joins directly
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(row_data order by (row_data->>'created_at')::timestamptz desc nulls last), '[]'::jsonb),
    'total', v_total
  )
  into v_result
  from (
    select jsonb_build_object(
      'company_id', c.id,
      'company_name', c.name,
      'created_at', c.created_at,
      'users_count', (
        select count(*) 
        from core.company_members cm 
        where cm.company_id = c.id
      ),
      'employees_count', (
        select count(*) 
        from public.employees e 
        where e.company_id = c.id::text
      ),
      'subscription_status', coalesce(s.status, 'none'),
      'plan_code', coalesce(s.plan_code, 'basic'),
      'billing_mode', s.billing_mode,
      'billing_cycle', s.billing_cycle,
      'is_trial', coalesce(s.is_trial, false),
      'trial_ends_at', s.trial_ends_at,
      'active_until', s.active_until,
      'override_reason', s.override_reason,
      'override_by', s.override_by,
      'subscription', jsonb_build_object(
        'plan', s.plan,
        'plan_code', s.plan_code,
        'status', s.status,
        'is_trial', s.is_trial,
        'trial_start', s.trial_starts_at,
        'trial_end', s.trial_ends_at,
        'active_until', s.active_until,
        'billing_mode', s.billing_mode,
        'billing_cycle', s.billing_cycle
      )
    ) as row_data
    from core.companies c
    -- UUID = UUID join (no cast needed)
    left join public.company_subscriptions s on s.company_id = c.id
    where (p_search is null or p_search = '' or c.name ilike '%' || p_search || '%')
    order by c.created_at desc nulls last
    limit p_limit
    offset p_offset
  ) subq;

  return coalesce(v_result, '{"rows": [], "total": 0}'::jsonb);
end;
$$;

grant execute on function public.list_companies(text, int, int) to authenticated;

-- =============================================================================
-- 4) Fix override_subscription - write to real columns
-- =============================================================================

create or replace function public.override_subscription(
  _company_id uuid,
  _mode text,
  _days int default null,
  _until timestamptz default null,
  _plan_code text default null,
  _billing_mode text default null,
  _billing_cycle text default null,
  _note text default null,
  _reason text default null
)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_status text;
  v_is_trial boolean;
  v_trial_ends timestamptz;
  v_active_until timestamptz;
  v_user_id text;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_user_id := core.current_user_id();

  -- Determine status and dates based on mode
  v_status := case _mode
    when 'start_trial' then 'trialing'
    when 'free_until' then 'active'
    when 'free_forever' then 'active'
    when 'paid_active' then 'active'
    when 'pilot' then 'active'
    when 'collaborator' then 'active'
    when 'remove_override' then 'active'
    else 'trialing'
  end;

  v_is_trial := _mode = 'start_trial';

  v_active_until := case
    when _mode = 'free_forever' then now() + interval '100 years'
    when _until is not null then _until
    when _days is not null then now() + (_days || ' days')::interval
    else now() + interval '1 year'
  end;

  v_trial_ends := case when _mode = 'start_trial' then v_active_until else null end;

  -- Upsert public.company_subscriptions using real columns
  insert into public.company_subscriptions (
    company_id,
    plan_code,
    plan,
    billing_mode,
    billing_cycle,
    status,
    is_trial,
    trial_starts_at,
    trial_ends_at,
    active_until,
    payment_note,
    override_reason,
    override_by,
    updated_by,
    updated_at,
    created_by
  )
  values (
    _company_id,
    coalesce(_plan_code, 'pro'),
    coalesce(_plan_code, 'pro'),
    _billing_mode,
    _billing_cycle,
    v_status,
    v_is_trial,
    case when _mode = 'start_trial' then now() else null end,
    v_trial_ends,
    v_active_until,
    _note,
    case when _mode = 'remove_override' then null else _reason end,
    case when _mode = 'remove_override' then null else v_user_id end,
    v_user_id,
    now(),
    v_user_id
  )
  on conflict (company_id) do update set
    plan_code      = coalesce(excluded.plan_code, public.company_subscriptions.plan_code),
    plan           = coalesce(excluded.plan, public.company_subscriptions.plan),
    billing_mode   = coalesce(excluded.billing_mode, public.company_subscriptions.billing_mode),
    billing_cycle  = coalesce(excluded.billing_cycle, public.company_subscriptions.billing_cycle),
    status         = coalesce(excluded.status, public.company_subscriptions.status),
    is_trial       = excluded.is_trial,
    trial_starts_at = coalesce(excluded.trial_starts_at, public.company_subscriptions.trial_starts_at),
    trial_ends_at  = coalesce(excluded.trial_ends_at, public.company_subscriptions.trial_ends_at),
    active_until   = coalesce(excluded.active_until, public.company_subscriptions.active_until),
    payment_note   = excluded.payment_note,
    override_reason = case when _mode = 'remove_override' then null else excluded.override_reason end,
    override_by    = case when _mode = 'remove_override' then null else excluded.override_by end,
    updated_by     = excluded.updated_by,
    updated_at     = now();

  -- Upsert admin.subscription_overrides
  if _mode != 'remove_override' then
    insert into admin.subscription_overrides (
      company_id,
      override_plan,
      override_status,
      mode,
      reason,
      notes,
      starts_at,
      expires_at,
      created_by,
      updated_at
    )
    values (
      _company_id,
      coalesce(_plan_code, 'pro'),
      v_status,
      _mode,
      _reason,
      _note,
      now(),
      v_active_until,
      v_user_id,
      now()
    )
    on conflict (company_id) do update set
      override_plan = excluded.override_plan,
      override_status = excluded.override_status,
      mode = excluded.mode,
      reason = excluded.reason,
      notes = excluded.notes,
      starts_at = excluded.starts_at,
      expires_at = excluded.expires_at,
      created_by = excluded.created_by,
      updated_at = now();
  else
    delete from admin.subscription_overrides where company_id = _company_id;
  end if;

  -- Audit log
  insert into admin.subscription_override_audit (
    company_id,
    action,
    mode,
    override_plan,
    override_status,
    reason,
    notes,
    expires_at,
    created_by
  )
  values (
    _company_id,
    _mode,
    _mode,
    coalesce(_plan_code, 'pro'),
    v_status,
    _reason,
    _note,
    v_active_until,
    v_user_id
  );
end;
$$;

grant execute on function public.override_subscription(uuid, text, int, timestamptz, text, text, text, text, text) to authenticated;

commit;
