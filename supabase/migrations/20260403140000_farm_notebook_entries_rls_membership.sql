-- farm_notebook_entries RLS used:
--   company_id = coalesce(core.current_company_id(), (auth.jwt() ->> 'company_id')::uuid)
-- That fails when profiles.active_company_id is stale vs. the company the app resolved (e.g. dual
-- company + ambassador users), or when core.current_company_id() is null and JWT company_id is
-- missing/invalid (uuid cast / 22P02). Align with harvest/finance: membership on the row's company.

begin;

drop policy if exists "farm_notebook_entries_select_company" on public.farm_notebook_entries;
drop policy if exists "farm_notebook_entries_insert_company" on public.farm_notebook_entries;
drop policy if exists "farm_notebook_entries_update_company" on public.farm_notebook_entries;
drop policy if exists "farm_notebook_entries_delete_company" on public.farm_notebook_entries;

create policy "farm_notebook_entries_select_company"
on public.farm_notebook_entries
for select
to authenticated
using (
  public.is_developer()
  or (
    company_id is not null
    and core.is_company_member(company_id)
  )
);

create policy "farm_notebook_entries_insert_company"
on public.farm_notebook_entries
for insert
to authenticated
with check (
  public.is_developer()
  or (
    company_id is not null
    and core.is_company_member(company_id)
  )
);

create policy "farm_notebook_entries_update_company"
on public.farm_notebook_entries
for update
to authenticated
using (
  public.is_developer()
  or (
    company_id is not null
    and core.is_company_member(company_id)
  )
)
with check (
  public.is_developer()
  or (
    company_id is not null
    and core.is_company_member(company_id)
  )
);

create policy "farm_notebook_entries_delete_company"
on public.farm_notebook_entries
for delete
to authenticated
using (
  public.is_developer()
  or (
    company_id is not null
    and core.is_company_member(company_id)
  )
);

commit;

notify pgrst, 'reload schema';
