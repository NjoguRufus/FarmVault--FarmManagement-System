-- ============================================================================
-- DEVELOPER CONSOLE RPCs - Apply this in Supabase SQL Editor
-- ============================================================================
-- Run this SQL to create/update all the developer console RPCs needed for
-- Season Challenges and Audit Logs tabs.
-- ============================================================================

-- 0) Drop any stale overloads that might confuse PostgREST
-- ============================================================================

drop function if exists public.developer_season_challenges_for_company_json(uuid);
drop function if exists public.developer_season_challenges_for_company_json(text);
drop function if exists public.developer_season_challenges_for_company_json(jsonb);
drop function if exists public.developer_fetch_company_season_challenges(uuid);
drop function if exists public.developer_fetch_company_season_challenges(text);
drop function if exists public.developer_list_company_season_challenges(uuid);
drop function if exists public.developer_list_company_season_challenges(text);
drop function if exists public.get_developer_company_season_challenges(uuid);
drop function if exists public.get_developer_company_season_challenges(text);
drop function if exists public.developer_get_company_farm_intelligence(uuid);
drop function if exists public.developer_get_season_challenges_for_company(uuid);
drop function if exists public.developer_get_season_challenges_for_company(text);
drop function if exists public.fv_developer_company_season_challenges(uuid);
drop function if exists public.fv_developer_company_season_challenges(text);

-- 1) Season Challenges RPC (simple text param, security definer to bypass RLS)
-- ============================================================================
-- This function:
-- - Uses SECURITY DEFINER to bypass RLS policies
-- - Accepts a simple text parameter (the company UUID)
-- - Normalizes the company_id for matching (case-insensitive, dashes optional)
-- - Returns a JSONB array of season challenges

create or replace function public.developer_get_season_challenges_for_company(p_tenant_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, projects
as $$
declare
  v_out jsonb;
  v_key text;
begin
  -- Gate: only developers can use this function
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Normalize the tenant key: trim, lowercase, remove dashes
  v_key := replace(lower(trim(coalesce(p_tenant_key, ''))), '-', '');
  
  -- Return empty array if no valid key
  if v_key = '' then
    return '[]'::jsonb;
  end if;

  -- Check if table exists
  if to_regclass('public.season_challenges') is null then
    return '[]'::jsonb;
  end if;

  -- Fetch all season challenges for this company
  -- Match company_id using same normalization (case-insensitive, dashes optional)
  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc nulls last), '[]'::jsonb)
  into v_out
  from (
    select
      sc.id,
      sc.company_id,
      sc.project_id,
      sc.crop_type,
      sc.title,
      sc.description,
      sc.challenge_type,
      sc.stage_index,
      sc.stage_name,
      sc.severity,
      sc.status,
      sc.date_identified,
      sc.date_resolved,
      sc.what_was_done,
      sc.items_used,
      sc.plan2_if_fails,
      sc.source,
      sc.source_plan_challenge_id,
      sc.created_by,
      sc.created_by_name,
      sc.created_at,
      sc.updated_at,
      p.name as project_name
    from public.season_challenges sc
    left join projects.projects p on p.id = sc.project_id
    where replace(lower(trim(coalesce(sc.company_id, ''))), '-', '') = v_key
    order by sc.created_at desc nulls last
    limit 500
  ) s;

  return coalesce(v_out, '[]'::jsonb);
end;
$$;

grant execute on function public.developer_get_season_challenges_for_company(text) to authenticated;


