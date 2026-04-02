-- Allow company members (not only admins) to update and delete picker intake entries.
-- The app already restricts edit/delete UI by harvest_collections.edit and harvest_collections.delete permissions.
-- Staff with those permissions should be able to fix wrong entries.

drop policy if exists picker_intake_update_admin on harvest.picker_intake_entries;
drop policy if exists picker_intake_delete_admin on harvest.picker_intake_entries;
drop policy if exists picker_intake_update_member on harvest.picker_intake_entries;
drop policy if exists picker_intake_delete_member on harvest.picker_intake_entries;

create policy picker_intake_update_member
  on harvest.picker_intake_entries
  for update
  using (core.is_company_member(company_id))
  with check (core.is_company_member(company_id));

create policy picker_intake_delete_member
  on harvest.picker_intake_entries
  for delete
  using (core.is_company_member(company_id));
