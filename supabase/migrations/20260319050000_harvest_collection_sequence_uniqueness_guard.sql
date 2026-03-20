-- Prevent future duplicate harvest collection sequences.
-- Safety:
-- - no historical row rewrites
-- - no global tenant mutation
-- - only hardens NEW inserts/updates

begin;

-- 1) Strengthen create RPC: serialize per company+project and retry on unique conflict.
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
  v_attempt int := 0;
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
    and p.company_id = v_company_id
  for update;

  if v_project_exists is null then
    raise exception 'Project not found or not in current company';
  end if;

  -- Project-scoped lock to prevent same-sequence races.
  perform pg_advisory_xact_lock(hashtext(v_company_id::text || ':' || p_project_id::text));

  loop
    v_attempt := v_attempt + 1;

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

    begin
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
    exception
      when unique_violation then
        -- If a uniqueness guard exists and we raced, retry with the newly advanced max.
        if v_attempt < 3 then
          continue;
        end if;
        raise;
    end;
  end loop;
end;
$$;

-- 2) Add uniqueness protection for NEW writes where possible.
-- If legacy duplicates exist, skip unique index creation (do NOT rewrite history).
do $$
declare
  v_has_duplicates boolean;
begin
  select exists (
    select 1
    from harvest.harvest_collections hc
    where hc.sequence_number is not null
    group by hc.company_id, hc.project_id, hc.sequence_number
    having count(*) > 1
  ) into v_has_duplicates;

  if not v_has_duplicates then
    create unique index if not exists uq_harvest_collections_company_project_sequence
      on harvest.harvest_collections (company_id, project_id, sequence_number)
      where sequence_number is not null;
  else
    raise notice
      'Skipping unique index uq_harvest_collections_company_project_sequence because legacy duplicates exist. New RPC logic still prevents new duplicates.';
  end if;
end
$$;

-- 3) Scoped duplicate detector (for current project/company repair planning).
create or replace function harvest.list_collection_sequence_duplicates(
  p_project_id uuid,
  p_company_id uuid default null
)
returns table (
  company_id uuid,
  project_id uuid,
  sequence_number integer,
  duplicate_count bigint,
  collection_ids uuid[]
)
language plpgsql
security definer
set search_path = public, harvest
as $$
declare
  v_company_id uuid;
begin
  v_company_id := coalesce(p_company_id, core.current_company_id());
  if v_company_id is null then
    raise exception 'No active company selected';
  end if;

  if not core.is_company_member(v_company_id) then
    raise exception 'Not authorized for company %', v_company_id;
  end if;

  return query
  select
    hc.company_id,
    hc.project_id,
    hc.sequence_number,
    count(*) as duplicate_count,
    array_agg(hc.id order by hc.created_at asc, hc.id asc) as collection_ids
  from harvest.harvest_collections hc
  where hc.project_id = p_project_id
    and hc.company_id = v_company_id
    and hc.sequence_number is not null
  group by hc.company_id, hc.project_id, hc.sequence_number
  having count(*) > 1
  order by hc.sequence_number asc;
end;
$$;

grant execute on function harvest.list_collection_sequence_duplicates(uuid, uuid) to authenticated;

commit;

