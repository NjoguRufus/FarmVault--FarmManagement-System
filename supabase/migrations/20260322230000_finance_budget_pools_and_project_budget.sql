-- Budget pools (finance schema) + project budget / pool link on projects.projects

begin;

-- ---------------------------------------------------------------------------
-- finance.budget_pools
-- ---------------------------------------------------------------------------
create table if not exists finance.budget_pools (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references core.companies(id) on delete cascade,
  name text not null,
  total_amount numeric(14, 2) not null default 0 check (total_amount >= 0),
  remaining_amount numeric(14, 2) not null default 0 check (remaining_amount >= 0),
  created_by text not null default core.current_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_finance_budget_pools_company_created
  on finance.budget_pools (company_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'set_updated_at_finance_budget_pools'
  ) then
    create trigger set_updated_at_finance_budget_pools
      before update on finance.budget_pools
      for each row execute function core.set_updated_at();
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- projects.projects: allocated budget + optional pool
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'projects' and table_name = 'projects'
  ) then
    alter table projects.projects
      add column if not exists budget numeric(14, 2) not null default 0 check (budget >= 0);
  end if;
end$$;

-- FK column after budget_pools exists
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'projects' and table_name = 'projects'
  )
  and not exists (
    select 1 from information_schema.columns
    where table_schema = 'projects' and table_name = 'projects' and column_name = 'budget_pool_id'
  ) then
    alter table projects.projects
      add column budget_pool_id uuid null references finance.budget_pools(id) on delete set null;
  end if;
end$$;

alter table finance.budget_pools enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'finance'
      and tablename = 'budget_pools'
      and policyname = 'budget_pools_select_company_member'
  ) then
    create policy budget_pools_select_company_member
      on finance.budget_pools
      for select
      using (core.is_company_member(company_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'finance'
      and tablename = 'budget_pools'
      and policyname = 'budget_pools_insert_creator_member'
  ) then
    create policy budget_pools_insert_creator_member
      on finance.budget_pools
      for insert
      with check (
        core.is_company_member(company_id)
        and created_by = core.current_user_id()
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'finance'
      and tablename = 'budget_pools'
      and policyname = 'budget_pools_update_creator_or_admin'
  ) then
    create policy budget_pools_update_creator_or_admin
      on finance.budget_pools
      for update
      using (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      )
      with check (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'finance'
      and tablename = 'budget_pools'
      and policyname = 'budget_pools_delete_creator_or_admin'
  ) then
    create policy budget_pools_delete_creator_or_admin
      on finance.budget_pools
      for delete
      using (
        core.is_company_member(company_id)
        and (core.is_company_admin(company_id) or created_by = core.current_user_id())
      );
  end if;
end$$;

grant select, insert, update, delete on finance.budget_pools to authenticated;

commit;
