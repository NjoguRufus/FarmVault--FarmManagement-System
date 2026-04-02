begin;

-- =========================================================
-- FarmVault Developer Intelligence Migration
-- Creates developer/admin schemas, secure developer access,
-- internal monitoring tables, and developer-only RPCs.
-- =========================================================

create extension if not exists pgcrypto;

create schema if not exists admin;
create schema if not exists developer;

-- =========================================================
-- 1) HELPERS
-- =========================================================

create or replace function developer.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function developer.table_exists(p_schema text, p_table text)
returns boolean
language sql
stable
as $$
  select to_regclass(format('%I.%I', p_schema, p_table)) is not null;
$$;

create or replace function developer.column_exists(p_schema text, p_table text, p_column text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = p_schema
      and table_name = p_table
      and column_name = p_column
  );
$$;

create or replace function developer.safe_count(p_sql text)
returns bigint
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_count bigint := 0;
begin
  execute format('select count(*) from (%s) q', p_sql) into v_count;
  return coalesce(v_count, 0);
exception
  when others then
    return 0;
end;
$$;

create or replace function developer.safe_jsonb(p_sql text, p_fallback jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_json jsonb;
begin
  execute p_sql into v_json;
  return coalesce(v_json, p_fallback);
exception
  when others then
    return p_fallback;
end;
$$;

create or replace function developer.safe_numeric(p_sql text)
returns numeric
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_num numeric := 0;
begin
  execute p_sql into v_num;
  return coalesce(v_num, 0);
exception
  when others then
    return 0;
end;
$$;

-- =========================================================
-- 2) DEVELOPER ACCESS MODEL
-- =========================================================

create table if not exists admin.developers (
  -- NOTE: some environments use `clerk_user_id text` instead of `user_id uuid`.
  -- We keep this migration tolerant by using dynamic RLS/function bodies below.
  user_id uuid primary key,
  email text,
  full_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  notes text
);

alter table admin.developers enable row level security;

drop policy if exists developers_select_self_or_developer on admin.developers;
do $$
begin
  if developer.column_exists('admin','developers','clerk_user_id') then
    execute $p$
      create policy developers_select_self_or_developer
      on admin.developers
      for select
      to authenticated
      using (
        clerk_user_id = core.current_user_id()
        or exists (
          select 1
          from admin.developers d
          where d.clerk_user_id = core.current_user_id()
            and d.is_active = true
        )
      )
    $p$;
  else
    execute $p$
      create policy developers_select_self_or_developer
      on admin.developers
      for select
      to authenticated
      using (
        user_id = auth.uid()
        or exists (
          select 1
          from admin.developers d
          where d.user_id = auth.uid()
            and d.is_active = true
        )
      )
    $p$;
  end if;
end $$;

drop policy if exists developers_insert_none on admin.developers;
create policy developers_insert_none
on admin.developers
for insert
to authenticated
with check (false);

drop policy if exists developers_update_none on admin.developers;
create policy developers_update_none
on admin.developers
for update
to authenticated
using (false)
with check (false);

drop policy if exists developers_delete_none on admin.developers;
create policy developers_delete_none
on admin.developers
for delete
to authenticated
using (false);

create or replace function admin.is_developer(p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_exists boolean := false;
begin
  if developer.column_exists('admin','developers','clerk_user_id') then
    execute $q$
      select exists (
        select 1
        from admin.developers d
        where d.clerk_user_id = core.current_user_id()
          and d.is_active = true
      )
    $q$ into v_exists;
    return coalesce(v_exists, false);
  end if;

  execute $q$
    select exists (
      select 1
      from admin.developers d
      where d.user_id = $1
        and d.is_active = true
    )
  $q$ into v_exists using p_user_id;

  return coalesce(v_exists, false);
end;
$$;

-- Zero-arg helper to avoid overload ambiguity in policies.
create or replace function admin.is_developer()
returns boolean
language sql
stable
security definer
set search_path = public, admin, developer
as $$
  select admin.is_developer(auth.uid());
$$;

create or replace function developer.assert_developer()
returns void
language plpgsql
security definer
set search_path = public, admin, developer
as $$
begin
  if not admin.is_developer(auth.uid()) then
    raise exception 'Developer access required';
  end if;
end;
$$;

-- =========================================================
-- 3) INTERNAL DEVELOPER TABLES
-- =========================================================

create table if not exists developer.farmvault_expenses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  amount numeric(14,2) not null default 0,
  payment_date date,
  status text not null default 'paid',
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint farmvault_expenses_status_chk check (status in ('paid', 'unpaid', 'pending', 'cancelled'))
);

create index if not exists idx_farmvault_expenses_category on developer.farmvault_expenses(category);
create index if not exists idx_farmvault_expenses_payment_date on developer.farmvault_expenses(payment_date);
create index if not exists idx_farmvault_expenses_status on developer.farmvault_expenses(status);

drop trigger if exists trg_farmvault_expenses_updated_at on developer.farmvault_expenses;
create trigger trg_farmvault_expenses_updated_at
before update on developer.farmvault_expenses
for each row
execute function developer.set_updated_at();

alter table developer.farmvault_expenses enable row level security;

drop policy if exists farmvault_expenses_dev_all on developer.farmvault_expenses;
create policy farmvault_expenses_dev_all
on developer.farmvault_expenses
for all
to authenticated
using (admin.is_developer(auth.uid()))
with check (admin.is_developer(auth.uid()));

create table if not exists developer.system_backups (
  id uuid primary key default gen_random_uuid(),
  backup_name text not null,
  backup_type text not null,
  source_system text not null default 'supabase',
  status text not null default 'pending',
  size_bytes bigint,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint system_backups_status_chk check (status in ('pending', 'running', 'success', 'failed', 'cancelled'))
);

create index if not exists idx_system_backups_created_at on developer.system_backups(created_at desc);
create index if not exists idx_system_backups_status on developer.system_backups(status);

drop trigger if exists trg_system_backups_updated_at on developer.system_backups;
create trigger trg_system_backups_updated_at
before update on developer.system_backups
for each row
execute function developer.set_updated_at();

alter table developer.system_backups enable row level security;

drop policy if exists system_backups_dev_all on developer.system_backups;
create policy system_backups_dev_all
on developer.system_backups
for all
to authenticated
using (admin.is_developer(auth.uid()))
with check (admin.is_developer(auth.uid()));

create table if not exists developer.code_red_incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  severity text not null default 'medium',
  status text not null default 'open',
  source_module text,
  company_id uuid,
  reported_by uuid,
  assigned_to uuid,
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint code_red_incidents_severity_chk check (severity in ('low', 'medium', 'high', 'critical')),
  constraint code_red_incidents_status_chk check (status in ('open', 'investigating', 'resolved', 'dismissed'))
);

create index if not exists idx_code_red_incidents_status on developer.code_red_incidents(status);
create index if not exists idx_code_red_incidents_severity on developer.code_red_incidents(severity);
create index if not exists idx_code_red_incidents_company_id on developer.code_red_incidents(company_id);
create index if not exists idx_code_red_incidents_reported_at on developer.code_red_incidents(reported_at desc);

drop trigger if exists trg_code_red_incidents_updated_at on developer.code_red_incidents;
create trigger trg_code_red_incidents_updated_at
before update on developer.code_red_incidents
for each row
execute function developer.set_updated_at();

alter table developer.code_red_incidents enable row level security;

drop policy if exists code_red_incidents_dev_all on developer.code_red_incidents;
create policy code_red_incidents_dev_all
on developer.code_red_incidents
for all
to authenticated
using (admin.is_developer(auth.uid()))
with check (admin.is_developer(auth.uid()));

