-- If the user created the company but company_members.role is a generic staff label,
-- return company_admin so clients route to the company dashboard (not /staff).

begin;

create or replace function public.current_context()
returns table (company_id uuid, role text)
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_user_id    text;
  v_company_id uuid;
  v_role       text;
  v_creator    boolean;
  rlow         text;
begin
  v_user_id := core.current_user_id();
  if v_user_id is null then
    return;
  end if;

  select p.active_company_id
    into v_company_id
  from core.profiles p
  where p.clerk_user_id = v_user_id
  limit 1;

  if v_company_id is null then
    select m.company_id
      into v_company_id
    from core.company_members m
    where m.clerk_user_id = v_user_id
    order by m.created_at desc nulls last
    limit 1;
  end if;

  if v_company_id is null then
    return;
  end if;

  select m.role
    into v_role
  from core.company_members m
  where m.company_id = v_company_id
    and m.clerk_user_id = v_user_id
  limit 1;

  select exists (
    select 1
    from core.companies c
    where c.id = v_company_id
      and coalesce(trim(c.created_by), '') = v_user_id
  )
    into v_creator;

  rlow := lower(coalesce(nullif(trim(v_role), ''), 'employee'));

  if v_creator and rlow in ('employee', 'staff', 'member', 'user', '') then
    v_role := 'company_admin';
  end if;

  company_id := v_company_id;
  role := coalesce(nullif(trim(v_role), ''), 'employee');
  return next;
end;
$$;

commit;

notify pgrst, 'reload schema';
