-- Repair: ensure column exists, unique md5-based references, unique index, insert trigger.
-- Safe if 20260403210000 never ran (column missing) or only the UPDATE failed (duplicates).

begin;

alter table core.companies
  add column if not exists billing_reference text;

alter table core.companies
  add column if not exists plan text;

update core.companies
set billing_reference = 'FV-' || substr(md5(id::text), 1, 8);

drop index if exists companies_billing_reference_idx;

create unique index if not exists companies_billing_reference_idx
  on core.companies (billing_reference)
  where billing_reference is not null;

create or replace function core.set_billing_reference()
returns trigger
language plpgsql
as $$
begin
  if new.billing_reference is null or btrim(new.billing_reference) = '' then
    new.billing_reference := 'FV-' || substr(md5(new.id::text), 1, 8);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_billing_reference on core.companies;

create trigger trg_set_billing_reference
  before insert on core.companies
  for each row
  execute procedure core.set_billing_reference();

comment on column core.companies.billing_reference is
  'PayBill account number (FV- + 8 hex from md5(company id)); unique; max 11 chars for Daraja.';

commit;

notify pgrst, 'reload schema';
