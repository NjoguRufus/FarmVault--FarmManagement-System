-- Season challenges for developer company view: load inside the same text-param RPC as farm intelligence.
-- Avoids a second PostgREST /rpc/* call (stale uuid overloads on older function names caused uuid "" errors).

create or replace function public.get_developer_company_farm_intelligence_text(p_company_id text)
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
  v_key text;
  v_challenges jsonb;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_trim := nullif(trim(coalesce(p_company_id, '')), '');
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

  v_key := replace(lower(v_trim), '-', '');
  if v_key = '' or to_regclass('public.season_challenges') is null then
    v_challenges := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
    into v_challenges
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
        sc.updated_at
      from public.season_challenges sc
      where replace(lower(trim(coalesce(sc.company_id, ''))), '-', '') = v_key
      order by sc.created_at desc nulls last
      limit 500
    ) s;
  end if;

  return coalesce(v_inner, '{}'::jsonb) || jsonb_build_object('season_challenges', coalesce(v_challenges, '[]'::jsonb));
end;
$$;

grant execute on function public.get_developer_company_farm_intelligence_text(text) to authenticated;

notify pgrst, 'reload schema';
