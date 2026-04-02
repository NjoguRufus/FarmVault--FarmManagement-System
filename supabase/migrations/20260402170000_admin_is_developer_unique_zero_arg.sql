-- Fix 42725: "function admin.is_developer() is not unique"
--
-- PostgreSQL cannot remove a parameter DEFAULT via CREATE OR REPLACE (42P13).
-- The uuid overload must be dropped and recreated without DEFAULT. RLS policies
-- reference that overload, so we drop policies → drop function → create function → recreate policies.
--
-- Policies listed here match pg_depend errors when dropping admin.is_developer(uuid).

begin;

-- ---------------------------------------------------------------------------
-- 1) Drop dependent RLS policies (ignore missing tables in partial environments)
-- ---------------------------------------------------------------------------
do $drop_policies$
begin
  begin
    drop policy if exists farmvault_expenses_dev_all on developer.farmvault_expenses;
  exception when undefined_table then null;
  end;
  begin
    drop policy if exists system_backups_dev_all on developer.system_backups;
  exception when undefined_table then null;
  end;
  begin
    drop policy if exists code_red_incidents_dev_all on developer.code_red_incidents;
  exception when undefined_table then null;
  end;
  begin
    drop policy if exists code_red_notes_dev_all on developer.code_red_notes;
  exception when undefined_table then null;
  end;
  begin
    drop policy if exists company_records_outbox_dev_all on developer.company_records_outbox;
  exception when undefined_table then null;
  end;
  begin
    drop policy if exists dev_read_company_migrations on admin.company_migrations;
  exception when undefined_table then null;
  end;
  begin
    drop policy if exists dev_insert_company_migrations on admin.company_migrations;
  exception when undefined_table then null;
  end;
  begin
    drop policy if exists dev_update_company_migrations on admin.company_migrations;
  exception when undefined_table then null;
  end;
  begin
    drop policy if exists dev_read_company_migration_items on admin.company_migration_items;
  exception when undefined_table then null;
  end;
  begin
    drop policy if exists dev_insert_company_migration_items on admin.company_migration_items;
  exception when undefined_table then null;
  end;
  begin
    drop policy if exists developer_delete_audit_select on admin.developer_delete_audit;
  exception when undefined_table then null;
  end;
  begin
    drop policy if exists reset_users_select_developer on admin.reset_users;
  exception when undefined_table then null;
  end;
  begin
    drop policy if exists email_logs_select_developer on public.email_logs;
  exception when undefined_table then null;
  end;
end;
$drop_policies$;

-- ---------------------------------------------------------------------------
-- 2) Drop uuid overload (no-arg is_developer() remains)
-- ---------------------------------------------------------------------------
drop function if exists admin.is_developer(uuid);

-- ---------------------------------------------------------------------------
-- 3) Recreate uuid overload WITHOUT DEFAULT (legacy admin.developers.user_id)
-- ---------------------------------------------------------------------------
create or replace function admin.is_developer(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, admin, core
as $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'admin'
      and table_name = 'developers'
      and column_name = 'user_id'
  ) then
    return false;
  end if;

  return exists (
    select 1
    from admin.developers d
    where d.user_id = p_user_id
      and (d.is_active is null or d.is_active = true)
  );
end;
$$;

grant execute on function admin.is_developer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Recreate policies (same definitions as original migrations)
-- ---------------------------------------------------------------------------
do $recreate_policies$
begin
  if to_regclass('developer.farmvault_expenses') is not null then
    create policy farmvault_expenses_dev_all
    on developer.farmvault_expenses
    for all
    to authenticated
    using (admin.is_developer(auth.uid()))
    with check (admin.is_developer(auth.uid()));
  end if;

  if to_regclass('developer.system_backups') is not null then
    create policy system_backups_dev_all
    on developer.system_backups
    for all
    to authenticated
    using (admin.is_developer(auth.uid()))
    with check (admin.is_developer(auth.uid()));
  end if;

  if to_regclass('developer.code_red_incidents') is not null then
    create policy code_red_incidents_dev_all
    on developer.code_red_incidents
    for all
    to authenticated
    using (admin.is_developer(auth.uid()))
    with check (admin.is_developer(auth.uid()));
  end if;

  if to_regclass('developer.code_red_notes') is not null then
    create policy code_red_notes_dev_all
    on developer.code_red_notes
    for all
    to authenticated
    using (admin.is_developer(auth.uid()))
    with check (admin.is_developer(auth.uid()));
  end if;

  if to_regclass('developer.company_records_outbox') is not null then
    create policy company_records_outbox_dev_all
    on developer.company_records_outbox
    for all
    to authenticated
    using (admin.is_developer(auth.uid()))
    with check (admin.is_developer(auth.uid()));
  end if;

  if to_regclass('admin.company_migrations') is not null then
    create policy dev_read_company_migrations on admin.company_migrations
      for select using (admin.is_developer(auth.uid()));
    create policy dev_insert_company_migrations on admin.company_migrations
      for insert with check (admin.is_developer(auth.uid()));
    create policy dev_update_company_migrations on admin.company_migrations
      for update using (admin.is_developer(auth.uid()));
  end if;

  if to_regclass('admin.company_migration_items') is not null then
    create policy dev_read_company_migration_items on admin.company_migration_items
      for select using (admin.is_developer(auth.uid()));
    create policy dev_insert_company_migration_items on admin.company_migration_items
      for insert with check (admin.is_developer(auth.uid()));
  end if;

  if to_regclass('admin.developer_delete_audit') is not null then
    create policy developer_delete_audit_select on admin.developer_delete_audit
      for select to authenticated using (admin.is_developer(auth.uid()));
  end if;

  if to_regclass('admin.reset_users') is not null then
    create policy reset_users_select_developer
    on admin.reset_users
    for select
    to authenticated
    using (admin.is_developer(auth.uid()));
  end if;

  if to_regclass('public.email_logs') is not null then
    create policy email_logs_select_developer
      on public.email_logs
      for select
      to authenticated
      using (public.is_developer());
  end if;
end;
$recreate_policies$;

commit;

notify pgrst, 'reload schema';
