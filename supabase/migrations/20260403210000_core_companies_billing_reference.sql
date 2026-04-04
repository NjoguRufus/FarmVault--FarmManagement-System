-- Company PayBill account reference for STK AccountReference / manual PayBill.
-- Uses md5(id) prefix so every company gets a unique value (UUID-first-8 can collide).

begin;

alter table core.companies
  add column if not exists billing_reference text;

alter table core.companies
  add column if not exists plan text;

update core.companies
set billing_reference = 'FV-' || substr(md5(id::text), 1, 8)
where billing_reference is null;

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
