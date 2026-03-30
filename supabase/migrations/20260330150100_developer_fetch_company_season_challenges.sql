-- PostgREST can still coerce or resolve `developer_list_company_season_challenges` badly and throw
-- `invalid input syntax for type uuid: ""`. Canonical read path: new name, text-only, no historical uuid overload.

drop function if exists public.developer_list_company_season_challenges(uuid);
drop function if exists public.developer_fetch_company_season_challenges(uuid);

create or replace function public.developer_fetch_company_season_challenges(p_tenant_key text)
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

  v_key := replace(lower(trim(coalesce(p_tenant_key, ''))), '-', '');
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

grant execute on function public.developer_fetch_company_season_challenges(text) to authenticated;

-- Legacy RPC name: forwarder only (keeps older PostgREST paths working once schema reloads).
create or replace function public.developer_list_company_season_challenges(p_tenant_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.developer_fetch_company_season_challenges(p_tenant_key);
$$;

grant execute on function public.developer_list_company_season_challenges(text) to authenticated;

notify pgrst, 'reload schema';
