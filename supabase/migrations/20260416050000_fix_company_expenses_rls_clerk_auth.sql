begin;

alter table public.company_expenses
  alter column user_id drop default;

drop policy if exists company_expenses_select_owner_or_developer on public.company_expenses;
create policy company_expenses_select_owner_or_developer
on public.company_expenses
for select
to authenticated
using (
  public.is_developer()
);

drop policy if exists company_expenses_insert_owner_or_developer on public.company_expenses;
create policy company_expenses_insert_owner_or_developer
on public.company_expenses
for insert
to authenticated
with check (
  public.is_developer()
);

drop policy if exists company_expenses_update_owner_or_developer on public.company_expenses;
create policy company_expenses_update_owner_or_developer
on public.company_expenses
for update
to authenticated
using (
  public.is_developer()
)
with check (
  public.is_developer()
);

drop policy if exists company_expenses_delete_owner_or_developer on public.company_expenses;
create policy company_expenses_delete_owner_or_developer
on public.company_expenses
for delete
to authenticated
using (
  public.is_developer()
);

commit;

notify pgrst, 'reload schema';
