-- Idempotent platform user (core.profiles): resolve by Clerk id, else merge by normalized email.
-- Platform Users list reads core.profiles (single source of truth).
-- Optional: unique clerk_user_id on public.profiles when it is a base table (not a view).

begin;

-- ---------------------------------------------------------------------------
-- 1) public.resolve_or_ensure_platform_profile(p_email text)
--    SECURITY DEFINER: merges legacy duplicate Clerk identities into current JWT user.
-- ---------------------------------------------------------------------------

create or replace function public.resolve_or_ensure_platform_profile(p_email text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = core, public, admin
as $$
declare
  v_me    text;
  v_norm  text;
  v_other text;
  v_action text := 'existing';
begin
  v_me := nullif(trim(core.current_user_id()), '');
  if v_me is null then
    raise exception 'resolve_or_ensure_platform_profile: unauthenticated' using errcode = '28000';
  end if;

  v_norm := public.normalize_email(p_email);

  -- Already have a row for this Clerk user
  if exists (select 1 from core.profiles p where p.clerk_user_id = v_me) then
    if v_norm is not null and length(v_norm) > 0 then
      update core.profiles
      set
        email = v_norm,
        updated_at = now()
      where clerk_user_id = v_me
        and (email is distinct from v_norm);
    end if;

    if to_regclass('public.profiles') is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'profiles' and column_name = 'clerk_user_id'
       ) then
      update public.profiles pub
      set
        email = coalesce(v_norm, pub.email),
        updated_at = now()
      where pub.clerk_user_id = v_me;
    end if;

    return jsonb_build_object('clerk_user_id', v_me, 'action', 'existing');
  end if;

  -- No row for this Clerk id: attach to existing profile by normalized email (same human, new Clerk id)
  if v_norm is not null and length(v_norm) > 0 then
    select p.clerk_user_id
      into v_other
    from core.profiles p
    where public.normalize_email(p.email) = v_norm
    order by (p.active_company_id is not null) desc, p.updated_at desc nulls last, p.created_at desc nulls last
    limit 1;

    if v_other is not null and v_other <> v_me then
      delete from core.profiles where clerk_user_id = v_me;

      delete from core.company_members cm1
      where cm1.clerk_user_id = v_other
        and exists (
          select 1 from core.company_members cm2
          where cm2.company_id = cm1.company_id and cm2.clerk_user_id = v_me
        );

      update core.company_members set clerk_user_id = v_me where clerk_user_id = v_other;

      update core.companies set created_by = v_me where created_by = v_other;

      if to_regclass('public.company_members') is not null
         and exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'company_members' and column_name = 'clerk_user_id'
         ) then
        delete from public.company_members cm1
        where cm1.clerk_user_id = v_other
          and exists (
            select 1 from public.company_members cm2
            where cm2.company_id = cm1.company_id and cm2.clerk_user_id = v_me
          );
        update public.company_members set clerk_user_id = v_me where clerk_user_id = v_other;
      end if;

      if to_regclass('public.employees') is not null
         and exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'employees' and column_name = 'clerk_user_id'
         ) then
        delete from public.employees e1
        where e1.clerk_user_id = v_other
          and exists (
            select 1 from public.employees e2
            where e2.company_id = e1.company_id and e2.clerk_user_id = v_me
          );
        update public.employees set clerk_user_id = v_me where clerk_user_id = v_other;
      end if;

      if to_regclass('public.alert_recipients') is not null
         and exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'alert_recipients' and column_name = 'clerk_user_id'
         ) then
        delete from public.alert_recipients ar1
        where ar1.clerk_user_id = v_other
          and exists (
            select 1 from public.alert_recipients ar2
            where ar2.company_id = ar1.company_id and ar2.clerk_user_id = v_me
          );
        update public.alert_recipients set clerk_user_id = v_me where clerk_user_id = v_other;
      end if;

      if to_regclass('public.user_company_mappings') is not null
         and exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'user_company_mappings' and column_name = 'clerk_user_id'
         ) then
        update public.user_company_mappings set clerk_user_id = v_me where clerk_user_id = v_other;
      end if;

      if to_regclass('admin.developers') is not null
         and exists (
           select 1 from information_schema.columns
           where table_schema = 'admin' and table_name = 'developers' and column_name = 'clerk_user_id'
         ) then
        delete from admin.developers d1
        where d1.clerk_user_id = v_other
          and exists (select 1 from admin.developers d2 where d2.clerk_user_id = v_me);
        update admin.developers set clerk_user_id = v_me where clerk_user_id = v_other;
      end if;

      update core.profiles
      set
        clerk_user_id = v_me,
        email = coalesce(v_norm, email),
        updated_at = now()
      where clerk_user_id = v_other;

      if to_regclass('public.profiles') is not null
         and exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'profiles' and column_name = 'clerk_user_id'
         ) then
        update public.profiles set clerk_user_id = v_me where clerk_user_id = v_other;
      end if;

      v_action := 'merged_from_email';
      return jsonb_build_object('clerk_user_id', v_me, 'action', v_action);
    end if;
  end if;

  -- Brand new platform user (canonical row is core.profiles; developer list_users reads core)
  insert into core.profiles (clerk_user_id, email, created_at, updated_at)
  values (v_me, v_norm, now(), now());

  return jsonb_build_object('clerk_user_id', v_me, 'action', 'created');
