-- French Beans Harvest Collections: view for picker totals + RPC overloads (picker_id) + close_collection.
-- Safe to run: idempotent, no drops of existing objects, no CASCADE.
-- Canonical schemas: harvest only; no public.projects.

begin;

-- Optional columns if your DB already has them from context doc (no-op if present)
alter table harvest.picker_intake_entries
  add column if not exists unit text default 'kg';
alter table harvest.picker_payment_entries
  add column if not exists currency text default 'KES';

-- View: per-picker totals for a collection (total_kg, total_due, total_paid, balance)
-- Rate = coalesce(collection.price_per_kg, 20) KES/kg. (If your table has picker_price_per_unit, add it to the table and use coalesce(picker_price_per_unit, price_per_kg, 20).)
create or replace view harvest.collection_picker_totals as
select
  hc.id as collection_id,
  hc.company_id,
  hp.id as picker_id,
  hp.picker_number,
  hp.picker_name,
  coalesce(i.total_quantity, 0) as total_kg,
  coalesce(hc.price_per_kg, 20) as rate_per_kg,
  (coalesce(i.total_quantity, 0) * coalesce(hc.price_per_kg, 20)) as total_due,
  coalesce(p.total_paid, 0) as total_paid,
  greatest((coalesce(i.total_quantity, 0) * coalesce(hc.price_per_kg, 20)) - coalesce(p.total_paid, 0), 0) as balance
from harvest.harvest_collections hc
join harvest.harvest_pickers hp on hp.collection_id = hc.id and hp.company_id = hc.company_id
left join (
  select collection_id, picker_id, sum(quantity) as total_quantity
  from harvest.picker_intake_entries
  group by collection_id, picker_id
) i on i.collection_id = hp.collection_id and i.picker_id = hp.id
left join (
  select collection_id, picker_id, sum(amount_paid) as total_paid
  from harvest.picker_payment_entries
  group by collection_id, picker_id
) p on p.collection_id = hp.collection_id and p.picker_id = hp.id;

comment on view harvest.collection_picker_totals is 'Per-picker totals: total_kg, rate_per_kg, total_due, total_paid, balance (for French beans harvest collections)';

-- RPC: record_intake by picker_id (overload; existing record_intake(collection_id, picker_number, quantity) unchanged)
create or replace function harvest.record_intake(
  p_collection_id uuid,
  p_picker_id uuid,
  p_quantity numeric,
  p_unit text default 'kg'
)
returns void
language plpgsql
security definer
set search_path = core, projects, harvest, public
as $$
declare
  v_company_id uuid;
  v_status text;
  v_collection_company uuid;
  v_picker_company uuid;
begin
  if p_quantity < 0 then
    raise exception 'Quantity cannot be negative';
  end if;

  v_company_id := core.current_company_id();
  if v_company_id is null then
    raise exception 'No active company selected';
  end if;

  if not core.is_company_member(v_company_id) then
    raise exception 'Not authorized for company %', v_company_id;
  end if;

  select company_id, status into v_collection_company, v_status
  from harvest.harvest_collections where id = p_collection_id;

  if v_collection_company is null then
    raise exception 'Collection % not found', p_collection_id;
  end if;

  if v_collection_company <> v_company_id then
    raise exception 'Collection does not belong to current company';
  end if;

  if v_status <> 'open' and v_status is not null then
    raise exception 'Collection % is not open', p_collection_id;
  end if;

  select company_id into v_picker_company
  from harvest.harvest_pickers
  where id = p_picker_id and collection_id = p_collection_id;

  if v_picker_company is null or v_picker_company <> v_company_id then
    raise exception 'Picker % not found or not in this collection', p_picker_id;
  end if;

  insert into harvest.picker_intake_entries (company_id, collection_id, picker_id, quantity, unit, recorded_by)
  values (v_company_id, p_collection_id, p_picker_id, p_quantity, coalesce(nullif(trim(p_unit), ''), 'kg'), core.current_user_id());
end;
$$;

-- RPC: record_payment by picker_id (overload)
create or replace function harvest.record_payment(
  p_collection_id uuid,
  p_picker_id uuid,
  p_amount_paid numeric,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = core, projects, harvest, public
as $$
declare
  v_company_id uuid;
  v_status text;
  v_collection_company uuid;
  v_picker_company uuid;
begin
  if p_amount_paid < 0 then
    raise exception 'Payment amount cannot be negative';
  end if;

  v_company_id := core.current_company_id();
  if v_company_id is null then
    raise exception 'No active company selected';
  end if;

  if not core.is_company_member(v_company_id) then
    raise exception 'Not authorized for company %', v_company_id;
  end if;

  select company_id, status into v_collection_company, v_status
  from harvest.harvest_collections where id = p_collection_id;

  if v_collection_company is null then
    raise exception 'Collection % not found', p_collection_id;
  end if;

  if v_collection_company <> v_company_id then
    raise exception 'Collection does not belong to current company';
  end if;

  if v_status <> 'open' and v_status is not null then
    raise exception 'Collection % is not open', p_collection_id;
  end if;

  select company_id into v_picker_company
  from harvest.harvest_pickers
  where id = p_picker_id and collection_id = p_collection_id;

  if v_picker_company is null or v_picker_company <> v_company_id then
    raise exception 'Picker % not found or not in this collection', p_picker_id;
  end if;

  insert into harvest.picker_payment_entries (company_id, collection_id, picker_id, amount_paid, note, paid_by)
  values (v_company_id, p_collection_id, p_picker_id, p_amount_paid, p_note, core.current_user_id());
end;
$$;

-- RPC: close_collection(collection_id) — set status = 'closed', closed_at = now(); only member + admin or creator
create or replace function harvest.close_collection(p_collection_id uuid)
returns void
language plpgsql
security definer
set search_path = core, projects, harvest, public
as $$
declare
  v_company_id uuid;
  v_current_id text;
begin
  v_company_id := core.current_company_id();
  if v_company_id is null then
    raise exception 'No active company selected';
  end if;

  if not core.is_company_member(v_company_id) then
    raise exception 'Not authorized for company %', v_company_id;
  end if;

  if not (core.is_company_admin(v_company_id) or exists (
    select 1 from harvest.harvest_collections c
    where c.id = p_collection_id and c.company_id = v_company_id and c.created_by = core.current_user_id()
  )) then
    raise exception 'Only admin or collection creator can close collection';
  end if;

  update harvest.harvest_collections
  set status = 'closed', closed_at = now()
  where id = p_collection_id and company_id = v_company_id;

  if not found then
    raise exception 'Collection % not found', p_collection_id;
  end if;
end;
$$;

-- Grants (view uses underlying table RLS when selected by authenticated user)
grant select on harvest.collection_picker_totals to authenticated;
grant execute on function harvest.record_intake(uuid, uuid, numeric, text) to authenticated;
grant execute on function harvest.record_payment(uuid, uuid, numeric, text) to authenticated;
grant execute on function harvest.close_collection(uuid) to authenticated;

commit;
