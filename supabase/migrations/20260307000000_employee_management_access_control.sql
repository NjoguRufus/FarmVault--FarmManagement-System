begin;

-- =====================================================
-- 1) Ensure pgcrypto exists for gen_random_uuid()
-- =====================================================
create extension if not exists pgcrypto;

-- =====================================================
-- 2) Tighten employees table safely
-- =====================================================

-- Ensure permissions always has a default object
alter table public.employees
  alter column permissions set default '{}'::jsonb;

-- Ensure permission_preset always has a default
alter table public.employees
  alter column permission_preset set default 'custom';

-- Ensure created_at has default
alter table public.employees
  alter column created_at set default now();

-- Make useful defaults for status/role if missing
update public.employees
set status = 'invited'
where status is null or btrim(status) = '';

update public.employees
set permission_preset = 'custom'
where permission_preset is null or btrim(permission_preset) = '';

-- Optional role fallback
update public.employees
set role = 'viewer'
where role is null or btrim(role) = '';

-- Add status check constraint safely
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employees_status_check'
  ) then
    alter table public.employees
      add constraint employees_status_check
      check (status in ('invited', 'active', 'suspended', 'archived'));
  end if;
end $$;

-- Add permission preset check constraint safely
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employees_permission_preset_check'
  ) then
    alter table public.employees
      add constraint employees_permission_preset_check
      check (
        permission_preset in (
          'admin',
          'farm_manager',
          'supervisor',
          'weighing_clerk',
          'finance_officer',
          'inventory_officer',
          'viewer',
          'custom'
        )
      );
  end if;
end $$;

-- Useful indexes
create index if not exists idx_employees_company_id
  on public.employees(company_id);

create index if not exists idx_employees_clerk_user_id
  on public.employees(clerk_user_id);

create index if not exists idx_employees_company_clerk
  on public.employees(company_id, clerk_user_id);

create index if not exists idx_employees_company_status
  on public.employees(company_id, status);

create index if not exists idx_employees_company_role
  on public.employees(company_id, role);

create index if not exists idx_employees_company_email
  on public.employees(company_id, email);

-- Optional uniqueness to avoid duplicate employee email per company
create unique index if not exists uq_employees_company_email
  on public.employees(company_id, lower(email))
  where email is not null;

-- Optional uniqueness to avoid duplicate linked clerk user per company
create unique index if not exists uq_employees_company_clerk_user
  on public.employees(company_id, clerk_user_id)
  where clerk_user_id is not null;

-- =====================================================
-- 3) Tighten company_members table safely (skip if company_members is a view)
-- =====================================================
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'company_members' and c.relkind = 'r'
  ) then
    create index if not exists idx_company_members_company_id
      on public.company_members(company_id);
    create index if not exists idx_company_members_clerk_user_id
      on public.company_members(clerk_user_id);
    create index if not exists idx_company_members_company_clerk
      on public.company_members(company_id, clerk_user_id);
    create unique index if not exists uq_company_members_company_clerk
      on public.company_members(company_id, clerk_user_id)
      where clerk_user_id is not null;
  end if;
end $$;

-- =====================================================
-- 4) Employee project access table
-- Restricts which projects an employee can access
-- =====================================================
create table if not exists public.employee_project_access (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  company_id uuid not null,
  project_id uuid not null,
  created_at timestamptz not null default now()
);

-- Prevent duplicate assignments
create unique index if not exists uq_employee_project_access
  on public.employee_project_access(employee_id, project_id);

create index if not exists idx_employee_project_access_company
  on public.employee_project_access(company_id);

create index if not exists idx_employee_project_access_employee
  on public.employee_project_access(employee_id);

create index if not exists idx_employee_project_access_project
  on public.employee_project_access(project_id);

-- Add foreign keys only if referenced relation is a table (not a view)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'employee_project_access_employee_fk'
  )
  and exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'employees' and c.relkind = 'r'
  ) then
    alter table public.employee_project_access
      add constraint employee_project_access_employee_fk
      foreign key (employee_id)
      references public.employees(id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'employee_project_access_project_fk'
  )
  and exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'projects' and c.relkind = 'r'
  ) then
    alter table public.employee_project_access
      add constraint employee_project_access_project_fk
      foreign key (project_id)
      references public.projects(id)
      on delete cascade;
  end if;
end $$;

-- =====================================================
-- 5) Employee activity logs
-- Audit trail for employee actions and admin changes
-- =====================================================
create table if not exists public.employee_activity_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  actor_employee_id uuid null,
  target_employee_id uuid null,
  action text not null,
  module text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_employee_activity_logs_company
  on public.employee_activity_logs(company_id);

create index if not exists idx_employee_activity_logs_actor
  on public.employee_activity_logs(actor_employee_id);

create index if not exists idx_employee_activity_logs_target
  on public.employee_activity_logs(target_employee_id);

create index if not exists idx_employee_activity_logs_created
  on public.employee_activity_logs(created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'employee_activity_logs_actor_fk'
  )
  and exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'employees' and c.relkind = 'r'
  ) then
    alter table public.employee_activity_logs
      add constraint employee_activity_logs_actor_fk
      foreign key (actor_employee_id)
      references public.employees(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'employee_activity_logs_target_fk'
  )
  and exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'employees' and c.relkind = 'r'
  ) then
    alter table public.employee_activity_logs
      add constraint employee_activity_logs_target_fk
      foreign key (target_employee_id)
      references public.employees(id)
      on delete set null;
  end if;
end $$;

-- =====================================================
-- 6) Helper function:
-- Get employee record for current clerk user + company
-- =====================================================
create or replace function public.get_employee_by_clerk_and_company(
  p_clerk_user_id text,
  p_company_id uuid
)
returns table (
  id uuid,
  company_id uuid,
  clerk_user_id text,
  email text,
  full_name text,
  phone text,
  role text,
  department text,
  permission_preset text,
  permissions jsonb,
  status text,
  created_at timestamptz
)
language sql
stable
as $$
  select
    e.id,
    e.company_id,
    e.clerk_user_id,
    e.email,
    e.full_name,
    e.phone,
    e.role,
    e.department,
    e.permission_preset,
    coalesce(e.permissions, '{}'::jsonb) as permissions,
    e.status,
    e.created_at
  from public.employees e
  where e.clerk_user_id = p_clerk_user_id
    and e.company_id = p_company_id
  limit 1;
$$;

-- =====================================================
-- 7) Helper function:
-- Check if an employee has project access
-- =====================================================
create or replace function public.employee_has_project_access(
  p_employee_id uuid,
  p_project_id uuid
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.employee_project_access epa
    where epa.employee_id = p_employee_id
      and epa.project_id = p_project_id
  );
$$;

-- =====================================================
-- 8) Helper function:
-- Log employee activity
-- =====================================================
create or replace function public.log_employee_activity(
  p_company_id uuid,
  p_actor_employee_id uuid,
  p_target_employee_id uuid,
  p_action text,
  p_module text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.employee_activity_logs (
    company_id,
    actor_employee_id,
    target_employee_id,
    action,
    module,
    metadata
  )
  values (
    p_company_id,
    p_actor_employee_id,
    p_target_employee_id,
    p_action,
    p_module,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

commit;