-- Fix: set_payment_billing_reference() compared core.companies.id (uuid) to
-- subscription_payments.company_id (text) → ERROR: operator does not exist: uuid = text

begin;

alter table public.subscription_payments
  add column if not exists billing_reference text;

create or replace function public.set_payment_billing_reference()
returns trigger
language plpgsql
security definer
set search_path = public, core, admin
as $$
declare
  v_ref text;
begin
  if new.company_id is null or btrim(new.company_id) = '' then
    return new;
  end if;

  select nullif(btrim(c.billing_reference::text), '')
    into v_ref
  from core.companies c
  where lower(btrim(c.id::text)) = lower(btrim(new.company_id))
  limit 1;

  if v_ref is not null then
    new.billing_reference := v_ref;
  end if;

  return new;
end;
$$;

comment on function public.set_payment_billing_reference() is
  'Before insert/update on subscription_payments: copy core.companies.billing_reference; company_id is text.';

commit;

notify pgrst, 'reload schema';
