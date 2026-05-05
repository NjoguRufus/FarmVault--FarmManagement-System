begin;

-- ===========================================================================
-- Fix employees_permission_preset_check constraint
--
-- The original constraint (migration 20260307000000) only allowed legacy
-- preset names (farm_manager, supervisor, etc.) that no longer match the
-- frontend's TypeScript EmployeeRoleKey / PermissionPresetKey enums.
--
-- This migration replaces the constraint with a unified allowlist covering:
--   • Legacy DB values (backward compat with existing rows)
--   • Current TypeScript preset keys used by the UI
--   • Role keys sent by useAddEmployeeForm / addEmployee
-- ===========================================================================

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
        -- ── Legacy preset names (pre-refactor; keep for existing rows) ──
        'admin',
        'farm_manager',
        'supervisor',
        'weighing_clerk',
        'finance_officer',
        'inventory_officer',
        'viewer',

        -- ── Current EmployeeRoleKey values (accessControl.ts) ──
        'operations-manager',
        'sales-broker',

        -- ── Current PermissionPresetKey values (permissions.ts) ──
        'inventory-clerk',
        'finance-clerk',
        'operations-staff',
        'harvest-intake-staff',
        'manager',
        'full-access',

        -- ── Catch-all for custom permission sets ──
        'custom'
      )
    );
end $$;

commit;