create table if not exists developer.code_red_notes (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references developer.code_red_incidents(id) on delete cascade,
  note text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_code_red_notes_incident_id on developer.code_red_notes(incident_id);

alter table developer.code_red_notes enable row level security;

drop policy if exists code_red_notes_dev_all on developer.code_red_notes;
create policy code_red_notes_dev_all
on developer.code_red_notes
for all
to authenticated
using (admin.is_developer(auth.uid()))
with check (admin.is_developer(auth.uid()));

create table if not exists developer.company_records_outbox (
  id uuid primary key default gen_random_uuid(),
  target_company_id uuid not null,
  crop_name text,
  title text not null,
  content text,
  note_type text not null default 'typed',
  attachment_url text,
  attachment_name text,
  metadata jsonb not null default '{}'::jsonb,
  sent_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_records_outbox_note_type_chk check (note_type in ('typed', 'handwritten', 'image', 'mixed'))
);

create index if not exists idx_company_records_outbox_company on developer.company_records_outbox(target_company_id);
create index if not exists idx_company_records_outbox_crop on developer.company_records_outbox(crop_name);
create index if not exists idx_company_records_outbox_created_at on developer.company_records_outbox(created_at desc);

drop trigger if exists trg_company_records_outbox_updated_at on developer.company_records_outbox;
create trigger trg_company_records_outbox_updated_at
before update on developer.company_records_outbox
for each row
execute function developer.set_updated_at();

alter table developer.company_records_outbox enable row level security;

drop policy if exists company_records_outbox_dev_all on developer.company_records_outbox;
create policy company_records_outbox_dev_all
on developer.company_records_outbox
for all
to authenticated
using (admin.is_developer(auth.uid()))
with check (admin.is_developer(auth.uid()));

-- =========================================================
-- 4) OPTIONAL RECORD TABLES IF NOT PRESENT
-- =========================================================

do $$
begin
  if to_regclass('public.records') is null then
    create table public.records (
      id uuid primary key default gen_random_uuid(),
      company_id uuid not null,
      crop_name text not null,
      title text not null,
      content text,
      note_type text not null default 'typed',
      created_by uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      metadata jsonb not null default '{}'::jsonb,
      constraint records_note_type_chk check (note_type in ('typed', 'handwritten', 'image', 'mixed'))
    );

    create index idx_records_company_id on public.records(company_id);
    create index idx_records_crop_name on public.records(crop_name);
    create index idx_records_created_at on public.records(created_at desc);

    create trigger trg_records_updated_at
    before update on public.records
    for each row
    execute function developer.set_updated_at();

    alter table public.records enable row level security;
  end if;
end $$;

do $$
begin
  if to_regclass('public.record_attachments') is null then
    create table public.record_attachments (
      id uuid primary key default gen_random_uuid(),
      record_id uuid not null references public.records(id) on delete cascade,
      file_url text not null,
      file_type text,
      file_name text,
      created_at timestamptz not null default now()
    );

    create index idx_record_attachments_record_id on public.record_attachments(record_id);

    alter table public.record_attachments enable row level security;
  end if;
end $$;

-- =========================================================
-- 5) SAFE COMPANY / USER DISCOVERY HELPERS
-- =========================================================

create or replace function developer.get_companies_table()
returns text
language plpgsql
stable
as $$
begin
  if to_regclass('public.companies') is not null then
    return 'public.companies';
  end if;
  return null;
end;
$$;

create or replace function developer.get_profiles_table()
returns text
language plpgsql
stable
as $$
begin
  if to_regclass('public.profiles') is not null then
    return 'public.profiles';
  end if;
  if to_regclass('public.users') is not null then
    return 'public.users';
  end if;
  return null;
end;
$$;

create or replace function developer.get_company_members_table()
returns text
language plpgsql
stable
as $$
begin
  if to_regclass('public.company_members') is not null then
    return 'public.company_members';
  end if;
  if to_regclass('public.memberships') is not null then
    return 'public.memberships';
  end if;
  return null;
end;
$$;

create or replace function developer.get_company_subscriptions_table()
returns text
language plpgsql
stable
as $$
begin
  if to_regclass('public.company_subscriptions') is not null then
    return 'public.company_subscriptions';
  end if;
  if to_regclass('billing.company_subscriptions') is not null then
    return 'billing.company_subscriptions';
  end if;
  return null;
end;
$$;

-- =========================================================
-- 6) DEVELOPER DASHBOARD OVERVIEW
-- =========================================================

create or replace function developer.get_dashboard_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_total_companies bigint := 0;
  v_total_users bigint := 0;
  v_active_subscriptions bigint := 0;
  v_pending_billing_confirmations bigint := 0;
  v_open_code_red bigint := 0;
  v_feedback_count bigint := 0;
  v_total_farmvault_expenses numeric := 0;
  v_latest_backup jsonb := '{}'::jsonb;
  v_total_farm_revenue numeric := 0;
  v_total_farm_expenses numeric := 0;
  v_recent_activity jsonb := '[]'::jsonb;
  v_season_challenges_summary jsonb := '{}'::jsonb;
  v_crop_monitoring_summary jsonb := '{}'::jsonb;
  v_companies_table text;
  v_profiles_table text;
  v_subs_table text;
begin
  perform developer.assert_developer();

  v_companies_table := developer.get_companies_table();
  v_profiles_table := developer.get_profiles_table();
  v_subs_table := developer.get_company_subscriptions_table();

  if v_companies_table is not null then
    execute format('select count(*) from %s', v_companies_table) into v_total_companies;
  end if;

  if v_profiles_table is not null then
    execute format('select count(*) from %s', v_profiles_table) into v_total_users;
  end if;

  if v_subs_table is not null then
    execute format($sql$
      select count(*)
      from %s
      where status in ('active', 'trialing')
    $sql$, v_subs_table) into v_active_subscriptions;
  end if;

  if to_regclass('public.billing_confirmations') is not null then
    execute $sql$
      select count(*)
      from public.billing_confirmations
      where lower(coalesce(status, 'pending')) in ('pending', 'submitted', 'review')
    $sql$ into v_pending_billing_confirmations;
  end if;

  select count(*)
  into v_open_code_red
  from developer.code_red_incidents
  where status in ('open', 'investigating');

  if to_regclass('public.feedback') is not null then
    execute $sql$
      select count(*)
      from public.feedback
    $sql$ into v_feedback_count;
  elsif to_regclass('public.support_tickets') is not null then
    execute $sql$
      select count(*)
      from public.support_tickets
    $sql$ into v_feedback_count;
  end if;

  select coalesce(sum(amount), 0)
  into v_total_farmvault_expenses
  from developer.farmvault_expenses;

  select coalesce(
    (
      select jsonb_build_object(
        'id', b.id,
        'backup_name', b.backup_name,
        'backup_type', b.backup_type,
        'status', b.status,
        'created_at', b.created_at,
        'completed_at', b.completed_at,
        'size_bytes', b.size_bytes
      )
      from developer.system_backups b
      order by b.created_at desc
      limit 1
    ),
    '{}'::jsonb
  )
  into v_latest_backup;

  if to_regclass('public.harvests') is not null then
    if developer.column_exists('public', 'harvests', 'revenue') then
      execute 'select coalesce(sum(revenue), 0) from public.harvests' into v_total_farm_revenue;
    elsif developer.column_exists('public', 'harvests', 'total_revenue') then
      execute 'select coalesce(sum(total_revenue), 0) from public.harvests' into v_total_farm_revenue;
    end if;
  end if;

  if to_regclass('public.expenses') is not null then
    if developer.column_exists('public', 'expenses', 'amount') then
      execute 'select coalesce(sum(amount), 0) from public.expenses' into v_total_farm_expenses;
    elsif developer.column_exists('public', 'expenses', 'total_amount') then
      execute 'select coalesce(sum(total_amount), 0) from public.expenses' into v_total_farm_expenses;
    end if;
  end if;

  v_recent_activity := developer.get_recent_platform_activity(20);
  v_season_challenges_summary := developer.get_season_challenges_intelligence(null, null, null, null);
  v_crop_monitoring_summary := developer.get_crop_monitoring_intelligence(null, null, null, null);

  return jsonb_build_object(
    'platform_kpis', jsonb_build_object(
      'total_companies', coalesce(v_total_companies, 0),
      'total_users', coalesce(v_total_users, 0),
      'active_subscriptions', coalesce(v_active_subscriptions, 0),
      'pending_billing_confirmations', coalesce(v_pending_billing_confirmations, 0),
      'open_code_red', coalesce(v_open_code_red, 0),
      'feedback_count', coalesce(v_feedback_count, 0),
      'farmvault_internal_expenses', coalesce(v_total_farmvault_expenses, 0),
      'latest_backup', coalesce(v_latest_backup, '{}'::jsonb)
    ),
    'farm_metrics', jsonb_build_object(
      'total_revenue', coalesce(v_total_farm_revenue, 0),
      'total_expenses', coalesce(v_total_farm_expenses, 0),
      'profit_loss', coalesce(v_total_farm_revenue, 0) - coalesce(v_total_farm_expenses, 0)
    ),
    'recent_activity', coalesce(v_recent_activity, '[]'::jsonb),
    'season_challenges_summary', coalesce(v_season_challenges_summary, '{}'::jsonb),
    'crop_monitoring_summary', coalesce(v_crop_monitoring_summary, '{}'::jsonb)
  );
