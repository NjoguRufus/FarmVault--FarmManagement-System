-- PostgREST can still coerce some single text RPC args to uuid in edge cases. A single jsonb payload
-- avoids per-argument uuid parsing entirely.

create or replace function public.developer_season_challenges_for_company_json(p_payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, admin
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

  v_key := replace(lower(v_raw), '-', '');
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

grant execute on function public.developer_season_challenges_for_company_json(jsonb) to authenticated;

notify pgrst, 'reload schema';
