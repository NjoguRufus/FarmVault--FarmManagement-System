-- Fix brokers not seeing assigned market dispatches:
-- 1) Normalize clerk_user_id + role checks for harvest.user_is_sales_broker_in_company / dispatch_broker_matches_me.
-- 2) Align fallback_market_* RLS with tomato (staff vs broker visibility on dispatches + child rows).

begin;

-- -----------------------------------------------------------------------------
-- Helpers: stable broker role detection (handles sales-broker, sales_broker, spacing)
-- -----------------------------------------------------------------------------
create or replace function harvest._employee_role_is_sales_broker(p_role text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(trim(coalesce(p_role, '')), '[-_\s]+', '', 'g')) in ('salesbroker', 'broker');
$$;

-- -----------------------------------------------------------------------------
-- 1) Broker identity helpers (trimmed Clerk id match)
-- -----------------------------------------------------------------------------
create or replace function harvest.user_is_sales_broker_in_company(p_company uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, core
as $$
  select exists (
    select 1
    from public.employees e
    where e.company_id = p_company
      and nullif(trim(e.clerk_user_id), '') is not null
      and nullif(trim(e.clerk_user_id), '') = nullif(trim(core.current_user_id()), '')
      and harvest._employee_role_is_sales_broker(e.role)
  );
$$;

create or replace function harvest.dispatch_broker_matches_me(p_dispatch_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = harvest, public, core
as $$
  select exists (
    select 1
    from harvest.tomato_market_dispatches d
    join public.employees e on e.id = d.broker_employee_id
    where d.id = p_dispatch_id
      and nullif(trim(e.clerk_user_id), '') is not null
      and nullif(trim(e.clerk_user_id), '') = nullif(trim(core.current_user_id()), '')
  );
$$;

create or replace function harvest.fallback_dispatch_broker_matches_me(p_dispatch_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = harvest, public, core
as $$
  select exists (
    select 1
    from harvest.fallback_market_dispatches d
    join public.employees e on e.id = d.broker_employee_id
    where d.id = p_dispatch_id
      and nullif(trim(e.clerk_user_id), '') is not null
      and nullif(trim(e.clerk_user_id), '') = nullif(trim(core.current_user_id()), '')
  );
$$;

-- -----------------------------------------------------------------------------
-- 2) fallback_market_dispatches — replace permissive SELECT with tomato-style split
-- -----------------------------------------------------------------------------
drop policy if exists fallback_market_dispatches_select on harvest.fallback_market_dispatches;
drop policy if exists fallback_market_dispatches_write on harvest.fallback_market_dispatches;

create policy fallback_market_dispatches_select_admin
  on harvest.fallback_market_dispatches
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and core.is_company_admin(company_id)
      and exists (
        select 1
        from harvest.fallback_harvest_sessions s
        join projects.projects p on p.id = s.project_id
        where s.id = harvest_session_id
          and p.deleted_at is null
      )
    )
  );

create policy fallback_market_dispatches_select_staff
  on harvest.fallback_market_dispatches
  for select
  using (
    core.is_company_member(company_id)
    and exists (
      select 1
      from harvest.fallback_harvest_sessions s
      join projects.projects p on p.id = s.project_id
      where s.id = harvest_session_id
        and p.deleted_at is null
    )
    and not harvest.user_is_sales_broker_in_company(company_id)
  );

create policy fallback_market_dispatches_select_broker
  on harvest.fallback_market_dispatches
  for select
  using (
    core.is_company_member(company_id)
    and harvest.user_is_sales_broker_in_company(company_id)
    and harvest.fallback_dispatch_broker_matches_me(id)
    and exists (
      select 1
      from harvest.fallback_harvest_sessions s
      join projects.projects p on p.id = s.project_id
      where s.id = harvest_session_id
        and p.deleted_at is null
    )
  );

create policy fallback_market_dispatches_insert
  on harvest.fallback_market_dispatches
  for insert
  with check (
    core.is_company_member(company_id)
    and exists (
      select 1
      from harvest.fallback_harvest_sessions s
      join projects.projects p on p.id = s.project_id
      where s.id = harvest_session_id
        and s.company_id = harvest.fallback_market_dispatches.company_id
        and p.deleted_at is null
    )
  );

create policy fallback_market_dispatches_update_admin
  on harvest.fallback_market_dispatches
  for update
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and core.is_company_admin(company_id)
    )
  )
  with check (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and core.is_company_admin(company_id)
    )
  );

