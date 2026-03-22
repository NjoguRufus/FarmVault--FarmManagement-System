begin;

create schema if not exists admin;
create schema if not exists billing;

alter table core.companies
  add column if not exists email text;

do $$
declare
  v_relkind "char";
begin
  select c.relkind
  into v_relkind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'company_subscriptions'
  limit 1;

  -- Some environments still have public.company_subscriptions as a view.
  -- This migration needs write support (upsert/update), so convert to table.
  if v_relkind = 'v' then
    execute 'drop view public.company_subscriptions cascade';
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'company_subscriptions'
  ) then
    create table public.company_subscriptions (
      company_id uuid primary key,
      plan_id text,
      plan_code text,
      plan text,
      status text,
      billing_mode text default 'manual',
      billing_cycle text,
      is_trial boolean default false,
      trial_started_at timestamptz,
      trial_starts_at timestamptz,
      trial_ends_at timestamptz,
      current_period_start timestamptz,
      current_period_end timestamptz,
      active_until timestamptz,
      payment_note text,
      override_reason text,
      override_by text,
      approved_at timestamptz,
      approved_by text,
      rejection_reason text,
      override jsonb,
      updated_by text,
      updated_at timestamptz not null default now(),
      created_by text,
      created_at timestamptz not null default now()
    );
  end if;
end $$;

-- Compatibility view for legacy developer RPCs that still reference
-- billing.company_subscriptions_view in some environments.
create or replace view billing.company_subscriptions_view as
select
  s.company_id,
  coalesce(s.plan_id, s.plan_code, s.plan, 'basic') as plan_id,
  coalesce(s.status, 'pending_approval') as status,
  coalesce(s.current_period_end, s.active_until) as current_period_end,
  s.trial_ends_at,
  s.updated_at
from public.company_subscriptions s;

grant select on billing.company_subscriptions_view to authenticated;

alter table public.company_subscriptions
  add column if not exists plan_code text,
  add column if not exists plan text,
  add column if not exists billing_mode text default 'manual',
  add column if not exists billing_cycle text,
  add column if not exists is_trial boolean default false,
  add column if not exists trial_starts_at timestamptz,
  add column if not exists active_until timestamptz,
  add column if not exists payment_note text,
  add column if not exists override_by text,
  add column if not exists updated_by text,
  add column if not exists created_by text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists rejection_reason text,
  add column if not exists override_reason text;

update public.company_subscriptions
set billing_mode = coalesce(nullif(billing_mode, ''), 'manual')
where billing_mode is null or billing_mode = '';

update public.company_subscriptions
set
  plan_code = coalesce(nullif(plan_code, ''), nullif(plan_id, ''), nullif(plan, ''), 'basic'),
  plan = coalesce(nullif(plan, ''), nullif(plan_code, ''), nullif(plan_id, ''), 'basic'),
  trial_starts_at = coalesce(trial_starts_at, trial_started_at),
  active_until = coalesce(active_until, current_period_end),
  is_trial = coalesce(is_trial, false);

create or replace function public.normalize_email(input text)
returns text
language sql
immutable
as $$
  select case when input is null then null else lower(btrim(input)) end
$$;

create or replace function public.normalize_profile_email()
returns trigger
language plpgsql
as $$
begin
  new.email := public.normalize_email(new.email);
  return new;
end;
$$;

drop trigger if exists trg_normalize_profile_email on core.profiles;
create trigger trg_normalize_profile_email
before insert or update of email on core.profiles
for each row
execute function public.normalize_profile_email();

create or replace function public.normalize_employee_email()
returns trigger
language plpgsql
as $$
begin
  new.email := public.normalize_email(new.email);
  return new;
end;
$$;

drop trigger if exists trg_normalize_employee_email on public.employees;
create trigger trg_normalize_employee_email
before insert or update of email on public.employees
for each row
execute function public.normalize_employee_email();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'core' and table_name = 'companies' and column_name = 'email'
  ) then
    execute $sql$
      create or replace function public.normalize_company_email()
      returns trigger
      language plpgsql
      as $fn$
      begin
        new.email := public.normalize_email(new.email);
        return new;
      end;
      $fn$
    $sql$;

    execute 'drop trigger if exists trg_normalize_company_email on core.companies';
    execute 'create trigger trg_normalize_company_email before insert or update of email on core.companies for each row execute function public.normalize_company_email()';
  end if;
