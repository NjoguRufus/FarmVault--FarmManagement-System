-- Single source of truth for tenant context: company_id + role from core.profiles + core.company_members.
-- Frontend calls supabase.rpc('current_context') and sets user.companyId + user.role from response.
-- RLS ensures authenticated users can only read their own profile and memberships.

begin;

-- 1) RPC: current_context() returns { company_id, role } for the current user.
-- Reads core.profiles.active_company_id and core.company_members.role (join on clerk_user_id).
create or replace function public.current_context()
returns table (company_id uuid, role text)
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_user_id text;
  v_company_id uuid;
  v_role text;
begin
  v_user_id := core.current_user_id();
  if v_user_id is null then
    return;
  end if;

  -- active_company_id from core.profiles
  select p.active_company_id into v_company_id
  from core.profiles p
  where p.clerk_user_id = v_user_id
  limit 1;

  -- If no active company, try latest membership
  if v_company_id is null then
    select m.company_id into v_company_id
    from core.company_members m
    where m.clerk_user_id = v_user_id
    order by m.created_at desc nulls last
    limit 1;
  end if;

  if v_company_id is null then
    return;
  end if;

  -- role from core.company_members for this company
  select m.role into v_role
  from core.company_members m
  where m.company_id = v_company_id and m.clerk_user_id = v_user_id
  limit 1;

  company_id := v_company_id;
  role := coalesce(nullif(trim(v_role), ''), 'employee');
  return next;
end;
$$;

grant execute on function public.current_context() to authenticated;

-- 2) RLS: core.profiles – select/insert/update own row (for upsert and current_context reads)
alter table core.profiles enable row level security;

drop policy if exists profiles_select_own on core.profiles;
create policy profiles_select_own on core.profiles
  for select
  to authenticated
  using (clerk_user_id = core.current_user_id());

drop policy if exists profiles_insert_own on core.profiles;
create policy profiles_insert_own on core.profiles
  for insert
  to authenticated
  with check (clerk_user_id = core.current_user_id());

drop policy if exists profiles_update_own on core.profiles;
create policy profiles_update_own on core.profiles
  for update
  to authenticated
  using (clerk_user_id = core.current_user_id())
  with check (clerk_user_id = core.current_user_id());

-- 3) RLS: core.company_members – allow select where clerk_user_id = current user
alter table core.company_members enable row level security;

drop policy if exists company_members_select_own on core.company_members;
create policy company_members_select_own on core.company_members
  for select
  to authenticated
  using (clerk_user_id = core.current_user_id());

commit;
