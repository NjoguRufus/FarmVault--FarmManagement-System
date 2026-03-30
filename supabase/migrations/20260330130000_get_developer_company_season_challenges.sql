-- Developer read path for season_challenges: bypasses tenant RLS (same gate as get_developer_company_farm_intelligence).
-- Direct PostgREST selects on public.season_challenges still use RLS; row_company_matches_user() only matches the
-- viewer's current_company_id(), so platform developers browsing another tenant often saw zero rows.
--
-- Argument is TEXT (not uuid): PostgREST validates uuid parameters before the function body runs, so "" from the
-- client caused "invalid input syntax for type uuid".

create or replace function public.get_developer_company_season_challenges(p_company_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin
as $$
declare
  v_out jsonb;
  v_key text;
begin
  if not admin.is_developer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_key := replace(lower(trim(coalesce(p_company_id, ''))), '-', '');
  if v_key = '' then
    return '[]'::jsonb;
  end if;

  if to_regclass('public.season_challenges') is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
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
      sc.updated_at
    from public.season_challenges sc
    where replace(lower(trim(coalesce(sc.company_id, ''))), '-', '') = v_key
    order by sc.created_at desc nulls last
    limit 500
  ) s;

  return coalesce(v_out, '[]'::jsonb);
end;
$$;

grant execute on function public.get_developer_company_season_challenges(text) to authenticated;

notify pgrst, 'reload schema';
