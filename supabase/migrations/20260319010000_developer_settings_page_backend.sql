-- Developer Settings page backend RPCs
-- Safely manage the current developer's company link, role, and company identity.
-- All functions are SECURITY DEFINER and gated by admin.is_developer().
-- Source of truth:
--   - core.profiles.active_company_id for the active company
--   - core.company_members for membership + role
--   - core.companies for company identity
-- public.profiles/company_members/companies are updated best-effort when present.

begin;

-- ============================================================================
-- 1) get_developer_settings(): snapshot of current developer + membership
-- ============================================================================

create or replace function public.get_developer_settings()
returns table (
  developer_clerk_user_id   text,
  developer_email           text,
  developer_full_name       text,
  developer_created_at      timestamptz,
  active_company_id         uuid,
  active_company_name       text,
  active_company_created_at timestamptz,
  member_company_id         uuid,
  member_company_name       text,
  member_role               text,
  member_created_at         timestamptz
)
language plpgsql
stable
security definer
set search_path = admin, core, public
as $$
declare
  v_user_id   text;
  v_company_id uuid;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_user_id := core.current_user_id();
  if v_user_id is null then
    return;
  end if;

  -- Prefer active_company_id from core.profiles
  select p.active_company_id
  into v_company_id
  from core.profiles p
  where p.clerk_user_id = v_user_id
  limit 1;

  -- Fallback: latest membership company_id
  if v_company_id is null then
    select m.company_id
    into v_company_id
    from core.company_members m
    where m.clerk_user_id = v_user_id
    order by m.created_at desc nulls last
    limit 1;
  end if;

  return query
  select
    d.clerk_user_id::text          as developer_clerk_user_id,
    coalesce(d.email, pr.email)    as developer_email,
    coalesce(d.full_name, pr.full_name, d.email, pr.email) as developer_full_name,
    coalesce(d.created_at, pr.created_at)        as developer_created_at,
    v_company_id                                  as active_company_id,
    c.name::text                                  as active_company_name,
    c.created_at                                  as active_company_created_at,
    m.company_id                                  as member_company_id,
    mc.name::text                                 as member_company_name,
    m.role::text                                  as member_role,
    m.created_at                                  as member_created_at
  from admin.developers d
  left join core.profiles pr
    on pr.clerk_user_id = d.clerk_user_id
  left join core.company_members m
    on m.clerk_user_id = d.clerk_user_id
   and (v_company_id is null or m.company_id = v_company_id)
  left join core.companies c
    on c.id = v_company_id
  left join core.companies mc
    on mc.id = m.company_id
  where d.clerk_user_id = v_user_id
  limit 1;
end;
$$;

grant execute on function public.get_developer_settings() to authenticated;

-- ============================================================================
-- 2) link_developer_to_company(p_company_id)
--    - Sets core.profiles.active_company_id
--    - Ensures core.company_members row exists (does not override existing role)
--    - Best-effort mirror to public.profiles / public.company_members
-- p_company_id is text so the frontend can safely pass IDs without casting;
-- we cast internally to uuid where needed.

create or replace function public.link_developer_to_company(p_company_id text)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_user_id    text;
  v_exists     boolean;
  v_company_id uuid;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_user_id := core.current_user_id();
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  if p_company_id is null then
    raise exception 'p_company_id is required' using errcode = '22004';
  end if;
  v_company_id := p_company_id::uuid;

  -- Ensure company exists in core.companies (or public.companies as fallback)
  select exists (
    select 1 from core.companies c where c.id = v_company_id
  ) into v_exists;

  if not v_exists and to_regclass('public.companies') is not null then
    select exists (
      select 1 from public.companies c where c.id::text = p_company_id::text
    ) into v_exists;
  end if;

  if not v_exists then
    raise exception 'Company % not found', p_company_id using errcode = 'P0001';
  end if;

  -- Upsert core.profiles.active_company_id
  insert into core.profiles (clerk_user_id, active_company_id, created_at, updated_at)
  values (v_user_id, v_company_id, now(), now())
  on conflict (clerk_user_id) do update
    set active_company_id = excluded.active_company_id,
        updated_at        = now();

  -- Ensure membership exists in core.company_members, but do not change role if it already exists.
  insert into core.company_members (company_id, clerk_user_id, role, created_at, updated_at)
  values (v_company_id, v_user_id, 'company_admin', now(), now())
  on conflict (company_id, clerk_user_id) do update
    set updated_at = now();

  -- Best-effort mirror to public.profiles / public.company_members if they exist.
  if to_regclass('public.profiles') is not null then
    update public.profiles
      set company_id = p_company_id::text,
          updated_at = now()
    where id = v_user_id;
  end if;

  if to_regclass('public.company_members') is not null then
    insert into public.company_members (company_id, user_id, role, created_at)
    values (p_company_id::text, v_user_id, 'company_admin', now())
    on conflict (company_id, user_id) do update
      set updated_at = now();
  end if;