end;
$$;

-- =========================================================
-- 7) COMPANIES LIST / OVERVIEW
-- =========================================================

create or replace function developer.list_companies(
  p_search text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_companies_table text;
  v_subs_table text;
  v_sql text;
  v_rows jsonb := '[]'::jsonb;
begin
  perform developer.assert_developer();

  v_companies_table := developer.get_companies_table();
  v_subs_table := developer.get_company_subscriptions_table();

  if v_companies_table is null then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0);
  end if;

  v_sql := format($sql$
    with base as (
      select
        c.id,
        coalesce(c.name, c.company_name, 'Unnamed Company') as company_name,
        c.created_at
      from %s c
      where (
        %L is null
        or coalesce(c.name, c.company_name, '') ilike '%%' || %L || '%%'
      )
      order by c.created_at desc nulls last
      limit %s
      offset %s
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', b.id,
        'company_name', b.company_name,
        'created_at', b.created_at,
        'users_count', (
          case
            when to_regclass('public.company_members') is not null then
              (select count(*) from public.company_members m where m.company_id = b.id)
            when to_regclass('public.memberships') is not null then
              (select count(*) from public.memberships m where m.company_id = b.id)
            else 0
          end
        ),
        'subscription', (
          case
            when %L is not null then
              (
                select jsonb_build_object(
                  'plan_code', s.plan_id,
                  'status', s.status,
                  'current_period_end', s.current_period_end,
                  'trial_ends_at', s.trial_ends_at
                )
                from %s s
                where s.company_id = b.id
                order by s.current_period_end desc nulls last
                limit 1
              )
            else null
          end
        ),
        'expenses_total', (
          case
            when to_regclass('public.expenses') is not null and exists (
              select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'expenses' and column_name = 'amount'
            ) then
              (select coalesce(sum(e.amount),0) from public.expenses e where e.company_id = b.id)
            else 0
          end
        ),
        'harvest_revenue_total', (
          case
            when to_regclass('public.harvests') is not null and exists (
              select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'harvests' and column_name in ('revenue', 'total_revenue')
            ) then
              coalesce(
                (select coalesce(sum(h.revenue),0) from public.harvests h where h.company_id = b.id),
                (select coalesce(sum(h.total_revenue),0) from public.harvests h where h.company_id = b.id),
                0
              )
            else 0
          end
        ),
        'season_challenges_count', (
          case
            when to_regclass('public.season_challenges') is not null then
              (select count(*) from public.season_challenges sc where sc.company_id = b.id)
            else 0
          end
        ),
        'records_count', (
          case
            when to_regclass('public.records') is not null then
              (select count(*) from public.records r where r.company_id = b.id)
            else 0
          end
        )
      )
    ), '[]'::jsonb)
    from base b
  $sql$, v_companies_table, p_search, p_search, p_limit, p_offset, v_subs_table, coalesce(v_subs_table, 'public.company_subscriptions'));

  execute v_sql into v_rows;

  return jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total', (
      case
        when p_search is null then
          (select count(*) from public.companies)
        else
          (select count(*) from public.companies c where coalesce(c.name, c.company_name, '') ilike '%' || p_search || '%')
      end
    )
  );
exception
  when undefined_table then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0);
end;
$$;

create or replace function developer.get_company_overview(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_company jsonb := '{}'::jsonb;
  v_subscription jsonb := '{}'::jsonb;
  v_recent_activity jsonb := '[]'::jsonb;
begin
  perform developer.assert_developer();

  if to_regclass('public.companies') is not null then
    execute $sql$
      select jsonb_build_object(
        'id', c.id,
        'company_name', coalesce(c.name, c.company_name, 'Unnamed Company'),
        'created_at', c.created_at
      )
      from public.companies c
      where c.id = $1
    $sql$ into v_company using p_company_id;
  end if;

  if to_regclass('public.company_subscriptions') is not null then
    execute $sql$
      select coalesce(
        (
          select jsonb_build_object(
            'company_id', s.company_id,
            'plan_id', s.plan_id,
            'status', s.status,
            'current_period_start', s.current_period_start,
            'current_period_end', s.current_period_end,
            'trial_started_at', s.trial_started_at,
            'trial_ends_at', s.trial_ends_at
          )
          from public.company_subscriptions s
          where s.company_id = $1
          order by s.current_period_end desc nulls last
          limit 1
        ),
        '{}'::jsonb
      )
    $sql$ into v_subscription using p_company_id;
  end if;

  v_recent_activity := developer.get_recent_platform_activity(20, p_company_id);

  return jsonb_build_object(
    'company', coalesce(v_company, '{}'::jsonb),
    'subscription', coalesce(v_subscription, '{}'::jsonb),
    'users_count', (
      case
        when to_regclass('public.company_members') is not null then
          (select count(*) from public.company_members m where m.company_id = p_company_id)
        when to_regclass('public.memberships') is not null then
          (select count(*) from public.memberships m where m.company_id = p_company_id)
        else 0
      end
    ),
    'expenses_total', (
      case
        when to_regclass('public.expenses') is not null and developer.column_exists('public','expenses','amount') then
          (select coalesce(sum(amount),0) from public.expenses where company_id = p_company_id)
        else 0
      end
    ),
    'harvest_total_revenue', (
      case
        when to_regclass('public.harvests') is not null and developer.column_exists('public','harvests','revenue') then
          (select coalesce(sum(revenue),0) from public.harvests where company_id = p_company_id)
        when to_regclass('public.harvests') is not null and developer.column_exists('public','harvests','total_revenue') then
          (select coalesce(sum(total_revenue),0) from public.harvests where company_id = p_company_id)
        else 0
      end
    ),
    'projects_count', (
      case
        when to_regclass('public.projects') is not null then
          (select count(*) from public.projects where company_id = p_company_id)
        else 0
      end
    ),
    'season_challenges_count', (
      case
        when to_regclass('public.season_challenges') is not null then
          (select count(*) from public.season_challenges where company_id = p_company_id)
        else 0
      end
    ),
    'records_count', (
      case
        when to_regclass('public.records') is not null then
          (select count(*) from public.records where company_id = p_company_id)
        else 0
      end
    ),
    'recent_activity', coalesce(v_recent_activity, '[]'::jsonb)
  );
end;
$$;

-- =========================================================
-- 8) USERS LIST
-- =========================================================

create or replace function developer.list_users(
  p_search text default null,
  p_company_id uuid default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_rows jsonb := '[]'::jsonb;
begin
  perform developer.assert_developer();

  if to_regclass('public.profiles') is null then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0);
  end if;

  execute $sql$
    with base as (
      select
        p.clerk_user_id,
        coalesce(p.full_name, 'Unnamed User') as full_name,
        p.email,
        p.created_at,
        p.updated_at
      from public.profiles p
      where (
        $1 is null
        or coalesce(p.full_name, '') ilike '%' || $1 || '%'
        or coalesce(p.email, '') ilike '%' || $1 || '%'
      )
      order by p.created_at desc nulls last
      limit $2
      offset $3
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', b.clerk_user_id,
        'full_name', b.full_name,
        'email', b.email,
        'created_at', b.created_at,
        'last_seen', b.updated_at,
        'developer', admin.is_developer(b.clerk_user_id),
        'company', (
          case
            when to_regclass('public.company_members') is not null then
              (
                select jsonb_build_object(
                  'company_id', m.company_id,
                  'role', m.role,
                  'company_name', c.name
                )
                from public.company_members m
                left join public.companies c on c.id = m.company_id
                where m.clerk_user_id = b.clerk_user_id
                  and ($4 is null or m.company_id = $4)
                limit 1
              )
            when to_regclass('public.memberships') is not null then
              (
                select jsonb_build_object(
                  'company_id', m.company_id,
                  'role', m.role,
                  'company_name', c.name
                )
                from public.memberships m
                left join public.companies c on c.id = m.company_id
                where m.clerk_user_id = b.clerk_user_id
                  and ($4 is null or m.company_id = $4)
                limit 1
              )
            else null
          end
        )
      )
    ), '[]'::jsonb)
    from base b
  $sql$
  into v_rows
  using p_search, p_limit, p_offset, p_company_id;

  return jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total', (select count(*) from public.profiles)
  );
