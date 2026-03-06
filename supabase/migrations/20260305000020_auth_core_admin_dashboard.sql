begin;

-- =============================================================================
-- 1) Schemas and basic helpers
-- =============================================================================

create schema if not exists core;
create schema if not exists admin;
create schema if not exists billing;
create schema if not exists projects;
create schema if not exists harvest;
create schema if not exists finance;
create schema if not exists inventory;
create schema if not exists ops;

-- -----------------------------------------------------------------------------
-- Auth identity helpers
-- -----------------------------------------------------------------------------

create or replace function core.current_user_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

create or replace function admin.current_clerk_user_id()
returns text
language sql
stable
as $$
  select core.current_user_id()
$$;

create or replace function core.is_signed_in()
returns boolean
language sql
stable
as $$
  select core.current_user_id() is not null
$$;

-- =============================================================================
-- 2) Core tables and compatibility columns (idempotent)
-- =============================================================================

-- Ensure core.profiles exists with the canonical columns used by the app.
create table if not exists core.profiles (
  clerk_user_id    text primary key,
  email            text,
  full_name        text,
  active_company_id uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- In case table existed without clerk_user_id as PK, add column/constraint safely.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'core'
      and table_name   = 'profiles'
  ) then
    alter table core.profiles
      add column if not exists clerk_user_id text;
    alter table core.profiles
      add column if not exists active_company_id uuid;
    alter table core.profiles
      add column if not exists created_at timestamptz default now();
    alter table core.profiles
      add column if not exists updated_at timestamptz default now();

    -- Make clerk_user_id the primary key only if no PK exists yet.
    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'core.profiles'::regclass
        and contype = 'p'
    ) then
      alter table core.profiles
        add constraint core_profiles_pkey primary key (clerk_user_id);
    end if;
  end if;
end$$;

-- Core companies (canonical)
create table if not exists core.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  logo_url   text,
  created_by text not null default core.current_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Company members (canonical)
create table if not exists core.company_members (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references core.companies(id) on delete cascade,
  clerk_user_id text not null,
  role          text not null default 'member',
  created_at    timestamptz not null default now(),
  unique (company_id, clerk_user_id)
);

-- In case core.company_members existed without clerk_user_id, add it safely.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'core'
      and table_name   = 'company_members'
  ) then
    alter table core.company_members
      add column if not exists clerk_user_id text;
  end if;
end$$;

create index if not exists idx_core_company_members_user
  on core.company_members (clerk_user_id);

create index if not exists idx_core_company_members_company
  on core.company_members (company_id);

-- =============================================================================
-- 3) Current company resolution
-- =============================================================================

-- Canonical current_company_id in core, keyed by profiles.clerk_user_id.
create or replace function core.current_company_id()
returns uuid
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_user_id    text;
begin
  v_user_id := core.current_user_id();
  if v_user_id is null then
    return null;
  end if;

  -- 1) Prefer active_company_id on core.profiles
  select p.active_company_id
  into v_company_id
  from core.profiles p
  where p.clerk_user_id = v_user_id
  limit 1;

  if v_company_id is not null then
    return v_company_id;
  end if;

  -- 2) Fallback: most recent membership in core.company_members
  select m.company_id
  into v_company_id
  from core.company_members m
  where m.clerk_user_id = v_user_id
  order by m.created_at desc
  limit 1;

  return v_company_id;
end;
$$;

-- Public wrapper used by frontend RPC (`supabase.rpc('current_company_id')`)
create or replace function public.current_company_id()
returns uuid
language sql
stable
as $$
  select core.current_company_id()
$$;

-- =============================================================================
-- 4) Company creation helpers (core)
-- =============================================================================

-- Create a company and ensure:
-- - core.companies row
-- - core.company_members row for current user as company_admin
-- - core.profiles upsert keyed by clerk_user_id
-- - active_company_id is set
create or replace function core.create_company_with_admin(
  _name text
)
returns uuid
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_user_id    text;
  v_company_id uuid;
