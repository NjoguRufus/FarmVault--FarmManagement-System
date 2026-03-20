-- Harvest Collections smart auto-naming sequence
-- Adds:
-- - harvest.harvest_collections.sequence_number (project-specific)
-- - harvest.harvest_collection_sequence_counters (forward-only counter; does not reuse deleted numbers)
-- - RPCs:
--    - harvest.preview_next_harvest_collection_sequence(p_project_id uuid) -> integer (no increment)
--    - harvest.allocate_next_harvest_collection_sequence(p_project_id uuid) -> integer (increments + returns)
--
-- Safe/idempotent: no drops, only adds/updates.

begin;

-- 1) Column on canonical table
alter table harvest.harvest_collections
  add column if not exists sequence_number integer;

-- 2) Backfill any existing NULLs (best-effort ordering, per project)
with ranked as (
  select
    hc.id,
    row_number() over (
      partition by hc.project_id
      order by hc.collection_date asc, hc.created_at asc, hc.id asc
    ) as seq
  from harvest.harvest_collections hc
  where hc.sequence_number is null
)
update harvest.harvest_collections hc
set sequence_number = ranked.seq
from ranked
where hc.id = ranked.id;

-- 3) Forward-only per-project counter (does not reuse deleted numbers)
create table if not exists harvest.harvest_collection_sequence_counters (
  project_id uuid primary key references projects.projects(id) on delete cascade,
  last_sequence_number integer not null default 0,
  updated_at timestamptz not null default now()
);

-- 4) Initialize counters to the current max sequence_number (from backfill above)
insert into harvest.harvest_collection_sequence_counters (project_id, last_sequence_number, updated_at)
select
  hc.project_id,
  coalesce(max(hc.sequence_number), 0) as last_sequence_number,
  now() as updated_at
from harvest.harvest_collections hc
group by hc.project_id
on conflict (project_id) do update
set last_sequence_number = greatest(
    harvest.harvest_collection_sequence_counters.last_sequence_number,
    excluded.last_sequence_number
  ),
  updated_at = now();

-- 5) RPC: preview next sequence number (read-only)
create or replace function harvest.preview_next_harvest_collection_sequence(p_project_id uuid)
returns integer
language plpgsql
security definer
set search_path = core, projects, harvest, public
as $$
declare
  v_company_id uuid;
  v_project_company uuid;
  v_last integer;
  v_next integer;
begin
  v_company_id := core.current_company_id();
  if v_company_id is null then
    raise exception 'No active company selected';
  end if;

  if not core.is_company_member(v_company_id) then
    raise exception 'Not authorized for company %', v_company_id;
  end if;

  select company_id into v_project_company
  from projects.projects
  where id = p_project_id;

  if v_project_company is null or v_project_company <> v_company_id then
    raise exception 'Project not found or not in current company';
  end if;

  select last_sequence_number into v_last
  from harvest.harvest_collection_sequence_counters
  where project_id = p_project_id;

  if v_last is null then
    v_next := 1;
  else
    v_next := v_last + 1;
  end if;

  return v_next;
end;
$$;

-- 6) RPC: allocate next sequence number (increments; forward-only)
create or replace function harvest.allocate_next_harvest_collection_sequence(p_project_id uuid)
returns integer
language plpgsql
security definer
set search_path = core, projects, harvest, public
as $$
declare
  v_company_id uuid;
  v_project_company uuid;
  v_last integer;
  v_next integer;
begin
  v_company_id := core.current_company_id();
  if v_company_id is null then
    raise exception 'No active company selected';
  end if;

  if not core.is_company_member(v_company_id) then
    raise exception 'Not authorized for company %', v_company_id;
  end if;

  select company_id into v_project_company
  from projects.projects
  where id = p_project_id;

  if v_project_company is null or v_project_company <> v_company_id then
    raise exception 'Project not found or not in current company';
  end if;

  -- Ensure counter row exists.
  insert into harvest.harvest_collection_sequence_counters (project_id, last_sequence_number, updated_at)
  values (p_project_id, 0, now())
  on conflict (project_id) do nothing;

  -- Lock the row to avoid races between concurrent creators.
  select last_sequence_number into v_last
  from harvest.harvest_collection_sequence_counters
  where project_id = p_project_id
  for update;

  v_last := coalesce(v_last, 0);
  v_next := v_last + 1;

  update harvest.harvest_collection_sequence_counters
  set last_sequence_number = v_next,
      updated_at = now()
  where project_id = p_project_id;

  return v_next;
end;
$$;

grant execute on function harvest.preview_next_harvest_collection_sequence(uuid) to authenticated;
grant execute on function harvest.allocate_next_harvest_collection_sequence(uuid) to authenticated;

commit;

