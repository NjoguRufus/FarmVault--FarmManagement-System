-- Ensure created_by and created_at are always set on insert (defaults may not run in some contexts).
-- Frontend omits these columns; if core.current_user_id() is null, fallback to 'system'.

begin;

create or replace function finance.project_wallet_ledger_set_created()
returns trigger
language plpgsql
security definer
set search_path = finance, core, public
as $$
begin
  if NEW.created_by is null or trim(NEW.created_by) = '' then
    NEW.created_by := coalesce(core.current_user_id(), 'system');
  end if;
  if NEW.created_at is null then
    NEW.created_at := now();
  end if;
  return NEW;
end;
$$;

drop trigger if exists project_wallet_ledger_set_created_trigger on finance.project_wallet_ledger;
create trigger project_wallet_ledger_set_created_trigger
  before insert on finance.project_wallet_ledger
  for each row
  execute function finance.project_wallet_ledger_set_created();

commit;