end;
$$;

-- =========================================================
-- 9) BILLING CONFIRMATIONS
-- =========================================================

create or replace function developer.list_billing_confirmations(
  p_status text default null,
  p_company_id uuid default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_rows jsonb := '[]'::jsonb;
begin
  perform developer.assert_developer();

  if to_regclass('public.billing_confirmations') is null then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0);
  end if;

  execute $sql$
    with base as (
      select
        bc.*
      from public.billing_confirmations bc
      where ($1 is null or lower(coalesce(bc.status, '')) = lower($1))
        and ($2 is null or bc.company_id = $2)
      order by bc.created_at desc nulls last
      limit $3
      offset $4
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', b.id,
        'company_id', b.company_id,
        'company_name', (
          case
            when to_regclass('public.companies') is not null then
              (select coalesce(c.name, c.company_name, 'Unnamed Company') from public.companies c where c.id = b.company_id)
            else null
          end
        ),
        'submitted_by', b.submitted_by,
        'amount', b.amount,
        'transaction_code', coalesce(b.transaction_code, b.payment_reference, b.mpesa_code),
        'plan', coalesce(b.plan_id, b.plan_code, b.plan),
        'status', b.status,
        'review_note', coalesce(b.review_note, b.reviewer_note),
        'reviewed_by', b.reviewed_by,
        'reviewed_at', b.reviewed_at,
        'created_at', b.created_at
      )
    ), '[]'::jsonb)
    from base b
  $sql$
  into v_rows
  using p_status, p_company_id, p_limit, p_offset;

  return jsonb_build_object(
    'rows', v_rows,
    'total', (
      select count(*)
      from public.billing_confirmations bc
      where (p_status is null or lower(coalesce(bc.status, '')) = lower(p_status))
        and (p_company_id is null or bc.company_id = p_company_id)
    )
  );
end;
$$;

create or replace function developer.approve_billing_confirmation(p_confirmation_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, admin, developer
as $$
declare
  v_row jsonb;
begin
  perform developer.assert_developer();

  if to_regclass('public.billing_confirmations') is null then
    raise exception 'public.billing_confirmations table not found';
  end if;

  update public.billing_confirmations
  set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = p_note
  where id = p_confirmation_id
    and lower(coalesce(status, 'pending')) not in ('approved');

  select jsonb_build_object(
    'success', true,
    'id', id,
    'status', status,
    'reviewed_by', reviewed_by,
    'reviewed_at', reviewed_at,
    'review_note', review_note
  )
  into v_row
  from public.billing_confirmations
  where id = p_confirmation_id;

  return coalesce(v_row, jsonb_build_object('success', false));
end;
$$;

create or replace function developer.reject_billing_confirmation(p_confirmation_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, admin, developer
as $$
declare
  v_row jsonb;
begin
  perform developer.assert_developer();

  if to_regclass('public.billing_confirmations') is null then
    raise exception 'public.billing_confirmations table not found';
  end if;

  update public.billing_confirmations
  set
    status = 'rejected',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = p_note
  where id = p_confirmation_id
    and lower(coalesce(status, 'pending')) not in ('rejected');

  select jsonb_build_object(
    'success', true,
    'id', id,
    'status', status,
    'reviewed_by', reviewed_by,
    'reviewed_at', reviewed_at,
    'review_note', review_note
  )
  into v_row
  from public.billing_confirmations
  where id = p_confirmation_id;

  return coalesce(v_row, jsonb_build_object('success', false));
end;
$$;

create or replace function developer.mark_billing_confirmation_reviewed(p_confirmation_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, admin, developer
as $$
declare
  v_row jsonb;
begin
  perform developer.assert_developer();

  if to_regclass('public.billing_confirmations') is null then
    raise exception 'public.billing_confirmations table not found';
  end if;

  update public.billing_confirmations
  set
    status = 'reviewed',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = p_note
  where id = p_confirmation_id
    and lower(coalesce(status, 'pending')) not in ('approved', 'rejected');

  select jsonb_build_object(
    'success', true,
    'id', id,
    'status', status,
    'reviewed_by', reviewed_by,
    'reviewed_at', reviewed_at,
    'review_note', review_note
  )
  into v_row
  from public.billing_confirmations
  where id = p_confirmation_id;

  return coalesce(v_row, jsonb_build_object('success', false));
end;
$$;

-- =========================================================
-- 10) FINANCES / SUBSCRIPTION ANALYTICS
-- =========================================================

create or replace function developer.get_finances_overview(
  p_date_from date default null,
  p_date_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_confirmed numeric := 0;
  v_pending numeric := 0;
  v_rejected numeric := 0;
  v_internal_expenses numeric := 0;
begin
  perform developer.assert_developer();

  if to_regclass('public.billing_confirmations') is not null then
    execute $sql$
      select coalesce(sum(amount),0)
      from public.billing_confirmations
      where lower(coalesce(status,'')) = 'approved'
        and ($1 is null or created_at::date >= $1)
        and ($2 is null or created_at::date <= $2)
    $sql$ into v_confirmed using p_date_from, p_date_to;

    execute $sql$
      select coalesce(sum(amount),0)
      from public.billing_confirmations
      where lower(coalesce(status,'')) in ('pending', 'submitted', 'review', 'reviewed')
        and ($1 is null or created_at::date >= $1)
        and ($2 is null or created_at::date <= $2)
    $sql$ into v_pending using p_date_from, p_date_to;

    execute $sql$
      select coalesce(sum(amount),0)
      from public.billing_confirmations
      where lower(coalesce(status,'')) = 'rejected'
        and ($1 is null or created_at::date >= $1)
        and ($2 is null or created_at::date <= $2)
    $sql$ into v_rejected using p_date_from, p_date_to;
  end if;

  select coalesce(sum(amount),0)
  into v_internal_expenses
  from developer.farmvault_expenses
  where (p_date_from is null or payment_date >= p_date_from)
    and (p_date_to is null or payment_date <= p_date_to);

  return jsonb_build_object(
    'confirmed_revenue', v_confirmed,
    'pending_confirmations_total', v_pending,
    'rejected_total', v_rejected,
    'farmvault_internal_expenses', v_internal_expenses,
    'net_platform_cashflow', v_confirmed - v_internal_expenses
  );
end;
$$;

create or replace function developer.get_subscription_analytics(
  p_date_from date default null,
  p_date_to date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_active bigint := 0;
  v_trialing bigint := 0;
  v_expired bigint := 0;
  v_total bigint := 0;
  v_plan_distribution jsonb := '[]'::jsonb;
begin
  perform developer.assert_developer();

  if to_regclass('public.company_subscriptions') is null and to_regclass('billing.company_subscriptions') is null then
    return jsonb_build_object(
      'total_subscriptions', 0,
      'active_subscriptions', 0,
      'trialing_subscriptions', 0,
      'expired_subscriptions', 0,
      'plan_distribution', '[]'::jsonb
    );
  end if;

  if to_regclass('public.company_subscriptions') is not null then
    execute $sql$
      select count(*) from public.company_subscriptions
      where ($1 is null or coalesce(current_period_start::date, created_at::date) >= $1)
        and ($2 is null or coalesce(current_period_start::date, created_at::date) <= $2)
    $sql$ into v_total using p_date_from, p_date_to;

    execute $sql$
      select count(*) from public.company_subscriptions where status = 'active'
    $sql$ into v_active;

    execute $sql$
      select count(*) from public.company_subscriptions where status = 'trialing'
    $sql$ into v_trialing;

    execute $sql$
      select count(*) from public.company_subscriptions where status in ('expired', 'cancelled', 'canceled')
    $sql$ into v_expired;

    execute $sql$
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'plan_id', plan_id,
          'count', cnt
        )
      ), '[]'::jsonb)
      from (
        select plan_id, count(*) as cnt
        from public.company_subscriptions
        group by plan_id
        order by count(*) desc
      ) q
    $sql$ into v_plan_distribution;
  else
    execute $sql$
      select count(*) from billing.company_subscriptions
    $sql$ into v_total;

    execute $sql$
      select count(*) from billing.company_subscriptions where status = 'active'
    $sql$ into v_active;

    execute $sql$
      select count(*) from billing.company_subscriptions where status = 'trialing'
    $sql$ into v_trialing;

    execute $sql$
      select count(*) from billing.company_subscriptions where status in ('expired', 'cancelled', 'canceled')
    $sql$ into v_expired;

    execute $sql$
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'plan_id', plan_code,
          'count', cnt
        )
      ), '[]'::jsonb)
      from (
        select plan_code, count(*) as cnt
        from billing.company_subscriptions
        group by plan_code
        order by count(*) desc
      ) q
    $sql$ into v_plan_distribution;
  end if;

  return jsonb_build_object(
    'total_subscriptions', v_total,
    'active_subscriptions', v_active,
    'trialing_subscriptions', v_trialing,
    'expired_subscriptions', v_expired,
    'plan_distribution', v_plan_distribution
  );