end $$;

do $$
declare
  v_profile_dupes int := 0;
begin
  select count(*)
  into v_profile_dupes
  from (
    select public.normalize_email(email)
    from core.profiles
    where nullif(public.normalize_email(email), '') is not null
    group by 1
    having count(*) > 1
  ) d;

  if v_profile_dupes = 0 then
    create unique index if not exists uq_core_profiles_email_global
      on core.profiles (public.normalize_email(email))
      where nullif(public.normalize_email(email), '') is not null;
  else
    raise notice 'Skipped unique index uq_core_profiles_email_global; found % duplicate normalized emails', v_profile_dupes;
  end if;
end $$;

do $$
declare
  v_company_dupes int := 0;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'core' and table_name = 'companies' and column_name = 'email'
  ) then
    select count(*)
    into v_company_dupes
    from (
      select public.normalize_email(email)
      from core.companies
      where nullif(public.normalize_email(email), '') is not null
      group by 1
      having count(*) > 1
    ) d;

    if v_company_dupes = 0 then
      execute 'create unique index if not exists uq_core_companies_email_global on core.companies (public.normalize_email(email)) where nullif(public.normalize_email(email), '''') is not null';
    else
      raise notice 'Skipped unique index uq_core_companies_email_global; found % duplicate normalized emails', v_company_dupes;
    end if;
  end if;
end $$;

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
  override_reason text
)
language plpgsql
stable
security definer
set search_path = core, public
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
    coalesce(s.plan_id, s.plan_code, 'basic') as selected_plan,
    coalesce(s.billing_mode, 'manual') as billing_mode,
    coalesce(s.status, 'pending_approval') as status,
    c.created_at,
    s.approved_at,
    s.approved_by,
    s.rejection_reason,
    coalesce(s.override_reason, s.override ->> 'reason')
  from core.companies c
  left join public.company_subscriptions s on s.company_id::text = c.id::text
  where c.id = v_company_id;
end;
$$;

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
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_action not in ('approve', 'reject', 'suspend', 'activate', 'start_trial', 'extend', 'set_plan') then
    raise exception 'unsupported action: %', v_action;
  end if;

  v_plan := lower(coalesce(_plan_code, ''));
  if v_plan = '' then
    select coalesce(plan_code, plan_id, 'basic') into v_plan
    from public.company_subscriptions
    where company_id::text = _company_id::text;
  end if;
  if v_plan not in ('basic', 'pro') then
    v_plan := 'basic';
  end if;

  v_status := case v_action
    when 'approve' then 'active'
    when 'reject' then 'rejected'
    when 'suspend' then 'suspended'
    when 'activate' then 'active'
    when 'start_trial' then 'trialing'
    when 'extend' then 'active'
    when 'set_plan' then coalesce((select status from public.company_subscriptions where company_id::text = _company_id::text), 'pending_approval')
    else 'pending_approval'
  end;

  v_until := case
    when _days is not null and _days > 0 then v_now + make_interval(days => _days)
    else null
  end;

  insert into public.company_subscriptions (
    company_id, plan_id, plan_code, status, billing_mode,
    trial_started_at, trial_ends_at, current_period_end,
    approved_at, approved_by, rejection_reason, override_reason, updated_at
  )
  values (
    _company_id, v_plan, v_plan, v_status, 'manual',
    case when v_action = 'start_trial' then v_now else null end,
    case when v_action = 'start_trial' then coalesce(v_until, v_now + interval '7 days') else null end,
    case when v_action in ('activate', 'approve', 'extend') then coalesce(v_until, v_now + interval '30 days') else null end,
    case when v_action in ('approve', 'activate', 'start_trial') then v_now else null end,
    case when v_action in ('approve', 'activate', 'start_trial') then v_user_id else null end,
    case when v_action = 'reject' then nullif(_reason, '') else null end,
    case when v_action in ('extend', 'set_plan', 'suspend') then nullif(_reason, '') else null end,
    v_now
  )
  on conflict (company_id) do update set
    plan_id = coalesce(excluded.plan_id, public.company_subscriptions.plan_id),
    plan_code = coalesce(excluded.plan_code, public.company_subscriptions.plan_code),
    status = excluded.status,
    billing_mode = 'manual',
    trial_started_at = coalesce(excluded.trial_started_at, public.company_subscriptions.trial_started_at),
    trial_ends_at = coalesce(excluded.trial_ends_at, public.company_subscriptions.trial_ends_at),
    current_period_end = coalesce(excluded.current_period_end, public.company_subscriptions.current_period_end),
    approved_at = coalesce(excluded.approved_at, public.company_subscriptions.approved_at),
    approved_by = coalesce(excluded.approved_by, public.company_subscriptions.approved_by),
    rejection_reason = case when v_action = 'reject' then nullif(_reason, '') else public.company_subscriptions.rejection_reason end,
    override_reason = case when v_action in ('extend', 'set_plan', 'suspend') then nullif(_reason, '') else public.company_subscriptions.override_reason end,
    updated_at = v_now;
end;
$$;

create or replace function public.list_duplicate_emails()
returns jsonb
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
declare
  v_result jsonb;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'profiles', coalesce((
      select jsonb_agg(jsonb_build_object('email', email_norm, 'count', cnt))
      from (
        select public.normalize_email(email) as email_norm, count(*) as cnt
        from core.profiles
        where nullif(public.normalize_email(email), '') is not null
        group by 1
        having count(*) > 1
        order by cnt desc
      ) p
    ), '[]'::jsonb),
    'companies', coalesce((
      select jsonb_agg(jsonb_build_object('email', email_norm, 'count', cnt))
      from (
        select public.normalize_email(email) as email_norm, count(*) as cnt
        from core.companies
        where nullif(public.normalize_email(email), '') is not null
        group by 1
        having count(*) > 1
        order by cnt desc
      ) c
    ), '[]'::jsonb),
    'employees_per_company', coalesce((
      select jsonb_agg(jsonb_build_object('company_id', company_id, 'email', email_norm, 'count', cnt))
      from (
        select company_id::text as company_id, public.normalize_email(email) as email_norm, count(*) as cnt
        from public.employees
        where nullif(public.normalize_email(email), '') is not null
        group by 1,2
        having count(*) > 1
        order by cnt desc
      ) e
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

create or replace function public.validate_email_uniqueness(
  _email text,
  _company_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_email text := public.normalize_email(_email);
  v_user_exists boolean := false;
  v_company_exists boolean := false;
  v_employee_exists boolean := false;
begin
  if nullif(v_email, '') is null then
    return jsonb_build_object('ok', false, 'message', 'Email is required');
  end if;

  select exists(
    select 1 from core.profiles p
    where public.normalize_email(p.email) = v_email
  ) into v_user_exists;

  select exists(
    select 1 from core.companies c
    where public.normalize_email(c.email) = v_email
  ) into v_company_exists;

  if _company_id is not null then
    select exists(
      select 1 from public.employees e
      where e.company_id::text = _company_id::text
        and public.normalize_email(e.email) = v_email
    ) into v_employee_exists;
  end if;

  return jsonb_build_object(
    'ok', not (v_user_exists or v_company_exists or v_employee_exists),
    'user_exists', v_user_exists,
    'company_exists', v_company_exists,
    'employee_exists', v_employee_exists,
    'message', case
      when v_user_exists then 'This email is already used by another user.'
      when v_company_exists then 'This email is already used by another company.'
      when v_employee_exists then 'This email already exists in this company.'
      else null
    end
  );
end;
$$;

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
  v_plan_expr text;
  v_trial_start_expr text;
  v_active_until_expr text;
  v_billing_mode_expr text;
  v_billing_cycle_expr text;
  v_sql text;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select count(*) into v_total
  from core.companies c
  where (p_search is null or p_search = '' or c.name ilike '%' || p_search || '%');

  v_plan_expr := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'company_subscriptions' and column_name = 'plan_code'
    ) then 'coalesce(cs.plan_code, cs.plan_id, ''basic'')'
    else 'coalesce(cs.plan_id, ''basic'')'
  end;

  v_trial_start_expr := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'company_subscriptions' and column_name = 'trial_starts_at'
    ) then 'cs.trial_starts_at'
    else 'cs.trial_started_at'
  end;

  v_active_until_expr := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'company_subscriptions' and column_name = 'active_until'
    ) then 'cs.active_until'
    else 'cs.current_period_end'
  end;

  v_billing_mode_expr := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'company_subscriptions' and column_name = 'billing_mode'
    ) then 'cs.billing_mode'
    else '(cs.override->>''billing_mode'')'
  end;

  v_billing_cycle_expr := case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'company_subscriptions' and column_name = 'billing_cycle'
    ) then 'cs.billing_cycle'
    else '(cs.override->>''billing_cycle'')'
  end;

  v_sql := format($f$
    select jsonb_build_object(
      'rows', coalesce(jsonb_agg(row_data order by (row_data->>'created_at')::timestamptz desc nulls last), '[]'::jsonb),
      'total', %s
    )
    from (
      select jsonb_build_object(
        'company_id', c.id,
        'company_name', c.name,
        'created_at', c.created_at,
        'users_count', (
          select count(*) from core.company_members cm where cm.company_id::text = c.id::text
        ),
        'employees_count', (
          select count(*) from public.employees e where e.company_id::text = c.id::text
        ),
        'subscription_status', coalesce(cs.status, 'none'),
        'plan_code', %s,
        'billing_mode', %s,
        'billing_cycle', %s,
        'is_trial', coalesce(cs.is_trial, cs.status = 'trialing', false),
        'trial_ends_at', cs.trial_ends_at,
        'active_until', %s,
        'override_reason', coalesce(cs.override_reason, cs.override->>'reason'),
        'override_by', coalesce(cs.override_by, cs.override->>'granted_by'),
        'override', cs.override,
        'subscription', jsonb_build_object(
          'plan', %s,
          'plan_code', %s,
          'status', cs.status,
          'is_trial', coalesce(cs.is_trial, cs.status = 'trialing', false),
          'trial_start', %s,
          'trial_end', cs.trial_ends_at,
          'active_until', %s,
          'billing_mode', %s,
          'billing_cycle', %s
        )
      ) as row_data
      from core.companies c
      left join public.company_subscriptions cs on cs.company_id::text = c.id::text
      where (coalesce(%L, '') = '' or c.name ilike '%%' || %L || '%%')
      order by c.created_at desc nulls last
      limit %s
      offset %s
    ) q
  $f$,
    v_total,
    v_plan_expr,
    v_billing_mode_expr,
    v_billing_cycle_expr,
    v_active_until_expr,
    v_plan_expr,
    v_plan_expr,
    v_trial_start_expr,
    v_active_until_expr,
    v_billing_mode_expr,
    v_billing_cycle_expr,
    p_search, p_search, p_limit, p_offset
  );

  execute v_sql into v_result;
  return coalesce(v_result, '{"rows": [], "total": 0}'::jsonb);
end;
$$;

grant execute on function public.get_subscription_gate_state() to authenticated;
grant execute on function public.set_company_subscription_state(uuid, text, text, text, int) to authenticated;
grant execute on function public.list_companies(text, int, int) to authenticated;

drop function if exists public.list_companies_v2(text, int, int);
create or replace function public.list_companies_v2(
  p_search text default null,
  p_limit int default 200,
  p_offset int default 0
)
returns jsonb
language sql
stable
security definer
set search_path = admin, core, public
as $$
  select public.list_companies(p_search, p_limit, p_offset);
$$;

grant execute on function public.list_companies_v2(text, int, int) to authenticated;

grant execute on function public.list_duplicate_emails() to authenticated;
grant execute on function public.validate_email_uniqueness(text, uuid) to authenticated;
grant execute on function public.normalize_email(text) to authenticated;

commit;
