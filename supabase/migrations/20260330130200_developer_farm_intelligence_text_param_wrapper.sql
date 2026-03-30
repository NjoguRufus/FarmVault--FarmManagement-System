-- PostgREST coerces RPC args to declared types before the function body runs. An empty or whitespace-only
-- p_company_id becomes invalid for uuid and surfaces as: invalid input syntax for type uuid: "".
-- This wrapper accepts text, normalizes it, then calls the existing uuid implementation (server-side only).

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

  return public.get_developer_company_farm_intelligence(v_cid);
end;
$$;

grant execute on function public.get_developer_company_farm_intelligence_text(text) to authenticated;

notify pgrst, 'reload schema';