end;
$$;

-- =========================================================
-- 11) FARMVAULT EXPENSES RPCs
-- =========================================================

create or replace function developer.list_farmvault_expenses(
  p_category text default null,
  p_status text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public, admin, developer
as $$
  select jsonb_build_object(
    'rows',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', e.id,
            'title', e.title,
            'category', e.category,
            'amount', e.amount,
            'payment_date', e.payment_date,
            'status', e.status,
            'notes', e.notes,
            'created_by', e.created_by,
            'created_at', e.created_at,
            'updated_at', e.updated_at
          )
        )
        from (
          select *
          from developer.farmvault_expenses
          where admin.is_developer(auth.uid())
            and (p_category is null or category = p_category)
            and (p_status is null or status = p_status)
          order by payment_date desc nulls last, created_at desc
          limit p_limit offset p_offset
        ) e
      ),
      '[]'::jsonb
    ),
    'total',
    (
      select count(*)
      from developer.farmvault_expenses
      where admin.is_developer(auth.uid())
        and (p_category is null or category = p_category)
        and (p_status is null or status = p_status)
    )
  );
$$;

create or replace function developer.create_farmvault_expense(
  p_title text,
  p_category text,
  p_amount numeric,
  p_payment_date date default null,
  p_status text default 'paid',
  p_notes text default null
)
returns developer.farmvault_expenses
language plpgsql
security definer
set search_path = public, admin, developer
as $$
declare
  v_row developer.farmvault_expenses;
begin
  perform developer.assert_developer();

  insert into developer.farmvault_expenses (
    title, category, amount, payment_date, status, notes, created_by
  )
  values (
    p_title, p_category, p_amount, p_payment_date, p_status, p_notes, auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function developer.update_farmvault_expense(
  p_id uuid,
  p_title text default null,
  p_category text default null,
  p_amount numeric default null,
  p_payment_date date default null,
  p_status text default null,
  p_notes text default null
)
returns developer.farmvault_expenses
language plpgsql
security definer
set search_path = public, admin, developer
as $$
declare
  v_row developer.farmvault_expenses;
begin
  perform developer.assert_developer();

  update developer.farmvault_expenses
  set
    title = coalesce(p_title, title),
    category = coalesce(p_category, category),
    amount = coalesce(p_amount, amount),
    payment_date = coalesce(p_payment_date, payment_date),
    status = coalesce(p_status, status),
    notes = coalesce(p_notes, notes)
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function developer.delete_farmvault_expense(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, admin, developer
as $$
begin
  perform developer.assert_developer();
  delete from developer.farmvault_expenses where id = p_id;
  return jsonb_build_object('success', true, 'id', p_id);
end;
$$;

-- =========================================================
-- 12) BACKUPS RPCs
-- =========================================================

create or replace function developer.get_backup_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_latest jsonb := '{}'::jsonb;
  v_last_success jsonb := '{}'::jsonb;
  v_failed_count bigint := 0;
begin
  perform developer.assert_developer();

  select coalesce(
    (
      select jsonb_build_object(
        'id', b.id,
        'backup_name', b.backup_name,
        'backup_type', b.backup_type,
        'status', b.status,
        'created_at', b.created_at,
        'completed_at', b.completed_at,
        'size_bytes', b.size_bytes
      )
      from developer.system_backups b
      order by b.created_at desc
      limit 1
    ),
    '{}'::jsonb
  )
  into v_latest;

  select coalesce(
    (
      select jsonb_build_object(
        'id', b.id,
        'backup_name', b.backup_name,
        'backup_type', b.backup_type,
        'status', b.status,
        'created_at', b.created_at,
        'completed_at', b.completed_at,
        'size_bytes', b.size_bytes
      )
      from developer.system_backups b
      where b.status = 'success'
      order by b.created_at desc
      limit 1
    ),
    '{}'::jsonb
  )
  into v_last_success;

  select count(*)
  into v_failed_count
  from developer.system_backups
  where status = 'failed';

  return jsonb_build_object(
    'latest_backup', v_latest,
    'last_successful_backup', v_last_success,
    'failed_backup_count', v_failed_count,
    'stale_warning', (
      case
        when (v_last_success ->> 'created_at') is null then true
        when ((v_last_success ->> 'created_at')::timestamptz < now() - interval '3 days') then true
        else false
      end
    )
  );
end;
$$;

create or replace function developer.list_backups(
  p_status text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public, admin, developer
as $$
  select jsonb_build_object(
    'rows',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', b.id,
            'backup_name', b.backup_name,
            'backup_type', b.backup_type,
            'source_system', b.source_system,
            'status', b.status,
            'size_bytes', b.size_bytes,
            'created_at', b.created_at,
            'completed_at', b.completed_at,
            'notes', b.notes,
            'metadata', b.metadata
          )
        )
        from (
          select *
          from developer.system_backups
          where admin.is_developer(auth.uid())
            and (p_status is null or status = p_status)
          order by created_at desc
          limit p_limit offset p_offset
        ) b
      ),
      '[]'::jsonb
    ),
    'total',
    (
      select count(*)
      from developer.system_backups
      where admin.is_developer(auth.uid())
        and (p_status is null or status = p_status)
    )
  );
$$;

-- =========================================================
-- 13) CODE RED RPCs
-- =========================================================

create or replace function developer.list_code_red_incidents(
  p_status text default null,
  p_severity text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public, admin, developer
as $$
  select jsonb_build_object(
    'rows',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'title', i.title,
            'summary', i.summary,
            'severity', i.severity,
            'status', i.status,
            'source_module', i.source_module,
            'company_id', i.company_id,
            'reported_by', i.reported_by,
            'assigned_to', i.assigned_to,
            'reported_at', i.reported_at,
            'resolved_at', i.resolved_at,
            'metadata', i.metadata,
            'created_at', i.created_at,
            'updated_at', i.updated_at
          )
        )
        from (
          select *
          from developer.code_red_incidents
          where admin.is_developer(auth.uid())
            and (p_status is null or status = p_status)
            and (p_severity is null or severity = p_severity)
          order by reported_at desc
          limit p_limit offset p_offset
        ) i
      ),
      '[]'::jsonb
    ),
    'total',
    (
      select count(*)
      from developer.code_red_incidents
      where admin.is_developer(auth.uid())
        and (p_status is null or status = p_status)
        and (p_severity is null or severity = p_severity)
    )
  );
$$;

