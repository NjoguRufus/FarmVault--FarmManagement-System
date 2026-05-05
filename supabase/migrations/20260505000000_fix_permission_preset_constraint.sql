begin;

-- Drop the old employees_permission_preset_check constraint that only allowed
-- legacy preset names (farm_manager, supervisor, etc.) and add an updated one
-- that also includes the current frontend role keys (operations-manager, sales-broker).

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'employees_permission_preset_check'
  ) then
    alter table public.employees
      drop constraint employees_permission_preset_check;
  end if;

  alter table public.employees
    add constraint employees_permission_preset_check
    check (
      permission_preset in (
        -- legacy presets (keep for backward compat with existing rows)
        'admin',
        'farm_manager',
        'supervisor',
        'weighing_clerk',
        'finance_officer',
        'inventory_officer',
        'viewer',
        -- current frontend role keys
        'operations-manager',
        'sales-broker',
        -- catch-all
        'custom'
      )
    );
end $$;

commit;
