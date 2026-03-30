-- PostgREST can still surface `invalid input syntax for type uuid: ""` when a uuid-typed RPC
-- is chosen or when `p_company_id` is bound badly. Unambiguous name + `p_tenant_key text`
-- matches `developer_list_company_season_challenges` / audit RPCs.

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

-- Legacy name: thin forwarder so older clients / cached schemas keep working without duplicating logic.
create or replace function public.get_developer_company_farm_intelligence_text(p_company_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.developer_get_company_farm_intelligence(p_company_id);
$$;

grant execute on function public.get_developer_company_farm_intelligence_text(text) to authenticated;

notify pgrst, 'reload schema';
