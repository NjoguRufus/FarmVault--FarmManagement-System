-- PostgreSQL validates every subquery in a CASE branch at parse time, so referencing
-- public.memberships when that table does not exist raises 42P01 even when the branch
-- would not run. FarmVault uses public.company_members only — drop the memberships arm.

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
