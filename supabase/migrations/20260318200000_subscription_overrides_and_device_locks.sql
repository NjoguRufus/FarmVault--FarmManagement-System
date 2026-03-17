-- Subscription overrides and device app locks for FarmVault
-- Purpose:
-- 1. admin.subscription_overrides: Developer override records
-- 2. admin.subscription_override_audit: Audit log for all override changes
-- 3. core.device_app_locks: Per-user, per-device PIN/biometric app lock
-- 4. Updated override_subscription RPC with audit logging

begin;

-- =============================================================================
-- 1) Subscription overrides table (developer-managed)
-- =============================================================================

create table if not exists admin.subscription_overrides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  override_plan text,
  override_status text,
  mode text,
  reason text,
  notes text,
  starts_at timestamptz default now(),
  expires_at timestamptz,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (company_id)
);

comment on table admin.subscription_overrides is 'Developer overrides for company subscriptions';

-- =============================================================================
-- 2) Subscription override audit log
-- =============================================================================

create table if not exists admin.subscription_override_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  action text not null,
  mode text,
  override_plan text,
  override_status text,
  reason text,
  notes text,
  expires_at timestamptz,
  created_by text,
  created_at timestamptz default now()
);

comment on table admin.subscription_override_audit is 'Audit log for all subscription override changes';

-- Index for audit queries
create index if not exists idx_override_audit_company 
  on admin.subscription_override_audit(company_id);
create index if not exists idx_override_audit_created 
  on admin.subscription_override_audit(created_at desc);

-- =============================================================================
-- 3) Device app locks table (PIN/biometric per user per device)
-- =============================================================================

create table if not exists core.device_app_locks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  device_id text not null,
  pin_hash text not null,
  fingerprint_enabled boolean default false,
  face_enabled boolean default false,
  passkey_enabled boolean default false,
  failed_attempts int default 0,
  locked_until timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_used_at timestamptz,
  unique (user_id, device_id)
);

comment on table core.device_app_locks is 'Per-user per-device quick unlock settings';

-- RLS for device_app_locks
alter table core.device_app_locks enable row level security;

drop policy if exists device_app_locks_self on core.device_app_locks;
create policy device_app_locks_self
  on core.device_app_locks
  for all
  using (core.current_user_id() = user_id)
  with check (core.current_user_id() = user_id);

-- Grant access to authenticated users
grant select, insert, update, delete on core.device_app_locks to authenticated;

-- =============================================================================
-- 4) Updated override_subscription RPC with audit logging
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
  v_company_id uuid := _company_id;
  v_status text;
  v_expires_at timestamptz;
  v_user_id text;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_user_id := core.current_user_id();

  -- Determine status and expiry based on mode
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

  v_expires_at := case
    when _mode = 'free_forever' then now() + interval '100 years'
    when _until is not null then _until
    when _days is not null then now() + (_days || ' days')::interval
    else now() + interval '1 year'
  end;

  -- Upsert public.company_subscriptions
  insert into public.company_subscriptions (
    company_id,
    plan_id,
    status,
    trial_started_at,
    trial_ends_at,
    current_period_start,
    current_period_end,
    override,
    updated_at
  )
  values (
    v_company_id,
    coalesce(_plan_code, 'pro'),
    v_status,
    case when _mode = 'start_trial' then now() else null end,
    case when _mode = 'start_trial' then v_expires_at else null end,
    now(),
    v_expires_at,
    case when _mode = 'remove_override' then null else
      jsonb_build_object(
        'enabled', true,
        'mode', _mode,
        'note', _note,
        'reason', _reason,
        'billing_mode', _billing_mode,
        'billing_cycle', _billing_cycle,
        'granted_at', now(),
        'granted_by', v_user_id,
        'expires_at', v_expires_at
      )
    end,
    now()
  )
  on conflict (company_id) do update set
    plan_id          = coalesce(excluded.plan_id, public.company_subscriptions.plan_id),
    status           = coalesce(excluded.status, public.company_subscriptions.status),
    trial_started_at = coalesce(excluded.trial_started_at, public.company_subscriptions.trial_started_at),
    trial_ends_at    = coalesce(excluded.trial_ends_at, public.company_subscriptions.trial_ends_at),
    current_period_end = coalesce(excluded.current_period_end, public.company_subscriptions.current_period_end),
    override         = case when _mode = 'remove_override' then null else excluded.override end,
    updated_at       = now();

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
      v_company_id,
      coalesce(_plan_code, 'pro'),
      v_status,
      _mode,
      _reason,
      _note,
      now(),
      v_expires_at,
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
    -- Remove override
    delete from admin.subscription_overrides where company_id = v_company_id;
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
    v_company_id,
    _mode,
    _mode,
    coalesce(_plan_code, 'pro'),
    v_status,
    _reason,
    _note,
    v_expires_at,
    v_user_id
  );
end;
$$;

-- =============================================================================
-- 5) RPC to get override for a company (for Developer Companies page)
-- =============================================================================

create or replace function public.get_company_override(_company_id uuid)
returns table (
  override_plan text,
  override_status text,
  mode text,
  reason text,
  notes text,
  starts_at timestamptz,
  expires_at timestamptz,
  created_by text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = admin, public
as $$
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  select
    o.override_plan,
    o.override_status,
    o.mode,
    o.reason,
    o.notes,
    o.starts_at,
    o.expires_at,
    o.created_by,
    o.created_at
  from admin.subscription_overrides o
  where o.company_id = _company_id;
end;
$$;

grant execute on function public.get_company_override(uuid) to authenticated;

-- =============================================================================
-- 6) RPCs for device app locks
-- =============================================================================

