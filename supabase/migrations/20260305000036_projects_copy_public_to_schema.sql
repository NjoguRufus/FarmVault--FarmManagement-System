-- One-time copy: public.projects -> projects.projects (preserve id).
-- Run only when public.projects exists; skip rows that already exist in projects.projects.
-- RLS on projects.projects (SELECT where core.is_company_member(company_id)) is already in 20260305000030.

begin;

do $$
declare
  v_copied int;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'projects'
  ) then
    return;
  end if;

  insert into projects.projects (
    id,
    company_id,
    name,
    crop_type,
    environment,
    status,
    planting_date,
    expected_harvest_date,
    expected_end_date,
    field_size,
    field_unit,
    notes,
    created_by,
    created_at,
    updated_at
  )
  select
    p.id,
    c.id,
    p.name,
    coalesce(p.crop_type, 'Other'),
    coalesce(
      case when p.environment_type is not null then p.environment_type::text else null end,
      'open_field'
    ),
    coalesce(
      case when p.status is not null then p.status::text else null end,
      'active'
    ),
    coalesce(p.planting_date, p.start_date, current_date),
    p.end_date,
    p.end_date,
    p.acreage,
    'acres',
    nullif(trim(p.location), ''),
    'migration',
    p.created_at,
    coalesce(p.updated_at, p.created_at)
  from public.projects p
  inner join core.companies c on c.id::text = p.company_id::text
  where not exists (select 1 from projects.projects pp where pp.id = p.id)
    and p.company_id is not null
    and p.id is not null;

  get diagnostics v_copied = row_count;

  if v_copied > 0 and exists (
    select 1 from information_schema.columns
    where table_schema = 'projects' and table_name = 'projects' and column_name = 'planning'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'projects' and column_name = 'planning'
  ) then
    update projects.projects pp
    set planning = p.planning
    from public.projects p
    where pp.id = p.id and p.planning is not null;
  end if;
  if v_copied > 0 then
    raise notice 'Copied % rows from public.projects to projects.projects', v_copied;
  end if;

exception
  when others then
    -- Column or type mismatch: skip copy (e.g. public.projects has different shape)
    raise notice 'Copy public.projects -> projects.projects skipped or partial: %', sqlerrm;
end $$;

commit;
