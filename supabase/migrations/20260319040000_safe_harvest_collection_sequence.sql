-- Safe, forward-only harvest collection sequencing for NEW rows.
-- Tenant-safe + project-safe:
-- - scoped by company_id + project_id
-- - no global backfill
-- - no historical rename/update

begin;

-- A) Add column only if missing (NEW rows can store sequence; old rows untouched)
alter table harvest.harvest_collections
  add column if not exists sequence_number integer;

-- B) Safe indexes only if missing
create index if not exists idx_harvest_collections_project_sequence
  on harvest.harvest_collections (project_id, sequence_number);

create index if not exists idx_harvest_collections_company_project_sequence
  on harvest.harvest_collections (company_id, project_id, sequence_number);

-- C) Read-only preview function (scoped)
create or replace function harvest.preview_next_collection_sequence(
  p_project_id uuid,
  p_company_id uuid default null
)
returns table(next_sequence integer, preview_name text)
language plpgsql
security definer
set search_path = public, harvest
as $$
declare
  v_company_id uuid;
  v_project_exists uuid;
  v_max_seq integer;
  v_count_rows integer;
  v_next integer;
  v_mod100 integer;
  v_mod10 integer;
  v_suffix text;
begin
  v_company_id := coalesce(p_company_id, core.current_company_id());
  if v_company_id is null then
    raise exception 'No active company selected';
  end if;

  if not core.is_company_member(v_company_id) then
    raise exception 'Not authorized for company %', v_company_id;
  end if;

  select p.id
    into v_project_exists
  from projects.projects p
  where p.id = p_project_id
    and p.company_id = v_company_id;

  if v_project_exists is null then
    raise exception 'Project not found or not in current company';
  end if;

  select
    coalesce(max(hc.sequence_number), 0),
    count(*)
    into v_max_seq, v_count_rows
  from harvest.harvest_collections hc
  where hc.project_id = p_project_id
    and hc.company_id = v_company_id;

  -- Forward-safe without touching legacy rows:
  -- if old rows have null sequence_number, count keeps sequence moving forward.
  v_next := greatest(v_max_seq, v_count_rows) + 1;

  v_mod100 := v_next % 100;
  v_mod10 := v_next % 10;
  if v_mod100 between 11 and 13 then
    v_suffix := 'th';
  elsif v_mod10 = 1 then
    v_suffix := 'st';
  elsif v_mod10 = 2 then
    v_suffix := 'nd';
  elsif v_mod10 = 3 then
    v_suffix := 'rd';
  else
    v_suffix := 'th';
  end if;

  next_sequence := v_next;
  preview_name := format('test %s%s Harvest', v_next, v_suffix);

  return next;
end;
$$;

-- C) Create function (single-row insert, concurrency-safe with advisory lock)
create or replace function harvest.create_collection(
  p_project_id uuid,
  p_company_id uuid default null,
  p_custom_name text default null,
  p_collection_date date default current_date,
  p_picker_price_per_unit numeric default 20,
  p_crop_type text default 'french_beans'
)
returns harvest.harvest_collections
language plpgsql
security definer
set search_path = public, harvest
as $$
declare
  v_company_id uuid;
  v_project_exists uuid;
  v_max_seq integer;
  v_count_rows integer;
  v_next integer;
  v_auto_name text;
  v_final_name text;
  v_mod100 integer;
  v_mod10 integer;
  v_suffix text;
  v_row harvest.harvest_collections%rowtype;
begin
  v_company_id := coalesce(p_company_id, core.current_company_id());
  if v_company_id is null then
    raise exception 'No active company selected';
  end if;

  if not core.is_company_member(v_company_id) then
    raise exception 'Not authorized for company %', v_company_id;
  end if;

  select p.id
    into v_project_exists
  from projects.projects p
  where p.id = p_project_id
    and p.company_id = v_company_id;

  if v_project_exists is null then
    raise exception 'Project not found or not in current company';
  end if;

  -- Project-scoped lock to prevent duplicate sequence under concurrency.
  perform pg_advisory_xact_lock(hashtext(v_company_id::text || ':' || p_project_id::text));

  select
    coalesce(max(hc.sequence_number), 0),
    count(*)
    into v_max_seq, v_count_rows
  from harvest.harvest_collections hc
  where hc.project_id = p_project_id
    and hc.company_id = v_company_id;

  v_next := greatest(v_max_seq, v_count_rows) + 1;

  v_mod100 := v_next % 100;
  v_mod10 := v_next % 10;
  if v_mod100 between 11 and 13 then
    v_suffix := 'th';
  elsif v_mod10 = 1 then
    v_suffix := 'st';
  elsif v_mod10 = 2 then
    v_suffix := 'nd';
  elsif v_mod10 = 3 then
    v_suffix := 'rd';
  else
    v_suffix := 'th';
  end if;

  v_auto_name := format('test %s%s Harvest', v_next, v_suffix);

  v_final_name := coalesce(nullif(trim(p_custom_name), ''), v_auto_name);

  insert into harvest.harvest_collections (
    company_id,
    project_id,
    crop_type,
    collection_date,
    unit,
    buyer_price_per_unit,
    is_closed,
    price_per_kg,
    picker_price_per_unit,
    notes,
    sequence_number,
    status
  )
  values (
    v_company_id,
    p_project_id,
    coalesce(nullif(trim(p_crop_type), ''), 'french_beans'),
    coalesce(p_collection_date, current_date),
    'kg',
    null,
    false,
    null,
    coalesce(p_picker_price_per_unit, 20),
    v_final_name,
    v_next,
    'open'
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function harvest.preview_next_collection_sequence(uuid, uuid) to authenticated;
grant execute on function harvest.create_collection(uuid, uuid, text, date, numeric, text) to authenticated;

commit;