-- Enable quick unlock (set or update PIN)
create or replace function public.enable_quick_unlock(
  _device_id text,
  _pin_hash text,
  _fingerprint boolean default false,
  _face boolean default false
)
returns void
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_user_id text;
begin
  v_user_id := core.current_user_id();
  
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into core.device_app_locks (
    user_id,
    device_id,
    pin_hash,
    fingerprint_enabled,
    face_enabled,
    updated_at
  )
  values (
    v_user_id,
    _device_id,
    _pin_hash,
    _fingerprint,
    _face,
    now()
  )
  on conflict (user_id, device_id) do update set
    pin_hash = excluded.pin_hash,
    fingerprint_enabled = excluded.fingerprint_enabled,
    face_enabled = excluded.face_enabled,
    failed_attempts = 0,
    locked_until = null,
    updated_at = now();
end;
$$;

grant execute on function public.enable_quick_unlock(text, text, boolean, boolean) to authenticated;

-- Disable quick unlock
create or replace function public.disable_quick_unlock(_device_id text)
returns void
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_user_id text;
begin
  v_user_id := core.current_user_id();
  
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  delete from core.device_app_locks
  where user_id = v_user_id and device_id = _device_id;
end;
$$;

grant execute on function public.disable_quick_unlock(text) to authenticated;

-- Verify PIN
create or replace function public.verify_quick_unlock_pin(_device_id text, _pin_hash text)
returns boolean
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_user_id text;
  v_stored_hash text;
  v_failed_attempts int;
  v_locked_until timestamptz;
begin
  v_user_id := core.current_user_id();
  
  if v_user_id is null then
    return false;
  end if;

  select pin_hash, failed_attempts, locked_until
  into v_stored_hash, v_failed_attempts, v_locked_until
  from core.device_app_locks
  where user_id = v_user_id and device_id = _device_id;

  if v_stored_hash is null then
    return false;
  end if;

  -- Check if locked
  if v_locked_until is not null and v_locked_until > now() then
    return false;
  end if;

  -- Verify PIN
  if v_stored_hash = _pin_hash then
    -- Reset failed attempts on success
    update core.device_app_locks
    set failed_attempts = 0, locked_until = null, last_used_at = now()
    where user_id = v_user_id and device_id = _device_id;
    return true;
  else
    -- Increment failed attempts
    v_failed_attempts := coalesce(v_failed_attempts, 0) + 1;
    
    -- Lock after 5 failed attempts for 5 minutes
    if v_failed_attempts >= 5 then
      update core.device_app_locks
      set failed_attempts = v_failed_attempts, locked_until = now() + interval '5 minutes'
      where user_id = v_user_id and device_id = _device_id;
    else
      update core.device_app_locks
      set failed_attempts = v_failed_attempts
      where user_id = v_user_id and device_id = _device_id;
    end if;
    
    return false;
  end if;
end;
$$;

grant execute on function public.verify_quick_unlock_pin(text, text) to authenticated;

-- Get device app lock status
create or replace function public.get_device_app_lock(_device_id text)
returns table (
  has_pin boolean,
  fingerprint_enabled boolean,
  face_enabled boolean,
  passkey_enabled boolean,
  is_locked boolean,
  locked_until timestamptz
)
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_user_id text;
begin
  v_user_id := core.current_user_id();
  
  if v_user_id is null then
    return query select false, false, false, false, false, null::timestamptz;
    return;
  end if;

  return query
  select
    true as has_pin,
    coalesce(d.fingerprint_enabled, false),
    coalesce(d.face_enabled, false),
    coalesce(d.passkey_enabled, false),
    d.locked_until is not null and d.locked_until > now(),
    d.locked_until
  from core.device_app_locks d
  where d.user_id = v_user_id and d.device_id = _device_id;

  -- Return default if no record
  if not found then
    return query select false, false, false, false, false, null::timestamptz;
  end if;
end;
$$;

grant execute on function public.get_device_app_lock(text) to authenticated;

-- =============================================================================
-- 7) Update list_companies to include override info
-- =============================================================================

-- Drop existing list_companies functions if they have wrong return type
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
set search_path = admin, core, billing, public
as $$
declare
  v_result jsonb;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(row_data order by row_data->>'created_at' desc nulls last), '[]'::jsonb),
    'total', count(*) over ()
  )
  into v_result
  from (
    select jsonb_build_object(
      'company_id', c.id,
      'company_name', c.name,
      'created_at', c.created_at,
      'users_count', (select count(*) from core.company_members cm where cm.company_id = c.id),
      'employees_count', (select count(*) from public.employees e where e.company_id = c.id::text),
      'subscription_status', coalesce(s.status, 'none'),
      'plan_code', coalesce(s.plan_id, 'basic'),
      'billing_mode', s.override->>'billing_mode',
      'billing_cycle', s.override->>'billing_cycle',
      'is_trial', s.status = 'trialing',
      'trial_ends_at', s.trial_ends_at,
      'active_until', s.current_period_end,
      'override', s.override,
      'subscription', jsonb_build_object(
        'plan', s.plan_id,
        'status', s.status,
        'trial_start', s.trial_started_at,
        'trial_end', s.trial_ends_at,
        'period_start', s.current_period_start,
        'period_end', s.current_period_end
      )
    ) as row_data
    from core.companies c
    left join public.company_subscriptions s on s.company_id = c.id
    where (p_search is null or p_search = '' or c.name ilike '%' || p_search || '%')
    limit p_limit
    offset p_offset
  ) subq;

  return coalesce(v_result, '{"rows": [], "total": 0}'::jsonb);
end;
$$;

grant execute on function public.list_companies(text, int, int) to authenticated;

commit;
