begin;

-- ===========================================================================
-- DB HARDENING: Constraints, Indexes, and NOT NULL guards
--
-- All DDL is wrapped in existence checks so this migration is safe to re-run
-- and will not fail if a table/column/constraint already exists.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. public.employees — expand status constraint to include types used in TS
--    ('draft', 'inactive', 'on-leave' were missing from the original check)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'employees_status_check'
  ) then
    alter table public.employees drop constraint employees_status_check;
  end if;

  alter table public.employees
    add constraint employees_status_check
    check (status in (
      'draft', 'invited', 'active', 'suspended', 'archived', 'inactive', 'on-leave'
    ));
end $$;

-- ---------------------------------------------------------------------------
-- 2. public.employees — company_id must always be present
-- ---------------------------------------------------------------------------
alter table public.employees
  alter column company_id set not null;

-- ---------------------------------------------------------------------------
-- 3. public.employees — email must always be present (required for invite flow)
--    Only enforced if no existing NULLs (safe for non-empty tables)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.employees where email is null limit 1) then
    alter table public.employees alter column email set not null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. public.employees — backfill full_name from email where missing
-- ---------------------------------------------------------------------------
update public.employees
set full_name = email
where (full_name is null or btrim(full_name) = '') and email is not null;

-- ---------------------------------------------------------------------------
-- 5. core.company_members — backfill empty roles and add NOT NULL guard.
--    Skipped silently if core.company_members is a view or doesn't exist.
-- ---------------------------------------------------------------------------
do $$
begin
  -- Only proceed if core.company_members is a real base table
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'core'
      and c.relname = 'company_members'
      and c.relkind = 'r'   -- 'r' = ordinary table (not view)
  ) then
    update core.company_members
    set role = 'employee'
    where role is null or btrim(role) = '';

    if not exists (
      select 1 from pg_constraint
      where conrelid = 'core.company_members'::regclass
        and conname = 'company_members_role_not_empty'
    ) then
      alter table core.company_members
        add constraint company_members_role_not_empty
        check (role is not null and btrim(role) != '');
    end if;
  end if;
exception when others then
  -- If anything fails (e.g. regclass cast), skip silently
  null;
end $$;

-- ---------------------------------------------------------------------------
-- 6. PERFORMANCE INDEXES
--    All use CREATE INDEX IF NOT EXISTS — safe to re-run.
-- ---------------------------------------------------------------------------

-- employees: list query by company + status + created_at ordering
create index if not exists idx_employees_company_status_created
  on public.employees (company_id, status, created_at desc);

-- employees: case-insensitive email lookup across a company
create index if not exists idx_employees_email_lower
  on public.employees (lower(email))
  where email is not null;

-- employees: fast count of active employees per company
create index if not exists idx_employees_company_active
  on public.employees (company_id)
  where status = 'active';

-- public.profiles indexes — only created when profiles is a real table.
-- In some deployments both public.profiles and core.profiles are views;
-- indexing a view raises 42809, so we check relkind first.
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'profiles'
      and c.relkind = 'r'
  ) then
    execute $idx$
      create index if not exists idx_pub_profiles_active_company
        on public.profiles (active_company_id)
        where active_company_id is not null
    $idx$;
    execute $idx$
      create index if not exists idx_pub_profiles_clerk_user_id
        on public.profiles (clerk_user_id)
        where clerk_user_id is not null
    $idx$;
  end if;
exception when others then
  null;
end $$;

-- core.company_members: auth bootstrap join — only if it is a real table.
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'core'
      and c.relname = 'company_members'
      and c.relkind = 'r'
  ) then
    execute $idx$
      create index if not exists idx_core_company_members_clerk_created
        on core.company_members (clerk_user_id, created_at desc)
    $idx$;
  end if;
exception when others then
  null;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Trigger guard: reject employees inserted without company_id or email.
--    Belt-and-suspenders over the NOT NULL constraints above.
-- ---------------------------------------------------------------------------
create or replace function public.employees_require_company_id()
returns trigger
language plpgsql
as $$
begin
  if new.company_id is null or btrim(new.company_id::text) = '' then
    raise exception 'employees.company_id must not be null or empty';
  end if;
  if new.email is null or btrim(new.email) = '' then
    raise exception 'employees.email must not be null or empty';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employees_require_company_id on public.employees;
create trigger trg_employees_require_company_id
  before insert or update on public.employees
  for each row execute function public.employees_require_company_id();

commit;