begin
  v_user_id := core.current_user_id();
  if v_user_id is null then
    raise exception 'create_company_with_admin: unauthenticated' using errcode = '28000';
  end if;

  insert into core.companies (name, created_by)
  values (_name, v_user_id)
  returning id into v_company_id;

  -- Ensure profile row exists and active_company_id is set.
  insert into core.profiles (clerk_user_id, active_company_id, created_at, updated_at)
  values (v_user_id, v_company_id, now(), now())
  on conflict (clerk_user_id) do update
    set active_company_id = excluded.active_company_id,
        updated_at        = now();

  -- Ensure company_admin membership exists.
  insert into core.company_members (company_id, clerk_user_id, role)
  values (v_company_id, v_user_id, 'company_admin')
  on conflict (company_id, clerk_user_id) do update
    set role = excluded.role;

  return v_company_id;
end;
$$;

-- Backwards-compatible alias if older code calls this name.
-- Implemented directly to avoid ambiguity with existing overloads.
create or replace function core.create_company_and_admin(
  _name text
)
returns uuid
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_user_id    text;
  v_company_id uuid;
begin
  v_user_id := core.current_user_id();
  if v_user_id is null then
    raise exception 'create_company_and_admin: unauthenticated' using errcode = '28000';
  end if;

  insert into core.companies (name, created_by)
  values (_name, v_user_id)
  returning id into v_company_id;

  insert into core.profiles (clerk_user_id, active_company_id, created_at, updated_at)
  values (v_user_id, v_company_id, now(), now())
  on conflict (clerk_user_id) do update
    set active_company_id = excluded.active_company_id,
        updated_at        = now();

  insert into core.company_members (company_id, clerk_user_id, role)
  values (v_company_id, v_user_id, 'company_admin')
  on conflict (company_id, clerk_user_id) do update
    set role = excluded.role;

  return v_company_id;
end;
$$;

-- =============================================================================
-- 5) Admin developer detection and helpers
-- =============================================================================

-- Ensure admin.developers has clerk_user_id when table already exists.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'admin'
      and table_name   = 'developers'
  ) then
    alter table admin.developers
      add column if not exists clerk_user_id text;
  end if;
end$$;

-- admin.is_developer(): only true when admin.developers has row for current clerk user id.
create or replace function admin.is_developer()
returns boolean
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
declare
  v_is_dev boolean := false;
  v_user  text;
begin
  v_user := core.current_user_id();
  if v_user is null then
    return false;
  end if;

  -- If admin.developers table is missing, treat everyone as non-developer.
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'admin'
      and table_name   = 'developers'
  ) then
    return false;
  end if;

  select exists (
    select 1
    from admin.developers d
    where d.clerk_user_id = v_user
  )
  into v_is_dev;

  return coalesce(v_is_dev, false);
end;
$$;

-- Optional bootstrap: upsert current user into admin.developers if app-side allowlist says yes.
-- NOTE: _email is passed from the app; allowlist logic stays in app.
create or replace function admin.bootstrap_developer(_email text)
returns void
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
declare
  v_user text;
begin
  v_user := core.current_user_id();
  if v_user is null then
    raise exception 'bootstrap_developer: unauthenticated' using errcode = '28000';
  end if;

  -- Ensure admin.developers table exists with minimal columns.
  perform 1
  from information_schema.tables
  where table_schema = 'admin' and table_name = 'developers';

  if not found then
    create table admin.developers (
      clerk_user_id text primary key,
      email         text,
      role          text
    );
  end if;

  insert into admin.developers (clerk_user_id, email, role)
  values (v_user, _email, 'developer')
  on conflict (clerk_user_id) do update
    set email = excluded.email;
end;
$$;

-- =============================================================================
-- 6) Developer dashboard KPIs and company list (admin)
-- =============================================================================

