-- PostgREST can still bind older RPC names to stale (uuid) overloads. This name is unique: one text arg only.

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
      pr.name as project_name
    from public.season_challenges sc
    left join projects.projects pr on pr.id = sc.project_id
    where replace(lower(trim(coalesce(sc.company_id, ''))), '-', '') = v_key
    order by sc.created_at desc nulls last
    limit 500
  ) s;

  return coalesce(v_out, '[]'::jsonb);
end;
$$;

grant execute on function public.fv_developer_company_season_challenges(text) to authenticated;

notify pgrst, 'reload schema';
