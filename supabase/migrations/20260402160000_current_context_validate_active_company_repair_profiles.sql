-- Align current_context() with RLS: never return a company_id the user cannot access
-- (stale profiles.active_company_id without membership caused empty projects/expenses under RLS
-- while the dashboard still showed a company id).
-- Repair profiles: repoint or clear orphaned active_company_id values.

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
  v_member     boolean;
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

  -- Invalidate stale active_company_id (no membership and not company creator).
  if v_company_id is not null then
    v_member := false;
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'core' and table_name = 'company_members' and column_name = 'clerk_user_id'
    ) then
      select exists (
        select 1 from core.company_members m
        where m.company_id = v_company_id and m.clerk_user_id = v_user_id
      ) into v_member;
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'core' and table_name = 'company_members' and column_name = 'user_id'
    ) then
      select exists (
        select 1 from core.company_members m
        where m.company_id = v_company_id and m.user_id = v_user_id
      ) into v_member;
    end if;

    if not coalesce(v_member, false) then
      select exists (
        select 1 from public.company_members m
        where m.company_id = v_company_id and m.user_id = v_user_id
      ) into v_member;
    end if;

    if not v_member then
      select exists (
        select 1
        from core.companies c
        where c.id = v_company_id
          and coalesce(trim(c.created_by), '') = v_user_id
      ) into v_creator;
      if not coalesce(v_creator, false) then
        v_company_id := null;
      end if;
    end if;
  end if;

  if v_company_id is null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'core' and table_name = 'company_members' and column_name = 'clerk_user_id'
    ) then
      select m.company_id
        into v_company_id
      from core.company_members m
      where m.clerk_user_id = v_user_id
      order by m.created_at desc nulls last
      limit 1;
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'core' and table_name = 'company_members' and column_name = 'user_id'
    ) then
      select m.company_id
        into v_company_id
      from core.company_members m
      where m.user_id = v_user_id
      order by m.created_at desc nulls last
      limit 1;
    end if;
  end if;

  if v_company_id is null then
    return;
  end if;

  v_role := null;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'core' and table_name = 'company_members' and column_name = 'clerk_user_id'
  ) then
    select m.role
      into v_role
    from core.company_members m
    where m.company_id = v_company_id
      and m.clerk_user_id = v_user_id
    limit 1;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'core' and table_name = 'company_members' and column_name = 'user_id'
  ) then
    select m.role
      into v_role
    from core.company_members m
    where m.company_id = v_company_id
      and m.user_id = v_user_id
    limit 1;
  end if;

  if v_role is null then
    select m.role
      into v_role
    from public.company_members m
    where m.company_id = v_company_id
      and m.user_id = v_user_id
    limit 1;
  end if;

  select exists (
    select 1
    from core.companies c
    where c.id = v_company_id
      and coalesce(trim(c.created_by), '') = v_user_id
  )
    into v_creator;

  rlow := lower(coalesce(nullif(trim(v_role), ''), 'employee'));

  if coalesce(v_creator, false) and rlow in ('employee', 'staff', 'member', 'user', '') then
    v_role := 'company_admin';
  end if;

  company_id := v_company_id;
  role := coalesce(nullif(trim(v_role), ''), 'employee');
  return next;
end;
$$;

-- One-time repair: repoint profile to latest membership company when active company is orphaned.
update core.profiles p
set
  active_company_id = m.pick_company_id,
  updated_at = now()
from (
  select
    p2.clerk_user_id,
    (
      select m2.company_id
      from core.company_members m2
      where m2.clerk_user_id = p2.clerk_user_id
      order by m2.created_at desc nulls last
      limit 1
    ) as pick_company_id
  from core.profiles p2
  where p2.active_company_id is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'core' and table_name = 'company_members' and column_name = 'clerk_user_id'
    )
    and not exists (
      select 1
      from core.company_members mm
      where mm.company_id = p2.active_company_id
        and mm.clerk_user_id = p2.clerk_user_id
    )
    and not exists (
      select 1
      from core.companies cc
      where cc.id = p2.active_company_id
        and coalesce(trim(cc.created_by), '') = p2.clerk_user_id
    )
    and not exists (
      select 1
      from public.company_members pm
      where pm.company_id = p2.active_company_id
        and pm.user_id = p2.clerk_user_id
    )
) m
where p.clerk_user_id = m.clerk_user_id
  and m.pick_company_id is not null;

-- Clear active company when still orphaned (no membership row to recover).
update core.profiles p
set active_company_id = null, updated_at = now()
where p.active_company_id is not null
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'core' and table_name = 'company_members' and column_name = 'clerk_user_id'
  )
  and not exists (
    select 1
    from core.company_members mm
    where mm.company_id = p.active_company_id
      and mm.clerk_user_id = p.clerk_user_id
  )
  and not exists (
    select 1
    from core.companies cc
    where cc.id = p.active_company_id
      and coalesce(trim(cc.created_by), '') = p.clerk_user_id
  )
  and not exists (
    select 1
    from public.company_members pm
    where pm.company_id = p.active_company_id
      and pm.user_id = p.clerk_user_id
  );

commit;

notify pgrst, 'reload schema';
