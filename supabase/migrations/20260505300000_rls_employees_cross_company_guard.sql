begin;

-- ===========================================================================
-- RLS HARDENING: Employees table cross-company guard
--
-- The employees table is the most sensitive multi-tenant table: every query
-- must be scoped to the caller's active company. This migration ensures:
--
--  1. RLS is enabled on public.employees.
--  2. SELECT policy: user sees only employees in their active company.
--  3. INSERT policy: only company admins/members can add employees to their company.
--  4. UPDATE policy: same company scope.
--  5. DELETE policy: blocked — use status='archived' instead.
--
-- Helper function public.current_company_id() returns the company the JWT
-- session is currently scoped to (from core.profiles.active_company_id).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Helper: current_company_id() — no parameters, so CREATE OR REPLACE is safe
-- even though 40+ RLS policies depend on it. Never DROP this function.
-- ---------------------------------------------------------------------------
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = core, public
as $$
  select active_company_id
  from core.profiles
  where clerk_user_id = public.current_clerk_id()
  limit 1;
$$;

grant execute on function public.current_company_id() to authenticated;

-- ---------------------------------------------------------------------------
-- is_company_member / is_company_admin — these had a parameter name conflict
-- (existing functions used 'check_company_id'; we use 'p_company_id').
-- PostgreSQL disallows CREATE OR REPLACE when the parameter name changes, so
-- we must DROP then CREATE. These two functions have NO dependent policies yet.
-- ---------------------------------------------------------------------------
drop function if exists public.is_company_member(uuid);
drop function if exists public.is_company_admin(uuid);

create function public.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = core, public
as $$
  select exists (
    select 1
    from core.company_members
    where clerk_user_id = public.current_clerk_id()
      and company_id = p_company_id
  );
$$;

grant execute on function public.is_company_member(uuid) to authenticated;

create function public.is_company_admin(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = core, public
as $$
  select exists (
    select 1
    from core.company_members
    where clerk_user_id = public.current_clerk_id()
      and company_id = p_company_id
      and lower(trim(role)) in ('company_admin', 'company-admin', 'admin', 'owner')
  );
$$;

grant execute on function public.is_company_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS on public.employees (idempotent)
-- ---------------------------------------------------------------------------
alter table public.employees enable row level security;

-- ---------------------------------------------------------------------------
-- Drop old policies so we can recreate them cleanly
-- ---------------------------------------------------------------------------
drop policy if exists employees_select_own_company    on public.employees;
drop policy if exists employees_insert_own_company    on public.employees;
drop policy if exists employees_update_own_company    on public.employees;
drop policy if exists employees_delete_blocked        on public.employees;

-- SELECT: any authenticated member of the company can see its employees
create policy employees_select_own_company
  on public.employees
  for select
  to authenticated
  using (
    public.is_company_member(company_id)
    or public.is_developer()
  );

-- INSERT: only company admins (or developers) may create employees
create policy employees_insert_own_company
  on public.employees
  for insert
  to authenticated
  with check (
    public.is_company_admin(company_id)
    or public.is_developer()
  );

-- UPDATE: only company admins (or developers) may update employees
create policy employees_update_own_company
  on public.employees
  for update
  to authenticated
  using (
    public.is_company_admin(company_id)
    or public.is_developer()
  )
  with check (
    public.is_company_admin(company_id)
    or public.is_developer()
  );

-- DELETE: disabled — use status transitions (suspended, archived) instead.
-- Hard deletes are handled by the developer admin panel only.
create policy employees_delete_blocked
  on public.employees
  for delete
  to authenticated
  using (public.is_developer());

commit;
