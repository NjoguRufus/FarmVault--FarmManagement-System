-- Database-driven dashboard switcher visibility (ambassador + company), independent of client session companyId.
-- Uses JWT identity (core.current_user_id = Clerk sub), not localStorage.

begin;

create or replace function public.dashboard_switcher_capabilities()
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_clerk       text;
  v_ambassador  boolean := false;
  v_company     boolean := false;
  v_has_public  boolean;
begin
  v_clerk := nullif(trim(coalesce(core.current_user_id(), '')), '');
  if v_clerk is null then
    return jsonb_build_object('is_ambassador', false, 'has_company', false);
  end if;

  select exists (
    select 1
    from public.ambassadors a
    where a.clerk_user_id = v_clerk
    limit 1
  )
  into v_ambassador;

  select exists (
    select 1
    from core.company_members m
    inner join core.companies c on c.id = m.company_id
    where m.clerk_user_id = v_clerk
    limit 1
  )
  into v_company;

  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'company_members'
  )
  into v_has_public;

  if not v_company and coalesce(v_has_public, false) then
    select exists (
      select 1
      from public.company_members pm
      inner join core.companies c on c.id = pm.company_id
      where cast(pm.user_id as text) = v_clerk
      limit 1
    )
    into v_company;
  end if;

  return jsonb_build_object(
    'is_ambassador', coalesce(v_ambassador, false),
    'has_company', coalesce(v_company, false)
  );
end;
$$;

revoke all on function public.dashboard_switcher_capabilities() from public;
grant execute on function public.dashboard_switcher_capabilities() to authenticated;

commit;

notify pgrst, 'reload schema';
