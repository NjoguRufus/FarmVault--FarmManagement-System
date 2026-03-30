-- Stop embedding season_challenges in farm intelligence so the Company Details page can lazy-load
-- them only when the Season Challenges tab is opened (see developer_list_company_season_challenges).

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

  return coalesce(v_inner, '{}'::jsonb);
end;
$$;

grant execute on function public.get_developer_company_farm_intelligence_text(text) to authenticated;

notify pgrst, 'reload schema';
