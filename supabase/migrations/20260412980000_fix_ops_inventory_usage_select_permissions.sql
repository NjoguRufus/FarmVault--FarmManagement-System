begin;

-- Ensure authenticated role can access ops inventory usage rows.
grant usage on schema ops to authenticated;
grant select on table ops.work_card_inventory_usage to authenticated;

-- Keep RLS enabled and guarantee a SELECT policy exists.
alter table if exists ops.work_card_inventory_usage enable row level security;

drop policy if exists work_card_inventory_usage_select on ops.work_card_inventory_usage;
create policy work_card_inventory_usage_select on ops.work_card_inventory_usage
  for select
  using (true);

commit;

notify pgrst, 'reload schema';