create or replace function developer.create_code_red_incident(
  p_title text,
  p_summary text default null,
  p_severity text default 'medium',
  p_source_module text default null,
  p_company_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns developer.code_red_incidents
language plpgsql
security definer
set search_path = public, admin, developer
as $$
declare
  v_row developer.code_red_incidents;
begin
  perform developer.assert_developer();

  insert into developer.code_red_incidents (
    title, summary, severity, source_module, company_id, reported_by, metadata
  )
  values (
    p_title, p_summary, p_severity, p_source_module, p_company_id, auth.uid(), p_metadata
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function developer.update_code_red_incident(
  p_id uuid,
  p_status text default null,
  p_severity text default null,
  p_summary text default null,
  p_assigned_to uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, admin, developer
as $$
declare
  v_row developer.code_red_incidents;
begin
  perform developer.assert_developer();

  update developer.code_red_incidents
  set
    status = coalesce(p_status, status),
    severity = coalesce(p_severity, severity),
    summary = coalesce(p_summary, summary),
    assigned_to = coalesce(p_assigned_to, assigned_to),
    resolved_at = case when coalesce(p_status, status) = 'resolved' then now() else resolved_at end
  where id = p_id
  returning * into v_row;

  if p_note is not null then
    insert into developer.code_red_notes (incident_id, note, created_by)
    values (p_id, p_note, auth.uid());
  end if;

  return jsonb_build_object(
    'success', true,
    'incident', to_jsonb(v_row)
  );
end;
$$;

-- =========================================================
-- 14) FEEDBACK INBOX
-- =========================================================

create or replace function developer.list_feedback_inbox(
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_rows jsonb := '[]'::jsonb;
begin
  perform developer.assert_developer();

  if to_regclass('public.feedback') is not null then
    execute $sql$
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'company_id', f.company_id,
          'subject', coalesce(f.subject, f.title, 'No Subject'),
          'category', coalesce(f.category, f.type, 'general'),
          'message', coalesce(f.message, f.content, ''),
          'status', coalesce(f.status, 'unread'),
          'created_at', f.created_at,
          'user_id', f.created_by
        )
      ), '[]'::jsonb)
      from (
        select *
        from public.feedback
        order by created_at desc
        limit $1 offset $2
      ) f
    $sql$ into v_rows using p_limit, p_offset;
  elsif to_regclass('public.support_tickets') is not null then
    execute $sql$
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'company_id', f.company_id,
          'subject', coalesce(f.subject, f.title, 'No Subject'),
          'category', coalesce(f.category, f.type, 'general'),
          'message', coalesce(f.message, f.description, ''),
          'status', coalesce(f.status, 'unread'),
          'created_at', f.created_at,
          'user_id', f.created_by
        )
      ), '[]'::jsonb)
      from (
        select *
        from public.support_tickets
        order by created_at desc
        limit $1 offset $2
      ) f
    $sql$ into v_rows using p_limit, p_offset;
  end if;

  return jsonb_build_object('rows', v_rows);
end;
$$;

-- =========================================================
-- 15) AUDIT LOGS
-- =========================================================

create or replace function developer.list_audit_logs(
  p_limit int default 100,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_rows jsonb := '[]'::jsonb;
begin
  perform developer.assert_developer();

  if to_regclass('public.audit_logs') is not null then
    execute $sql$
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'timestamp', coalesce(a.created_at, a.timestamp),
          'actor_id', a.actor_id,
          'company_id', a.company_id,
          'action', a.action,
          'target_type', a.target_type,
          'target_id', a.target_id,
          'severity', coalesce(a.severity, 'info'),
          'module', coalesce(a.module, a.source_module),
          'metadata', coalesce(a.metadata, '{}'::jsonb)
        )
      ), '[]'::jsonb)
      from (
        select *
        from public.audit_logs
        order by coalesce(created_at, timestamp) desc
        limit $1 offset $2
      ) a
    $sql$ into v_rows using p_limit, p_offset;
  end if;

  return jsonb_build_object('rows', v_rows);
end;
$$;

-- =========================================================
-- 16) RECORDS INTELLIGENCE
-- =========================================================

create or replace function developer.get_records_overview(
  p_company_id uuid default null,
  p_crop_name text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_crop_cards jsonb := '[]'::jsonb;
  v_recent_records jsonb := '[]'::jsonb;
begin
  perform developer.assert_developer();

  if to_regclass('public.records') is null then
    return jsonb_build_object(
      'crop_cards', '[]'::jsonb,
      'recent_records', '[]'::jsonb
    );
  end if;

  execute $sql$
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'crop_name', q.crop_name,
        'record_count', q.record_count,
        'latest_record_at', q.latest_record_at,
        'company_count', q.company_count
      )
      order by q.record_count desc, q.crop_name asc
    ), '[]'::jsonb)
    from (
      select
        r.crop_name,
        count(*) as record_count,
        max(r.created_at) as latest_record_at,
        count(distinct r.company_id) as company_count
      from public.records r
      where ($1 is null or r.company_id = $1)
        and ($2 is null or lower(r.crop_name) = lower($2))
      group by r.crop_name
    ) q
  $sql$ into v_crop_cards using p_company_id, p_crop_name;

  execute $sql$
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'company_id', r.company_id,
        'crop_name', r.crop_name,
        'title', r.title,
        'note_type', r.note_type,
        'created_by', r.created_by,
        'created_at', r.created_at,
        'updated_at', r.updated_at
      )
    ), '[]'::jsonb)
    from (
      select *
      from public.records r
      where ($1 is null or r.company_id = $1)
        and ($2 is null or lower(r.crop_name) = lower($2))
      order by r.created_at desc
      limit 20
    ) r
  $sql$ into v_recent_records using p_company_id, p_crop_name;

  return jsonb_build_object(
    'crop_cards', v_crop_cards,
    'recent_records', v_recent_records
  );
end;
$$;

create or replace function developer.get_crop_records(
  p_crop_name text,
  p_company_id uuid default null,
  p_limit int default 100,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_rows jsonb := '[]'::jsonb;
begin
  perform developer.assert_developer();

  if to_regclass('public.records') is null then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0);
  end if;

  execute $sql$
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'company_id', r.company_id,
        'company_name', (
          case
            when to_regclass('public.companies') is not null then
              (select coalesce(c.name, c.company_name, 'Unnamed Company') from public.companies c where c.id = r.company_id)
            else null
          end
        ),
        'crop_name', r.crop_name,
        'title', r.title,
        'content_preview', left(coalesce(r.content, ''), 180),
        'note_type', r.note_type,
        'created_by', r.created_by,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'attachment_count', (
          case
            when to_regclass('public.record_attachments') is not null then
              (select count(*) from public.record_attachments a where a.record_id = r.id)
            else 0
          end
        )
      )
    ), '[]'::jsonb)
    from (
      select *
      from public.records
      where lower(crop_name) = lower($1)
        and ($2 is null or company_id = $2)
      order by created_at desc
      limit $3 offset $4
    ) r
  $sql$ into v_rows using p_crop_name, p_company_id, p_limit, p_offset;

  return jsonb_build_object(
    'rows', v_rows,
    'total', (
      select count(*)
      from public.records
      where lower(crop_name) = lower(p_crop_name)
        and (p_company_id is null or company_id = p_company_id)
    )
  );
end;
$$;

create or replace function developer.get_record_detail(p_record_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_record jsonb := '{}'::jsonb;
  v_attachments jsonb := '[]'::jsonb;
begin
  perform developer.assert_developer();

  if to_regclass('public.records') is null then
    return '{}'::jsonb;
  end if;

  execute $sql$
    select jsonb_build_object(
      'id', r.id,
      'company_id', r.company_id,
      'company_name', (
        case
          when to_regclass('public.companies') is not null then
            (select coalesce(c.name, c.company_name, 'Unnamed Company') from public.companies c where c.id = r.company_id)
          else null
        end
      ),
      'crop_name', r.crop_name,
      'title', r.title,
      'content', r.content,
      'note_type', r.note_type,
      'created_by', r.created_by,
      'created_at', r.created_at,
      'updated_at', r.updated_at,
      'metadata', coalesce(r.metadata, '{}'::jsonb)
    )
    from public.records r
    where r.id = $1
  $sql$ into v_record using p_record_id;

  if to_regclass('public.record_attachments') is not null then
    execute $sql$
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'file_url', a.file_url,
          'file_type', a.file_type,
          'file_name', a.file_name,
          'created_at', a.created_at
        )
      ), '[]'::jsonb)
      from public.record_attachments a
      where a.record_id = $1
    $sql$ into v_attachments using p_record_id;
  end if;

  return coalesce(v_record, '{}'::jsonb) || jsonb_build_object('attachments', v_attachments);
end;
$$;