-- KPI function: counts from canonical tables plus optional legacy counts.
create or replace function admin.dev_dashboard_kpis()
returns table (
  companies_total           bigint,
  users_total               bigint,
  members_total             bigint,
  subscriptions_total       bigint,
  payments_total            bigint,
  public_companies_total    bigint,
  public_profiles_total     bigint,
  public_employees_total    bigint
)
language plpgsql
stable
security definer
set search_path = admin, core, billing, public
as $$
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Canonical counts
  select count(*) into companies_total from core.companies;
  select count(*) into users_total     from core.profiles;
  select count(*) into members_total   from core.company_members;

  -- billing.company_subscriptions (if present)
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'billing' and table_name = 'company_subscriptions'
  ) then
    execute 'select count(*) from billing.company_subscriptions' into subscriptions_total;
  else
    subscriptions_total := 0;
  end if;

  -- billing.payments (if present) – count only (no column assumptions)
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'billing' and table_name = 'payments'
  ) then
    execute 'select count(*) from billing.payments' into payments_total;
  else
    payments_total := 0;
  end if;

  -- Legacy public tables – for developer awareness / migration planning
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'companies'
  ) then
    execute 'select count(*) from public.companies' into public_companies_total;
  else
    public_companies_total := 0;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    execute 'select count(*) from public.profiles' into public_profiles_total;
  else
    public_profiles_total := 0;
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'employees'
  ) then
    execute 'select 1 from public.employees limit 1' into public_employees_total;
    execute 'select count(*) from public.employees' into public_employees_total;
  else
    public_employees_total := 0;
  end if;

  return next;
end;
$$;

-- Company overview list for admin dashboards:
-- canonical join of core.companies + billing.company_subscriptions.
create or replace function admin.list_companies()
returns table (
  company_id          uuid,
  company_name        text,
  subscription_status text,
  plan_code           text,
  billing_mode        text,
  billing_cycle       text,
  is_trial            boolean,
  trial_ends_at       timestamptz,
  active_until        timestamptz
)
language plpgsql
stable
security definer
set search_path = admin, core, billing, public
as $$
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Only run if billing.company_subscriptions exists
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'billing' and table_name = 'company_subscriptions'
  ) then
    return;
  end if;

  return query
    select
      c.id                 as company_id,
      c.name               as company_name,
      s.status             as subscription_status,
      s.plan_code          as plan_code,
      s.billing_mode       as billing_mode,
      s.billing_cycle      as billing_cycle,
      coalesce(s.is_trial, false)        as is_trial,
      s.trial_ends_at      as trial_ends_at,
      s.active_until       as active_until
    from core.companies c
    left join billing.company_subscriptions s
      on s.company_id = c.id;
end;
$$;

-- Optionally, expose company overview as a view for simpler selects.
do $$
begin
  if not exists (
    select 1
    from information_schema.views
    where table_schema = 'admin' and table_name = 'company_overview'
  ) then
    execute $v$
      create view admin.company_overview as
      select *
      from admin.list_companies()
    $v$;
  end if;
end$$;

-- =============================================================================
-- 7) Grants
-- =============================================================================

-- Allow authenticated users to use tenant schemas; keep admin restricted.
grant usage on schema core      to authenticated;
grant usage on schema billing   to authenticated;
grant usage on schema projects  to authenticated;
grant usage on schema harvest   to authenticated;
grant usage on schema finance   to authenticated;
grant usage on schema inventory to authenticated;
grant usage on schema ops       to authenticated;

-- RPC / helper function execution
grant execute on function public.current_company_id()   to authenticated;
grant execute on function core.current_company_id()     to authenticated;
grant execute on function core.is_signed_in()           to authenticated;

-- Admin functions: callable by authenticated, but gated by admin.is_developer().
grant execute on function admin.is_developer()             to authenticated;
grant execute on function admin.dev_dashboard_kpis()       to authenticated;
grant execute on function admin.list_companies()           to authenticated;
grant execute on function admin.bootstrap_developer(text)  to authenticated;

-- =============================================================================
-- 8) Sanity check queries (run manually, not part of migration logic)
-- =============================================================================
-- select core.current_user_id();
-- select core.current_company_id();
-- select public.current_company_id();
-- select admin.is_developer();
-- select * from admin.dev_dashboard_kpis();
-- select * from admin.list_companies();

commit;

