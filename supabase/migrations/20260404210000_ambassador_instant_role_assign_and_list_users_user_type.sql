-- Instant ambassador role assignment at signup + expose user_type in Platform Users list.
--
-- 1. set_my_ambassador_profile_role() — idempotent RPC called right after Clerk signup
--    when signup_type='ambassador' is set in localStorage. Sets user_type on core.profiles
--    immediately, before the ambassador onboarding wizard is completed.
--
-- 2. Updated developer.list_users + public.list_users — include user_type in the row object
--    so Platform Users can show Ambassador / Company Admin / both badges.

begin;

-- ============================================================
-- 1. set_my_ambassador_profile_role
--    Upsert user_type on core.profiles for the current user:
--      no company  → 'ambassador'
--      has company → 'both'
--    Idempotent: calling twice leaves the row in the correct state.
-- ============================================================
create or replace function public.set_my_ambassador_profile_role()
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_clerk       text;
  v_has_company boolean;
  v_new_type    text;
begin
  v_clerk := nullif(trim(coalesce(core.current_user_id(), '')), '');
  if v_clerk is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- Determine whether this user already has a company membership.
  select exists(
    select 1 from core.company_members m
    where m.clerk_user_id = v_clerk
  ) into v_has_company;

  v_new_type := case when v_has_company then 'both' else 'ambassador' end;

  -- Upsert the profile row.
  -- active_company_id is nullable, so a bare insert is safe for ambassador-only users.
  insert into core.profiles (clerk_user_id, user_type, created_at, updated_at)
  values (v_clerk, v_new_type, now(), now())
  on conflict (clerk_user_id) do update
    set user_type  = case
                       -- Existing 'company_admin' → depends on whether they now have a company
                       when core.profiles.user_type = 'company_admin' and v_has_company then 'both'
                       when core.profiles.user_type = 'company_admin'                   then 'ambassador'
                       -- Already 'ambassador': promote to 'both' if they have a company
                       when core.profiles.user_type = 'ambassador' and v_has_company    then 'both'
                       -- 'both' stays 'both'; 'ambassador' without company stays 'ambassador'
                       else core.profiles.user_type
                     end,
        updated_at = now();

  return jsonb_build_object('ok', true, 'user_type', v_new_type);
end;
$$;

revoke all on function public.set_my_ambassador_profile_role() from public;
grant execute on function public.set_my_ambassador_profile_role() to authenticated;

-- ============================================================
-- 2. developer.list_users — add user_type to each row
--    Reads core.profiles directly (canonical source of truth).
-- ============================================================
create or replace function developer.list_users(
  p_search     text default null,
  p_company_id uuid default null,
  p_limit      int  default 50,
  p_offset     int  default 0
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
        p.updated_at,
        coalesce(p.user_type, 'company_admin') as user_type
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
        'id',        b.clerk_user_id,
        'full_name', b.full_name,
        'email',     b.email,
        'created_at', b.created_at,
        'last_seen', b.updated_at,
        'user_type', b.user_type,
        'developer', admin.is_developer(b.clerk_user_id),
        'company', (
          select jsonb_build_object(
            'company_id',   m.company_id,
            'role',         m.role,
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
    'rows',  coalesce(v_rows, '[]'::jsonb),
    'total', (select count(*) from core.profiles)
  );
end;
$$;

grant execute on function developer.list_users(text, uuid, int, int) to authenticated;

-- Re-create the public wrapper to pick up the updated signature / output.
drop function if exists public.list_users(text, int, int);

create function public.list_users(
  p_search text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public, developer, admin
as $$
  select developer.list_users(p_search, null::uuid, p_limit, p_offset);
$$;

grant execute on function public.list_users(text, int, int) to authenticated;

commit;

notify pgrst, 'reload schema';