create or replace function developer.create_record_for_company(
  p_target_company_id uuid,
  p_crop_name text,
  p_title text,
  p_content text default null,
  p_note_type text default 'typed',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, admin, developer
as $$
declare
  v_record_id uuid;
begin
  perform developer.assert_developer();

  insert into public.records (
    company_id, crop_name, title, content, note_type, created_by, metadata
  )
  values (
    p_target_company_id, p_crop_name, p_title, p_content, p_note_type, auth.uid(), p_metadata
  )
  returning id into v_record_id;

  insert into developer.company_records_outbox (
    target_company_id, crop_name, title, content, note_type, metadata, sent_by
  )
  values (
    p_target_company_id, p_crop_name, p_title, p_content, p_note_type, p_metadata, auth.uid()
  );

  return developer.get_record_detail(v_record_id);
end;
$$;

create or replace function developer.attach_record_file(
  p_record_id uuid,
  p_file_url text,
  p_file_type text default null,
  p_file_name text default null
)
returns public.record_attachments
language plpgsql
security definer
set search_path = public, admin, developer
as $$
declare
  v_row public.record_attachments;
begin
  perform developer.assert_developer();

  insert into public.record_attachments (record_id, file_url, file_type, file_name)
  values (p_record_id, p_file_url, p_file_type, p_file_name)
  returning * into v_row;

  return v_row;
end;
$$;

-- =========================================================
-- 17) SEASON CHALLENGES INTELLIGENCE
-- =========================================================

create or replace function developer.get_season_challenges_intelligence(
  p_date_from date default null,
  p_date_to date default null,
  p_crop_name text default null,
  p_company_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_total bigint := 0;
  v_by_crop jsonb := '[]'::jsonb;
  v_by_stage jsonb := '[]'::jsonb;
  v_recent jsonb := '[]'::jsonb;
begin
  perform developer.assert_developer();

  if to_regclass('public.season_challenges') is null then
    return jsonb_build_object(
      'total_challenges', 0,
      'by_crop', '[]'::jsonb,
      'by_stage', '[]'::jsonb,
      'recent', '[]'::jsonb
    );
  end if;

  execute $sql$
    select count(*)
    from public.season_challenges sc
    where ($1 is null or sc.created_at::date >= $1)
      and ($2 is null or sc.created_at::date <= $2)
      and ($3 is null or lower(coalesce(sc.crop_name, sc.crop, '')) = lower($3))
      and ($4 is null or sc.company_id = $4)
  $sql$ into v_total using p_date_from, p_date_to, p_crop_name, p_company_id;

  execute $sql$
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'crop_name', crop_name,
        'count', cnt
      )
      order by cnt desc
    ), '[]'::jsonb)
    from (
      select
        coalesce(sc.crop_name, sc.crop, 'Unknown') as crop_name,
        count(*) as cnt
      from public.season_challenges sc
      where ($1 is null or sc.created_at::date >= $1)
        and ($2 is null or sc.created_at::date <= $2)
        and ($3 is null or lower(coalesce(sc.crop_name, sc.crop, '')) = lower($3))
        and ($4 is null or sc.company_id = $4)
      group by coalesce(sc.crop_name, sc.crop, 'Unknown')
    ) q
  $sql$ into v_by_crop using p_date_from, p_date_to, p_crop_name, p_company_id;

  if developer.column_exists('public', 'season_challenges', 'crop_stage') then
    execute $sql$
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'crop_stage', crop_stage,
          'count', cnt
        )
        order by cnt desc
      ), '[]'::jsonb)
      from (
        select
          coalesce(sc.crop_stage, 'Unknown') as crop_stage,
          count(*) as cnt
        from public.season_challenges sc
        where ($1 is null or sc.created_at::date >= $1)
          and ($2 is null or sc.created_at::date <= $2)
          and ($3 is null or lower(coalesce(sc.crop_name, sc.crop, '')) = lower($3))
          and ($4 is null or sc.company_id = $4)
        group by coalesce(sc.crop_stage, 'Unknown')
      ) q
    $sql$ into v_by_stage using p_date_from, p_date_to, p_crop_name, p_company_id;
  end if;

  execute $sql$
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', sc.id,
        'company_id', sc.company_id,
        'crop_name', coalesce(sc.crop_name, sc.crop, 'Unknown'),
        'crop_stage', (
          case
            when exists (
              select 1 from information_schema.columns
              where table_schema='public' and table_name='season_challenges' and column_name='crop_stage'
            )
            then sc.crop_stage
            else null
          end
        ),
        'title', coalesce(sc.title, sc.challenge_type, sc.issue, 'Challenge'),
        'description', coalesce(sc.description, sc.notes, sc.issue_description, ''),
        'created_at', sc.created_at
      )
    ), '[]'::jsonb)
    from (
      select *
      from public.season_challenges sc
      where ($1 is null or sc.created_at::date >= $1)
        and ($2 is null or sc.created_at::date <= $2)
        and ($3 is null or lower(coalesce(sc.crop_name, sc.crop, '')) = lower($3))
        and ($4 is null or sc.company_id = $4)
      order by sc.created_at desc
      limit 20
    ) sc
  $sql$ into v_recent using p_date_from, p_date_to, p_crop_name, p_company_id;

  return jsonb_build_object(
    'total_challenges', v_total,
    'by_crop', v_by_crop,
    'by_stage', v_by_stage,
    'recent', v_recent
  );
end;
$$;

-- =========================================================
-- 18) CROP MONITORING / CROP STAGES INTELLIGENCE
-- =========================================================

create or replace function developer.get_crop_monitoring_intelligence(
  p_date_from date default null,
  p_date_to date default null,
  p_crop_name text default null,
  p_company_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_total_updates bigint := 0;
  v_by_crop jsonb := '[]'::jsonb;
  v_by_stage jsonb := '[]'::jsonb;
  v_recent jsonb := '[]'::jsonb;
begin
  perform developer.assert_developer();

  if to_regclass('public.crop_stages') is null then
    return jsonb_build_object(
      'total_updates', 0,
      'by_crop', '[]'::jsonb,
      'by_stage', '[]'::jsonb,
      'recent', '[]'::jsonb
    );
  end if;

  execute $sql$
    select count(*)
    from public.crop_stages cs
    where ($1 is null or cs.created_at::date >= $1)
      and ($2 is null or cs.created_at::date <= $2)
      and ($3 is null or lower(coalesce(cs.crop_name, cs.crop, '')) = lower($3))
      and ($4 is null or cs.company_id = $4)
  $sql$ into v_total_updates using p_date_from, p_date_to, p_crop_name, p_company_id;

  execute $sql$
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'crop_name', crop_name,
        'count', cnt
      )
      order by cnt desc
    ), '[]'::jsonb)
    from (
      select
        coalesce(cs.crop_name, cs.crop, 'Unknown') as crop_name,
        count(*) as cnt
      from public.crop_stages cs
      where ($1 is null or cs.created_at::date >= $1)
        and ($2 is null or cs.created_at::date <= $2)
        and ($3 is null or lower(coalesce(cs.crop_name, cs.crop, '')) = lower($3))
        and ($4 is null or cs.company_id = $4)
      group by coalesce(cs.crop_name, cs.crop, 'Unknown')
    ) q
  $sql$ into v_by_crop using p_date_from, p_date_to, p_crop_name, p_company_id;

  if developer.column_exists('public', 'crop_stages', 'stage_name') then
    execute $sql$
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'stage_name', stage_name,
          'count', cnt
        )
        order by cnt desc
      ), '[]'::jsonb)
      from (
        select
          coalesce(cs.stage_name, 'Unknown') as stage_name,
          count(*) as cnt
        from public.crop_stages cs
        where ($1 is null or cs.created_at::date >= $1)
          and ($2 is null or cs.created_at::date <= $2)
          and ($3 is null or lower(coalesce(cs.crop_name, cs.crop, '')) = lower($3))
          and ($4 is null or cs.company_id = $4)
        group by coalesce(cs.stage_name, 'Unknown')
      ) q
    $sql$ into v_by_stage using p_date_from, p_date_to, p_crop_name, p_company_id;
  elsif developer.column_exists('public', 'crop_stages', 'name') then
    execute $sql$
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'stage_name', stage_name,
          'count', cnt
        )
        order by cnt desc
      ), '[]'::jsonb)
      from (
        select
          coalesce(cs.name, 'Unknown') as stage_name,
          count(*) as cnt
        from public.crop_stages cs
        where ($1 is null or cs.created_at::date >= $1)
          and ($2 is null or cs.created_at::date <= $2)
          and ($3 is null or lower(coalesce(cs.crop_name, cs.crop, '')) = lower($3))
          and ($4 is null or cs.company_id = $4)
        group by coalesce(cs.name, 'Unknown')
      ) q
    $sql$ into v_by_stage using p_date_from, p_date_to, p_crop_name, p_company_id;
  end if;

  execute $sql$
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', cs.id,
        'company_id', cs.company_id,
        'crop_name', coalesce(cs.crop_name, cs.crop, 'Unknown'),
        'stage_name', (
          case
            when exists (
              select 1 from information_schema.columns
              where table_schema='public' and table_name='crop_stages' and column_name='stage_name'
            )
            then cs.stage_name
            when exists (
              select 1 from information_schema.columns
              where table_schema='public' and table_name='crop_stages' and column_name='name'
            )
            then cs.name
            else null
          end
        ),
        'created_at', cs.created_at
      )
    ), '[]'::jsonb)
    from (
      select *
      from public.crop_stages cs
      where ($1 is null or cs.created_at::date >= $1)
        and ($2 is null or cs.created_at::date <= $2)
        and ($3 is null or lower(coalesce(cs.crop_name, cs.crop, '')) = lower($3))
        and ($4 is null or cs.company_id = $4)
      order by cs.created_at desc
      limit 20
    ) cs
  $sql$ into v_recent using p_date_from, p_date_to, p_crop_name, p_company_id;

  return jsonb_build_object(
    'total_updates', v_total_updates,
    'by_crop', v_by_crop,
    'by_stage', v_by_stage,
    'recent', v_recent
  );