-- 1b) Season Challenges — JSON payload RPC (recommended for PostgREST)
-- ============================================================================
-- A single jsonb argument avoids stale (uuid) overload resolution and
-- "invalid input syntax for type uuid: """" when binding text parameters.

create or replace function public.developer_season_challenges_for_company_json(p_payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, projects
as $$
declare
  v_out jsonb;
  v_key text;
  v_raw text;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_raw := coalesce(
    nullif(trim(p_payload->>'tenant_key'), ''),
    nullif(trim(p_payload->>'p_tenant_key'), ''),
    nullif(trim(p_payload->>'company_id'), '')
  );

  if v_raw is null then
    return '[]'::jsonb;
  end if;

  v_key := replace(lower(trim(v_raw)), '-', '');
  if v_key = '' then
    return '[]'::jsonb;
  end if;

  if to_regclass('public.season_challenges') is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc nulls last), '[]'::jsonb)
  into v_out
  from (
    select
      sc.id,
      sc.company_id,
      sc.project_id,
      sc.crop_type,
      sc.title,
      sc.description,
      sc.challenge_type,
      sc.stage_index,
      sc.stage_name,
      sc.severity,
      sc.status,
      sc.date_identified,
      sc.date_resolved,
      sc.what_was_done,
      sc.items_used,
      sc.plan2_if_fails,
      sc.source,
      sc.source_plan_challenge_id,
      sc.created_by,
      sc.created_by_name,
      sc.created_at,
      sc.updated_at,
      p.name as project_name
    from public.season_challenges sc
    left join projects.projects p on p.id = sc.project_id
    where replace(lower(trim(coalesce(sc.company_id, ''))), '-', '') = v_key
    order by sc.created_at desc nulls last
    limit 500
  ) s;

  return coalesce(v_out, '[]'::jsonb);
end;
$$;

grant execute on function public.developer_season_challenges_for_company_json(jsonb) to authenticated;


-- 1c) Season Challenges — unambiguous text RPC (use if PostgREST still binds older names to uuid overloads)
-- ============================================================================

drop function if exists public.fv_developer_company_season_challenges(uuid);
drop function if exists public.fv_developer_company_season_challenges(text);

create or replace function public.fv_developer_company_season_challenges(p_company_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin, projects
as $$
declare
  v_out jsonb;
  v_key text;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_key := replace(lower(trim(coalesce(p_company_key, ''))), '-', '');
  if v_key = '' then
    return '[]'::jsonb;
  end if;

  if to_regclass('public.season_challenges') is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc nulls last), '[]'::jsonb)
  into v_out
  from (
    select
      sc.id,
      sc.company_id,
      sc.project_id,
      sc.crop_type,
      sc.title,
      sc.description,
      sc.challenge_type,
      sc.stage_index,
      sc.stage_name,
      sc.severity,
      sc.status,
      sc.date_identified,
      sc.date_resolved,
      sc.what_was_done,
      sc.items_used,
      sc.plan2_if_fails,
      sc.source,
      sc.source_plan_challenge_id,
      sc.created_by,
      sc.created_by_name,
      sc.created_at,
      sc.updated_at,
      p.name as project_name
    from public.season_challenges sc
    left join projects.projects p on p.id = sc.project_id
    where replace(lower(trim(coalesce(sc.company_id, ''))), '-', '') = v_key
    order by sc.created_at desc nulls last
    limit 500
  ) s;

  return coalesce(v_out, '[]'::jsonb);
end;
$$;

grant execute on function public.fv_developer_company_season_challenges(text) to authenticated;


-- 2) Farm Intelligence RPC (text param wrapper)
-- ============================================================================

create or replace function public.developer_get_company_farm_intelligence(p_tenant_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = admin, core, public, projects, harvest, finance
as $$
declare
  v_trim text;
  v_cid uuid;
  v_inner jsonb;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_trim := nullif(trim(coalesce(p_tenant_key, '')), '');
  if v_trim is null then
    return jsonb_build_object('error', 'company_not_found', 'company_id', '');
  end if;

  begin
    v_cid := v_trim::uuid;
  exception
    when invalid_text_representation then
      return jsonb_build_object('error', 'company_not_found', 'company_id', v_trim);
  end;

  v_inner := public.get_developer_company_farm_intelligence(v_cid);

  return coalesce(v_inner, '{}'::jsonb);
end;
$$;

grant execute on function public.developer_get_company_farm_intelligence(text) to authenticated;


-- 3) Audit Logs RPC
-- ============================================================================

create or replace function public.developer_list_company_audit_logs(
  p_tenant_key text,
  p_limit int default 50,
  p_offset int default 0,
  p_module text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin
as $$
declare
  v_key text;
  v_lim int;
  v_off int;
  v_mod text;
  v_fetch int;
  v_rows jsonb;
  v_has_more boolean;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_key := replace(lower(trim(coalesce(p_tenant_key, ''))), '-', '');
  if v_key = '' then
    return jsonb_build_object('rows', '[]'::jsonb, 'has_more', false);
  end if;

  v_lim := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 200));
  v_off := greatest(0, coalesce(p_offset, 0));
  v_mod := nullif(trim(lower(coalesce(p_module, ''))), '');
  v_fetch := v_lim + 1;

  if to_regclass('public.audit_logs') is null then
    return jsonb_build_object('rows', '[]'::jsonb, 'has_more', false);
  end if;

  with page as (
    select
      al.id::text as id,
      al.created_at as logged_at,
      al.action,
      coalesce(nullif(trim(al.entity_type), ''), 'general') as module,
      nullif(
        trim(
          coalesce(
            al.metadata->>'actor_name',
            al.metadata->>'actorName',
            al.metadata->>'user_name',
            al.metadata->>'userName',
            al.metadata->>'actor_email',
            al.metadata->>'actorEmail',
            al.metadata->>'user_email',
            al.metadata->>'email',
            al.metadata->>'created_by_name',
            al.metadata->>'created_by',
            al.metadata->>'actor_id',
            al.metadata->>'user_id',
            ''
          )
        ),
        ''
      ) as actor_label,
      left(
        trim(
          coalesce(
            al.metadata->>'description',
            al.metadata->>'message',
            al.metadata->>'note',
            al.metadata->>'summary',
            al.action
          )
        ),
        2000
      ) as description,
      nullif(trim(al.entity_id), '') as affected_record
    from public.audit_logs al
    where replace(lower(trim(coalesce(al.company_id, ''))), '-', '') = v_key
      and (
        v_mod is null
        or lower(coalesce(nullif(trim(al.entity_type), ''), 'general')) = v_mod
      )
    order by al.created_at desc nulls last
    limit v_fetch offset v_off
  )
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'logged_at', p.logged_at,
            'action', p.action,
            'module', p.module,
            'actor_label', p.actor_label,
            'description', p.description,
            'affected_record', p.affected_record
          )
          order by p.logged_at desc nulls last
        )
        from (select * from page limit v_lim) p
      ),
      '[]'::jsonb
    ),
    (select count(*) > v_lim from page)
    into v_rows, v_has_more;

  return jsonb_build_object(
    'rows', coalesce(v_rows, '[]'::jsonb),
    'has_more', v_has_more
  );
end;
$$;

grant execute on function public.developer_list_company_audit_logs(text, int, int, text) to authenticated;


-- 4) Fix public.is_developer() to work with Clerk auth
-- ============================================================================
-- The RLS policies use public.is_developer() but that checks public.profiles
-- which may not have the developer user. Update it to also check admin.developers.

create or replace function public.is_developer()
returns boolean
language plpgsql
stable
security definer
set search_path = public, admin, core
as $$
declare
  v_user text;
  v_is_dev boolean := false;
begin
  -- Get Clerk user ID from JWT
  begin
    v_user := core.current_user_id();
  exception when others then
    v_user := null;
  end;
  
  -- Fallback to public.current_clerk_id
  if v_user is null then
    begin
      v_user := public.current_clerk_id();
    exception when others then
      v_user := null;
    end;
  end if;
  
  if v_user is null then
    return false;
  end if;

  -- Check admin.developers table (primary check for Clerk users)
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'admin' and table_name = 'developers'
  ) then
    select exists (
      select 1 from admin.developers d
      where d.clerk_user_id = v_user
        and (d.is_active is null or d.is_active = true)
    ) into v_is_dev;
    
    if v_is_dev then
      return true;
    end if;
  end if;

  -- Fallback: check public.profiles (legacy auth)
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    select exists (
      select 1 from public.profiles p
      where (p.clerk_user_id = v_user or p.user_id::text = v_user)
        and p.role = 'developer'
    ) into v_is_dev;
  end if;

  return coalesce(v_is_dev, false);
end;
$$;


-- 5) Reload PostgREST schema cache
-- ============================================================================

notify pgrst, 'reload schema';


-- ============================================================================
-- DONE - All developer console RPCs are now created/updated
-- ============================================================================