create policy fallback_market_dispatches_update_broker
  on harvest.fallback_market_dispatches
  for update
  using (
    core.is_company_member(company_id)
    and harvest.user_is_sales_broker_in_company(company_id)
    and harvest.fallback_dispatch_broker_matches_me(id)
  )
  with check (
    core.is_company_member(company_id)
    and harvest.user_is_sales_broker_in_company(company_id)
    and harvest.fallback_dispatch_broker_matches_me(id)
  );

create policy fallback_market_dispatches_delete_admin
  on harvest.fallback_market_dispatches
  for delete
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and core.is_company_admin(company_id)
    )
  );

-- -----------------------------------------------------------------------------
-- 3) fallback_market_sales_entries / expense_lines — tomato-style broker scoping
-- -----------------------------------------------------------------------------
drop policy if exists fallback_market_sales_entries_select on harvest.fallback_market_sales_entries;
drop policy if exists fallback_market_sales_entries_write on harvest.fallback_market_sales_entries;

create policy fallback_market_sales_entries_select
  on harvest.fallback_market_sales_entries
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (
        core.is_company_admin(company_id)
        or not harvest.user_is_sales_broker_in_company(company_id)
        or harvest.fallback_dispatch_broker_matches_me(market_dispatch_id)
      )
    )
  );

create policy fallback_market_sales_entries_insert
  on harvest.fallback_market_sales_entries
  for insert
  with check (
    core.is_company_member(company_id)
    and (
      core.is_company_admin(company_id)
      or not harvest.user_is_sales_broker_in_company(company_id)
      or harvest.fallback_dispatch_broker_matches_me(market_dispatch_id)
    )
  );

create policy fallback_market_sales_entries_update
  on harvest.fallback_market_sales_entries
  for update
  using (
    core.is_company_member(company_id)
    and (
      core.is_company_admin(company_id)
      or not harvest.user_is_sales_broker_in_company(company_id)
      or harvest.fallback_dispatch_broker_matches_me(market_dispatch_id)
    )
  )
  with check (
    core.is_company_member(company_id)
    and (
      core.is_company_admin(company_id)
      or not harvest.user_is_sales_broker_in_company(company_id)
      or harvest.fallback_dispatch_broker_matches_me(market_dispatch_id)
    )
  );

create policy fallback_market_sales_entries_delete
  on harvest.fallback_market_sales_entries
  for delete
  using (
    core.is_company_member(company_id)
    and (
      core.is_company_admin(company_id)
      or not harvest.user_is_sales_broker_in_company(company_id)
      or harvest.fallback_dispatch_broker_matches_me(market_dispatch_id)
    )
  );

drop policy if exists fallback_market_expense_lines_select on harvest.fallback_market_expense_lines;
drop policy if exists fallback_market_expense_lines_write on harvest.fallback_market_expense_lines;

create policy fallback_market_expense_lines_select
  on harvest.fallback_market_expense_lines
  for select
  using (
    public.is_developer()
    or (
      core.is_company_member(company_id)
      and (
        core.is_company_admin(company_id)
        or not harvest.user_is_sales_broker_in_company(company_id)
        or harvest.fallback_dispatch_broker_matches_me(market_dispatch_id)
      )
    )
  );

create policy fallback_market_expense_lines_insert
  on harvest.fallback_market_expense_lines
  for insert
  with check (
    core.is_company_member(company_id)
    and (
      core.is_company_admin(company_id)
      or not harvest.user_is_sales_broker_in_company(company_id)
      or harvest.fallback_dispatch_broker_matches_me(market_dispatch_id)
    )
  );

create policy fallback_market_expense_lines_update
  on harvest.fallback_market_expense_lines
  for update
  using (
    core.is_company_member(company_id)
    and (
      core.is_company_admin(company_id)
      or not harvest.user_is_sales_broker_in_company(company_id)
      or harvest.fallback_dispatch_broker_matches_me(market_dispatch_id)
    )
  )
  with check (
    core.is_company_member(company_id)
    and (
      core.is_company_admin(company_id)
      or not harvest.user_is_sales_broker_in_company(company_id)
      or harvest.fallback_dispatch_broker_matches_me(market_dispatch_id)
    )
  );

create policy fallback_market_expense_lines_delete
  on harvest.fallback_market_expense_lines
  for delete
  using (
    core.is_company_member(company_id)
    and (
      core.is_company_admin(company_id)
      or not harvest.user_is_sales_broker_in_company(company_id)
      or harvest.fallback_dispatch_broker_matches_me(market_dispatch_id)
    )
  );

commit;
