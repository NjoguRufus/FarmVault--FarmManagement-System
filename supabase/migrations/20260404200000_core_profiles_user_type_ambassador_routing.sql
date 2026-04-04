-- Add user_type to core.profiles and wire it through ambassador + company creation RPCs.
-- This enables role-based routing:  'ambassador' | 'company_admin' | 'both'

begin;

-- ============================================================
-- 1. Add user_type column to core.profiles
-- ============================================================
alter table core.profiles
  add column if not exists user_type text
    not null default 'company_admin'
    check (user_type in ('ambassador', 'company_admin', 'both'));

-- ============================================================
-- 2. Backfill existing rows
--    Order matters: do 'both' first so ambassador-only update
--    only touches the remaining 'company_admin' rows.
-- ============================================================

-- Users who are ambassadors AND have a company membership → 'both'
update core.profiles p
set user_type = 'both'
where p.user_type = 'company_admin'
  and exists (
    select 1 from public.ambassadors a
    where a.clerk_user_id = p.clerk_user_id
  )
  and exists (
    select 1 from core.company_members m
    where m.clerk_user_id = p.clerk_user_id
  );

-- Ambassadors with no company membership → 'ambassador'
update core.profiles p
set user_type = 'ambassador'
where p.user_type = 'company_admin'
  and exists (
    select 1 from public.ambassadors a
    where a.clerk_user_id = p.clerk_user_id
  )
  and not exists (
    select 1 from core.company_members m
    where m.clerk_user_id = p.clerk_user_id
  );

-- ============================================================
-- 3. complete_my_ambassador_onboarding
--    Set user_type = 'ambassador' (or 'both' if they already
--    have a company) on the profile when onboarding completes.
-- ============================================================
create or replace function public.complete_my_ambassador_onboarding()
returns jsonb
language plpgsql
security definer
set search_path = public, core
as $$
declare
  v_clerk       text;
  v_id          uuid;
  n             int;
  v_has_company boolean;
begin
  v_clerk := nullif(trim(coalesce(core.current_user_id(), '')), '');
  if v_clerk is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select a.id into v_id
  from public.ambassadors a
  where a.clerk_user_id = v_clerk
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update public.ambassadors
  set onboarding_complete = true
  where id = v_id;

  get diagnostics n = row_count;
  if n = 0 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  insert into public.ambassador_earnings (ambassador_id, amount, type, status, description)
  values (v_id, 200, 'signup_bonus', 'owed', 'Welcome bonus')
  on conflict (ambassador_id) where (type = 'signup_bonus') do nothing;

  -- Determine if this ambassador also has a company membership.
  select exists(
    select 1 from core.company_members m
    where m.clerk_user_id = v_clerk
  ) into v_has_company;

  -- Stamp user_type on the profile.
  update core.profiles
  set user_type  = case when v_has_company then 'both' else 'ambassador' end,
      updated_at = now()
  where clerk_user_id = v_clerk;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.complete_my_ambassador_onboarding() from public;
grant execute on function public.complete_my_ambassador_onboarding() to authenticated;

-- ============================================================
-- 4. core.create_company_with_admin
--    When a user creates a company, upgrade their user_type:
--      ambassador  → both
--      (anything else stays as-is; new insert gets 'company_admin')
-- ============================================================
create or replace function core.create_company_with_admin(_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = core, public
as $$
declare
  v_user_id    text;
  v_norm_name  text;
  v_company_id uuid;
begin
  v_user_id := core.current_user_id();
  if v_user_id is null then
    raise exception 'create_company_with_admin: unauthenticated' using errcode = '28000';
  end if;

  v_norm_name := lower(trim(_name));
  if v_norm_name is null or v_norm_name = '' then
    raise exception 'create_company_with_admin: empty company name' using errcode = '22023';
  end if;

  -- Reuse existing company for this owner context if name matches.
  select c.id
  into v_company_id
  from core.companies c
  left join core.company_members m
    on m.company_id = c.id
   and m.clerk_user_id = v_user_id
  where lower(trim(c.name)) = v_norm_name
    and (c.created_by = v_user_id or m.clerk_user_id is not null)
  order by c.created_at desc
  limit 1;

  if v_company_id is null then
    insert into core.companies (name, created_by)
    values (_name, v_user_id)
    returning id into v_company_id;
  end if;

  -- Upsert profile; if the user was ambassador-only, promote to 'both'.
  insert into core.profiles (clerk_user_id, active_company_id, created_at, updated_at, user_type)
  values (v_user_id, v_company_id, now(), now(), 'company_admin')
  on conflict (clerk_user_id) do update
    set active_company_id = excluded.active_company_id,
        updated_at        = now(),
        user_type         = case
                              when core.profiles.user_type = 'ambassador' then 'both'
                              else core.profiles.user_type
                            end;

  insert into core.company_members (company_id, clerk_user_id, role)
  values (v_company_id, v_user_id, 'company_admin')
  on conflict (company_id, clerk_user_id) do update
    set role = excluded.role;

  return v_company_id;
end;
$$;

-- core.create_company_and_admin just delegates — no changes needed to its body.

commit;