end;
$$;

grant execute on function public.resolve_or_ensure_platform_profile(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) developer.list_users — read core.profiles (canonical), not legacy public.profiles
-- ---------------------------------------------------------------------------

create or replace function developer.list_users(
  p_search text default null,
  p_company_id uuid default null,
  p_limit int default 50,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, developer, core
as $$
declare
  v_rows jsonb := '[]'::jsonb;
begin
  perform developer.assert_developer();

  if to_regclass('core.profiles') is null then
    return jsonb_build_object('rows', '[]'::jsonb, 'total', 0);
  end if;

  execute $sql$
    with base as (
      select
        p.clerk_user_id,
        nullif(trim(p.full_name), '') as full_name,
        p.email,
        p.created_at,
        p.updated_at
      from core.profiles p
      where (
        $1 is null
        or coalesce(trim(p.full_name), '') ilike '%' || $1 || '%'
        or coalesce(p.email, '') ilike '%' || $1 || '%'
        or split_part(lower(trim(coalesce(p.email, ''))), '@', 1) ilike '%' || $1 || '%'
      )
      order by p.created_at desc nulls last
      limit $2
      offset $3
    )
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', b.clerk_user_id,
        'full_name', b.full_name,
        'email', b.email,
        'created_at', b.created_at,
        'last_seen', b.updated_at,
        'developer', admin.is_developer(b.clerk_user_id),
        'company', (
          select jsonb_build_object(
            'company_id', m.company_id,
            'role', m.role,
            'company_name', c.name
          )
          from core.company_members m
          left join core.companies c on c.id = m.company_id
          where m.clerk_user_id = b.clerk_user_id
            and ($4 is null or m.company_id = $4)
          order by m.created_at desc nulls last
          limit 1
        )
      )
    ), '[]'::jsonb)
    from base b
  $sql$
  into v_rows
  using p_search, p_limit, p_offset, p_company_id;

  return jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total', (select count(*)::bigint from core.profiles)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Best-effort: unique clerk_user_id on public.profiles (skip if duplicates exist)
--    Cannot index views; many deployments use public.profiles as a view over core.profiles.
-- ---------------------------------------------------------------------------

do $$
declare
  v_dup int := 0;
  v_relkind "char";
begin
  if to_regclass('public.profiles') is null then
    return;
  end if;

  select c.relkind into v_relkind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'profiles';

  -- Only ordinary tables and materialized views accept indexes; plain views do not.
  if v_relkind is null or v_relkind not in ('r', 'm') then
    raise notice 'Skipped uq_public_profiles_clerk_user_id_not_empty: public.profiles is not indexable (relkind=%)', v_relkind;
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'clerk_user_id'
  ) then
    return;
  end if;

  select count(*) into v_dup
  from (
    select clerk_user_id
    from public.profiles
    where nullif(trim(clerk_user_id), '') is not null
    group by 1
    having count(*) > 1
  ) d;

  if v_dup = 0 then
    create unique index if not exists uq_public_profiles_clerk_user_id_not_empty
      on public.profiles (clerk_user_id)
      where clerk_user_id is not null and length(trim(clerk_user_id)) > 0;
  else
    raise notice 'Skipped uq_public_profiles_clerk_user_id_not_empty: % duplicate clerk_user_id groups in public.profiles', v_dup;
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
