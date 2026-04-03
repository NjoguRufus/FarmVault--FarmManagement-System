-- Fix developer notebook save after membership-based RLS change.
-- Use fv_is_developer() compatibility helper (handles schema drift) instead of public.is_developer().

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
  public.fv_is_developer()
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
  public.fv_is_developer()
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
  public.fv_is_developer()
  or (
    company_id is not null
    and core.is_company_member(company_id)
  )
)
with check (
  public.fv_is_developer()
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
  public.fv_is_developer()
  or (
    company_id is not null
    and core.is_company_member(company_id)
  )
);

commit;

notify pgrst, 'reload schema';