end;
$$;

-- =========================================================
-- 19) RECENT PLATFORM ACTIVITY
-- =========================================================

create or replace function developer.get_recent_platform_activity(
  p_limit_count int default 20,
  p_company_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, developer
as $$
declare
  v_rows jsonb := '[]'::jsonb;
  v_sql text;
begin
  perform developer.assert_developer();

  v_sql := $sql$
    with activity as (
      $EXPENSES$
      union all
      $HARVESTS$
      union all
      $SUPPLIERS$
      union all
      $RECORDS$
      union all
      $CHALLENGES$
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'type', a.type,
        'title', a.title,
        'company_id', a.company_id,
        'created_at', a.created_at,
        'metadata', a.metadata
      )
    ), '[]'::jsonb)
    from (
      select *
      from activity
      order by created_at desc
      limit %s
    ) a
  $sql$;

  if to_regclass('public.expenses') is not null then
    v_sql := replace(v_sql, '$EXPENSES$', format($q$
      select
        'expense'::text as type,
        coalesce(e.title, e.description, 'Expense') as title,
        e.company_id,
        e.created_at,
        jsonb_build_object('id', e.id) as metadata
      from public.expenses e
      where (%L is null or e.company_id = %L)
    $q$, p_company_id, p_company_id));
  else
    v_sql := replace(v_sql, '$EXPENSES$', 'select null::text as type, null::text as title, null::uuid as company_id, null::timestamptz as created_at, null::jsonb as metadata where false');
  end if;

  if to_regclass('public.harvests') is not null then
    v_sql := replace(v_sql, '$HARVESTS$', format($q$
      select
        'harvest'::text as type,
        coalesce(h.title, h.crop_name, h.crop, 'Harvest') as title,
        h.company_id,
        h.created_at,
        jsonb_build_object('id', h.id) as metadata
      from public.harvests h
      where (%L is null or h.company_id = %L)
    $q$, p_company_id, p_company_id));
  else
    v_sql := replace(v_sql, '$HARVESTS$', 'select null::text as type, null::text as title, null::uuid as company_id, null::timestamptz as created_at, null::jsonb as metadata where false');
  end if;

  if to_regclass('public.suppliers') is not null then
    v_sql := replace(v_sql, '$SUPPLIERS$', format($q$
      select
        'supplier'::text as type,
        coalesce(s.name, s.company_name, 'Supplier') as title,
        s.company_id,
        s.created_at,
        jsonb_build_object('id', s.id) as metadata
      from public.suppliers s
      where (%L is null or s.company_id = %L)
    $q$, p_company_id, p_company_id));
  else
    v_sql := replace(v_sql, '$SUPPLIERS$', 'select null::text as type, null::text as title, null::uuid as company_id, null::timestamptz as created_at, null::jsonb as metadata where false');
  end if;

  if to_regclass('public.records') is not null then
    v_sql := replace(v_sql, '$RECORDS$', format($q$
      select
        'record'::text as type,
        coalesce(r.title, 'Record') as title,
        r.company_id,
        r.created_at,
        jsonb_build_object('id', r.id, 'crop_name', r.crop_name) as metadata
      from public.records r
      where (%L is null or r.company_id = %L)
    $q$, p_company_id, p_company_id));
  else
    v_sql := replace(v_sql, '$RECORDS$', 'select null::text as type, null::text as title, null::uuid as company_id, null::timestamptz as created_at, null::jsonb as metadata where false');
  end if;

  if to_regclass('public.season_challenges') is not null then
    v_sql := replace(v_sql, '$CHALLENGES$', format($q$
      select
        'season_challenge'::text as type,
        coalesce(sc.title, sc.challenge_type, sc.issue, 'Season Challenge') as title,
        sc.company_id,
        sc.created_at,
        jsonb_build_object('id', sc.id, 'crop_name', coalesce(sc.crop_name, sc.crop)) as metadata
      from public.season_challenges sc
      where (%L is null or sc.company_id = %L)
    $q$, p_company_id, p_company_id));
  else
    v_sql := replace(v_sql, '$CHALLENGES$', 'select null::text as type, null::text as title, null::uuid as company_id, null::timestamptz as created_at, null::jsonb as metadata where false');
  end if;

  v_sql := format(v_sql, p_limit_count);

  execute v_sql into v_rows;

  return coalesce(v_rows, '[]'::jsonb);
exception
  when others then
    return '[]'::jsonb;
end;
$$;

-- =========================================================
-- 20) GRANTS
-- =========================================================

grant usage on schema admin to authenticated;
grant usage on schema developer to authenticated;

grant execute on function admin.is_developer(uuid) to authenticated;
grant execute on function developer.assert_developer() to authenticated;

grant execute on function developer.get_dashboard_overview() to authenticated;
grant execute on function developer.list_companies(text, int, int) to authenticated;
grant execute on function developer.get_company_overview(uuid) to authenticated;
grant execute on function developer.list_users(text, uuid, int, int) to authenticated;
grant execute on function developer.list_billing_confirmations(text, uuid, int, int) to authenticated;
grant execute on function developer.approve_billing_confirmation(uuid, text) to authenticated;
grant execute on function developer.reject_billing_confirmation(uuid, text) to authenticated;
grant execute on function developer.mark_billing_confirmation_reviewed(uuid, text) to authenticated;
grant execute on function developer.get_finances_overview(date, date) to authenticated;
grant execute on function developer.get_subscription_analytics(date, date) to authenticated;
grant execute on function developer.list_farmvault_expenses(text, text, int, int) to authenticated;
grant execute on function developer.create_farmvault_expense(text, text, numeric, date, text, text) to authenticated;
grant execute on function developer.update_farmvault_expense(uuid, text, text, numeric, date, text, text) to authenticated;
grant execute on function developer.delete_farmvault_expense(uuid) to authenticated;
grant execute on function developer.get_backup_overview() to authenticated;
grant execute on function developer.list_backups(text, int, int) to authenticated;
grant execute on function developer.list_code_red_incidents(text, text, int, int) to authenticated;
grant execute on function developer.create_code_red_incident(text, text, text, text, uuid, jsonb) to authenticated;
grant execute on function developer.update_code_red_incident(uuid, text, text, text, uuid, text) to authenticated;
grant execute on function developer.list_feedback_inbox(int, int) to authenticated;
grant execute on function developer.list_audit_logs(int, int) to authenticated;
grant execute on function developer.get_records_overview(uuid, text) to authenticated;
grant execute on function developer.get_crop_records(text, uuid, int, int) to authenticated;
grant execute on function developer.get_record_detail(uuid) to authenticated;
grant execute on function developer.create_record_for_company(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function developer.attach_record_file(uuid, text, text, text) to authenticated;
grant execute on function developer.get_season_challenges_intelligence(date, date, text, uuid) to authenticated;
grant execute on function developer.get_crop_monitoring_intelligence(date, date, text, uuid) to authenticated;
grant execute on function developer.get_recent_platform_activity(int, uuid) to authenticated;

commit;