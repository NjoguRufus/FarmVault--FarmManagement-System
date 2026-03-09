begin;

-- =====================================================
-- Allow 'draft' status for employees
-- =====================================================

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'employees_status_check'
      and conrelid = 'public.employees'::regclass
  ) then
    alter table public.employees
      drop constraint employees_status_check;
  end if;
end $$;

alter table public.employees
  add constraint employees_status_check
  check (status in ('draft', 'invited', 'active', 'suspended', 'archived'));

commit;