end;
$$;

grant execute on function public.link_developer_to_company(text) to authenticated;

-- ============================================================================
-- 3) remove_developer_company_link()
--    - Clears core.profiles.active_company_id
--    - Removes membership for the active company only (no company delete)
-- ============================================================================

create or replace function public.remove_developer_company_link()
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_user_id    text;
  v_company_id uuid;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_user_id := core.current_user_id();
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select p.active_company_id
  into v_company_id
  from core.profiles p
  where p.clerk_user_id = v_user_id
  limit 1;

  -- Clear active_company_id but keep profile row.
  update core.profiles
    set active_company_id = null,
        updated_at = now()
  where clerk_user_id = v_user_id;

  if v_company_id is not null then
    delete from core.company_members
    where clerk_user_id = v_user_id
      and company_id = v_company_id;

    if to_regclass('public.profiles') is not null then
      update public.profiles
        set company_id = null,
            updated_at = now()
      where id = v_user_id
        and company_id = v_company_id::text;
    end if;

    if to_regclass('public.company_members') is not null then
      delete from public.company_members
      where user_id = v_user_id
        and company_id = v_company_id::text;
    end if;
  end if;
end;
$$;

grant execute on function public.remove_developer_company_link() to authenticated;

-- ============================================================================
-- 4) set_developer_role(p_role)
--    - Updates role in core.company_members for the active company
-- ============================================================================

create or replace function public.set_developer_role(p_role text)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_user_id    text;
  v_company_id uuid;
  v_role       text;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_user_id := core.current_user_id();
  if v_user_id is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  v_role := nullif(trim(coalesce(p_role, '')), '');
  if v_role is null then
    raise exception 'p_role is required' using errcode = '22004';
  end if;

  select p.active_company_id
  into v_company_id
  from core.profiles p
  where p.clerk_user_id = v_user_id
  limit 1;

  if v_company_id is null then
    raise exception 'No active company to set role for' using errcode = 'P0001';
  end if;

  update core.company_members
    set role = v_role,
        updated_at = now()
  where clerk_user_id = v_user_id
    and company_id = v_company_id;

  -- If there was no membership row, create one.
  if not found then
    insert into core.company_members (company_id, clerk_user_id, role, created_at, updated_at)
    values (v_company_id, v_user_id, v_role, now(), now());
  end if;

  if to_regclass('public.company_members') is not null then
    update public.company_members
      set role = v_role,
          updated_at = now()
    where user_id = v_user_id
      and company_id = v_company_id::text;
  end if;
end;
$$;

grant execute on function public.set_developer_role(text) to authenticated;

-- ============================================================================
-- 5) rename_company_safely(p_company_id, p_name)
--    - Renames company in core.companies (and public.companies if present)
--    - Never deletes; only updates name + updated_at
-- ============================================================================

-- p_company_id is text for consistency with other RPCs; cast to uuid internally.

create or replace function public.rename_company_safely(p_company_id text, p_name text)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_name       text;
  v_company_id uuid;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');
  if v_name is null then
    raise exception 'p_name is required' using errcode = '22004';
  end if;

  if p_company_id is null then
    raise exception 'p_company_id is required' using errcode = '22004';
  end if;
  v_company_id := p_company_id::uuid;

  update core.companies
    set name = v_name,
        updated_at = now()
  where id = v_company_id;

  if to_regclass('public.companies') is not null then
    update public.companies
      set name = v_name,
          updated_at = now()
    where id::text = p_company_id::text;
  end if;
end;
$$;

grant execute on function public.rename_company_safely(text, text) to authenticated;

commit;

