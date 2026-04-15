begin;

-- Fix suppliers insert failures under Clerk sessions:
-- auth.uid() expects UUID sub and throws 22P02 for Clerk-style IDs (user_*).
-- Use core.current_user_id() / core.current_company_id() instead.

alter table if exists public.suppliers enable row level security;

drop policy if exists suppliers_policy on public.suppliers;
create policy suppliers_policy
  on public.suppliers
  for all
  using (
    public.is_developer()
    or company_id::text = core.current_company_id()::text
  )
  with check (
    nullif(trim(coalesce(core.current_user_id(), '')), '') is not null
    and (
      company_id::text = core.current_company_id()::text
      or public.is_developer()
    )
  );

commit;

notify pgrst, 'reload schema';
