-- get_developer_settings referenced admin.developers.full_name, which is absent on
-- minimal admin.developers schemas (e.g. clerk_user_id + email + role only).
-- Align with core.profiles for display name; ensure optional columns exist for older SELECTs.

begin;

alter table admin.developers add column if not exists full_name text;
alter table admin.developers add column if not exists created_at timestamptz;

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

  return query
  select
    d.clerk_user_id::text as developer_clerk_user_id,
    coalesce(d.email, pr.email) as developer_email,
    coalesce(
      nullif(trim(pr.full_name), ''),
      nullif(trim(d.full_name), ''),
      d.email,
      pr.email
    ) as developer_full_name,
    coalesce(pr.created_at, d.created_at) as developer_created_at,
    v_company_id as active_company_id,
    c.name::text as active_company_name,
    c.created_at as active_company_created_at,
    m.company_id as member_company_id,
    mc.name::text as member_company_name,
    m.role::text as member_role,
    m.created_at as member_created_at
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

commit;
