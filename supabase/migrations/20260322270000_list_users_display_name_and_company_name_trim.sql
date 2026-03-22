-- Platform users: return raw profiles.full_name (nullable) so the app can apply display fallbacks (email local-part, etc.).
-- Company onboarding: reject empty/too-short company names at the RPC layer.

-- ---------------------------------------------------------------------------
-- 1) developer.list_users — do not coerce NULL full_name to 'Unnamed User'
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
set search_path = public, admin, developer
as $$
declare
  v_rows jsonb := '[]'::jsonb;
begin
  perform developer.assert_developer();

  if to_regclass('public.profiles') is null then
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
      from public.profiles p
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
          case
            when to_regclass('public.company_members') is not null then
              (
                select jsonb_build_object(
                  'company_id', m.company_id,
                  'role', m.role,
                  'company_name', c.name
                )
                from public.company_members m
                left join public.companies c on c.id = m.company_id
                where m.clerk_user_id = b.clerk_user_id
                  and ($4 is null or m.company_id = $4)
                limit 1
              )
            else null
          end
        )
      )
    ), '[]'::jsonb)
    from base b
  $sql$
  into v_rows
  using p_search, p_limit, p_offset, p_company_id;

  return jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'total', (select count(*) from public.profiles)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) core.create_company_with_admin — require trimmed name length >= 2
-- ---------------------------------------------------------------------------

create or replace function core.create_company_with_admin(
  _name text
)
returns uuid
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_user_id    text;
  v_company_id uuid;
  v_trim       text;
begin
  v_user_id := core.current_user_id();
  if v_user_id is null then
    raise exception 'create_company_with_admin: unauthenticated' using errcode = '28000';
  end if;

  v_trim := trim(coalesce(_name, ''));
  if length(v_trim) < 2 then
    raise exception 'Company name is required (at least 2 characters).' using errcode = '23514';
  end if;

  insert into core.companies (name, created_by)
  values (v_trim, v_user_id)
  returning id into v_company_id;

  insert into core.profiles (clerk_user_id, active_company_id, created_at, updated_at)
  values (v_user_id, v_company_id, now(), now())
  on conflict (clerk_user_id) do update
    set active_company_id = excluded.active_company_id,
        updated_at        = now();

  insert into core.company_members (company_id, clerk_user_id, role)
  values (v_company_id, v_user_id, 'company_admin')
  on conflict (company_id, clerk_user_id) do update
    set role = excluded.role;

  return v_company_id;
end;
$$;

create or replace function core.create_company_and_admin(
  _name text
)
returns uuid
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_user_id    text;
  v_company_id uuid;
  v_trim       text;
begin
  v_user_id := core.current_user_id();
  if v_user_id is null then
    raise exception 'create_company_and_admin: unauthenticated' using errcode = '28000';
  end if;

  v_trim := trim(coalesce(_name, ''));
  if length(v_trim) < 2 then
    raise exception 'Company name is required (at least 2 characters).' using errcode = '23514';
  end if;

  insert into core.companies (name, created_by)
  values (v_trim, v_user_id)
  returning id into v_company_id;

  insert into core.profiles (clerk_user_id, active_company_id, created_at, updated_at)
  values (v_user_id, v_company_id, now(), now())
  on conflict (clerk_user_id) do update
    set active_company_id = excluded.active_company_id,
        updated_at        = now();

  insert into core.company_members (company_id, clerk_user_id, role)
  values (v_company_id, v_user_id, 'company_admin')
  on conflict (company_id, clerk_user_id) do update
    set role = excluded.role;

  return v_company_id;
end;
$$;
