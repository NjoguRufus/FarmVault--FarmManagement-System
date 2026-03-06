-- RPC: current user's role for current company (from core.company_members).
-- Fixes role mismatch when core.profiles has no role column; app can call this after resolving activeCompanyId.

begin;

create or replace function core.current_member_role()
returns text
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_company_id uuid;
  v_user_id    text;
  v_role       text;
begin
  v_user_id := core.current_user_id();
  if v_user_id is null then
    return 'employee';
  end if;

  v_company_id := core.current_company_id();
  if v_company_id is null then
    return 'employee';
  end if;

  select role
  into v_role
  from core.company_members
  where clerk_user_id = v_user_id
    and company_id = v_company_id
  limit 1;

  return coalesce(nullif(trim(v_role), ''), 'employee');
end;
$$;

-- Public wrapper so frontend can call supabase.rpc('current_member_role')
create or replace function public.current_member_role()
returns text
language sql
stable
security definer
set search_path = core, public
as $$
  select core.current_member_role();
$$;

grant execute on function core.current_member_role() to authenticated;
grant execute on function public.current_member_role() to authenticated;

commit;
