-- Ensure every company has billing_reference (STK / PayBill). Safe to re-run.

begin;

update core.companies
set billing_reference = 'FV-' || substr(md5(id::text), 1, 8)
where billing_reference is null
   or btrim(billing_reference) = '';

commit;

notify pgrst, 'reload schema';
