-- V1 optimistic concurrency: row_version + bump trigger on inventory + ops work cards.
-- projects.projects, finance.expenses, harvest.harvest_collections already have row_version
-- and public.fv_bump_row_version from 20260412160000_phase2_soft_delete_audit_row_version.sql.
--
-- Safe: ADD COLUMN IF NOT EXISTS; skip views/non-tables via relkind check; idempotent triggers.

begin;

-- Ensure bump function exists (no-op replace if already applied).
create or replace function public.fv_bump_row_version()
returns trigger
language plpgsql
as $$
begin
  new.row_version := coalesce(old.row_version, 0) + 1;
  return new;
end;
$$;

-- public.inventory_items (base table only)
do $fv$
declare
  r regclass;
  v_kind "char";
begin
  r := to_regclass('public.inventory_items');
  if r is null then
    return;
  end if;
  select c.relkind into v_kind from pg_class c where c.oid = r::oid;
  if v_kind is distinct from 'r' and v_kind is distinct from 'p' then
    return;
  end if;

  execute 'alter table public.inventory_items add column if not exists row_version int not null default 1';

  drop trigger if exists tr_fv_bump_row_version_public_inventory_items on public.inventory_items;
  create trigger tr_fv_bump_row_version_public_inventory_items
    before update on public.inventory_items
    for each row
    execute function public.fv_bump_row_version();
end
$fv$;

-- ops.work_cards (when schema exists in project)
do $fv$
declare
  r regclass;
  v_kind "char";
begin
  r := to_regclass('ops.work_cards');
  if r is null then
    return;
  end if;
  select c.relkind into v_kind from pg_class c where c.oid = r::oid;
  if v_kind is distinct from 'r' and v_kind is distinct from 'p' then
    return;
  end if;

  execute 'alter table ops.work_cards add column if not exists row_version int not null default 1';

  drop trigger if exists tr_fv_bump_row_version_ops_work_cards on ops.work_cards;
  create trigger tr_fv_bump_row_version_ops_work_cards
    before update on ops.work_cards
    for each row
    execute function public.fv_bump_row_version();
end
$fv$;

commit;

notify pgrst, 'reload schema';
