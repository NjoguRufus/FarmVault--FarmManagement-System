-- RLS helpers for projects/harvest/finance: core.is_company_member and core.is_company_admin.
-- Required by 20260305000030_projects_harvest_finance.sql policies.
-- Checks core.company_members (clerk_user_id) and public.company_members (user_id) for compatibility.

begin;

-- Drop existing functions so we can recreate with desired parameter names/body.
drop function if exists core.is_company_member(uuid);
drop function if exists core.is_company_admin(uuid);

-- core.is_company_member(check_company_id): true if current user is a member of the company.
-- Uses core.current_user_id() (Clerk JWT sub). Checks core then public company_members.
create or replace function core.is_company_member(check_company_id uuid)
returns boolean
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
    return false;
  end if;

  -- 1) core.company_members (table with clerk_user_id or view with user_id)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'core' and table_name = 'company_members' and column_name = 'clerk_user_id'
  ) then
    if exists (
      select 1 from core.company_members m
      where m.company_id = check_company_id and m.clerk_user_id = v_user_id
    ) then
      return true;
    end if;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'core' and table_name = 'company_members' and column_name = 'user_id'
  ) then
    if exists (
      select 1 from core.company_members m
      where m.company_id = check_company_id and m.user_id = v_user_id
    ) then
      return true;
    end if;
  end if;

  -- 2) public.company_members (legacy: user_id)
  if exists (
    select 1 from public.company_members m
    where m.company_id = check_company_id and m.user_id = v_user_id
  ) then
    return true;
  end if;

  return false;
end;
$$;

-- core.is_company_admin(check_company_id): true if current user is company_admin for the company.
create or replace function core.is_company_admin(check_company_id uuid)
returns boolean
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
    return false;
  end if;

  -- 1) core.company_members (table or view)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'core' and table_name = 'company_members' and column_name = 'clerk_user_id'
  ) then
    if exists (
      select 1 from core.company_members m
      where m.company_id = check_company_id and m.clerk_user_id = v_user_id
        and m.role in ('company_admin', 'admin', 'owner')
    ) then
      return true;
    end if;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'core' and table_name = 'company_members' and column_name = 'user_id'
  ) then
    if exists (
      select 1 from core.company_members m
      where m.company_id = check_company_id and m.user_id = v_user_id
        and m.role in ('company_admin', 'admin', 'owner')
    ) then
      return true;
    end if;
  end if;

  -- 2) public.company_members (legacy)
  if exists (
    select 1 from public.company_members m
    where m.company_id = check_company_id and m.user_id = v_user_id
      and m.role in ('company_admin', 'admin', 'owner')
  ) then
    return true;
  end if;

  return false;
end;
$$;

grant execute on function core.is_company_member(uuid) to authenticated;
grant execute on function core.is_company_admin(uuid) to authenticated;

commit;
