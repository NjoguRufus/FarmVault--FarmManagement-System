begin;

create table if not exists projects.farms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  user_id uuid default auth.uid(),
  name text not null,
  location text not null,
  ownership_type text not null check (ownership_type in ('owned', 'leased')),
  lease_cost numeric(14, 2),
  lease_duration numeric(10, 2),
  lease_duration_type text check (lease_duration_type in ('months', 'years')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint farms_name_not_blank check (length(trim(name)) > 0),
  constraint farms_location_not_blank check (length(trim(location)) > 0),
  constraint farms_lease_fields_when_leased check (
    ownership_type <> 'leased'
    or (
      lease_cost is not null
      and lease_cost > 0
      and lease_duration is not null
      and lease_duration > 0
      and lease_duration_type is not null
    )
  )
);

create unique index if not exists idx_projects_farms_company_name_unique
  on projects.farms (company_id, lower(name));

create index if not exists idx_projects_farms_company_created
  on projects.farms (company_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'set_updated_at_projects_farms'
  ) then
    create trigger set_updated_at_projects_farms
      before update on projects.farms
      for each row execute function core.set_updated_at();
  end if;
end$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'projects' and table_name = 'projects'
  ) then
    alter table projects.projects
      add column if not exists farm_id uuid null references projects.farms(id) on delete set null;
  end if;
end$$;

alter table projects.farms enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects' and tablename = 'farms' and policyname = 'farms_select_company_member'
  ) then
    create policy farms_select_company_member
      on projects.farms
      for select
      using (core.is_company_member(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects' and tablename = 'farms' and policyname = 'farms_insert_company_member'
  ) then
    create policy farms_insert_company_member
      on projects.farms
      for insert
      with check (core.is_company_member(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects' and tablename = 'farms' and policyname = 'farms_update_company_member'
  ) then
    create policy farms_update_company_member
      on projects.farms
      for update
      using (core.is_company_member(company_id))
      with check (core.is_company_member(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'projects' and tablename = 'farms' and policyname = 'farms_delete_company_admin'
  ) then
    create policy farms_delete_company_admin
      on projects.farms
      for delete
      using (core.is_company_admin(company_id));
  end if;
end$$;

grant select, insert, update, delete on projects.farms to authenticated;

commit;
