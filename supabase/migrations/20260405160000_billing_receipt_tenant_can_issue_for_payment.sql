-- Allow authenticated workspace members to issue a receipt for an approved subscription_payment
-- belonging to their company (used by billing-receipt-issue edge fn with tenant JWT).

begin;

create or replace function public.billing_receipt_tenant_can_issue_for_payment(_subscription_payment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscription_payments sp
    where sp.id = _subscription_payment_id
      and sp.status = 'approved'::public.subscription_payment_status
      and public.row_company_matches_user(sp.company_id)
  );
$$;

revoke all on function public.billing_receipt_tenant_can_issue_for_payment(uuid) from public;
grant execute on function public.billing_receipt_tenant_can_issue_for_payment(uuid) to authenticated;
grant execute on function public.billing_receipt_tenant_can_issue_for_payment(uuid) to service_role;

commit;

notify pgrst, 'reload schema';
