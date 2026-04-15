begin;

-- Safety: ensure required table/column exist.
do $$
begin
  if to_regclass('projects.farms') is null then
    raise exception 'projects.farms table not found. Apply farms migration first.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'projects'
      and table_name = 'projects'
      and column_name = 'farm_id'
  ) then
    raise exception 'projects.projects.farm_id column not found. Apply farms migration first.';
  end if;
end
$$;

-- For companies that still have projects with NULL farm_id and no farms yet,
-- create a lightweight legacy farm so old data remains usable.
insert into projects.farms (
  company_id,
  name,
  location,
  ownership_type
)
select distinct
  p.company_id,
  'Legacy Farm',
  'Unspecified',
  'owned'
from projects.projects p
where p.farm_id is null
  and not exists (
    select 1
    from projects.farms f
    where f.company_id = p.company_id
  )
on conflict do nothing;

-- Backfill all legacy projects (including archived/deleted rows) with a farm.
update projects.projects p
set farm_id = (
  select f.id
  from projects.farms f
  where f.company_id = p.company_id
  order by f.created_at asc
  limit 1
)
where p.farm_id is null;

-- Abort if any rows are still NULL (protects from partial/unsafe enforcement).
do $$
declare
  v_remaining bigint;
begin
  select count(*) into v_remaining
  from projects.projects
  where farm_id is null;

  if v_remaining > 0 then
    raise exception
      'Backfill incomplete: % projects still have NULL farm_id. NOT NULL constraint not applied.',
      v_remaining;
  end if;
end
$$;

-- Enforce farm linkage for all projects going forward.
alter table projects.projects
  alter column farm_id set not null;

commit;
