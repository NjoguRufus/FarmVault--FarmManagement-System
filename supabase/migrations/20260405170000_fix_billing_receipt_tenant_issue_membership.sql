-- Allow receipt issuance when the caller is a member of the payment's company,
-- not only when core.current_company_id() matches (fixes 403 for valid billing users).

begin;

create or replace function public.billing_receipt_tenant_can_issue_for_payment(_subscription_payment_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, core
as $$
declare
  v_uid text;
  v_raw text;
  v_cid uuid;
begin
  v_uid := core.current_user_id();
  if v_uid is null then
    return false;
  end if;

  select trim(sp.company_id)
  into v_raw
  from public.subscription_payments sp
  where sp.id = _subscription_payment_id
    and sp.status = 'approved'::public.subscription_payment_status;

  if v_raw is null or v_raw = '' then
    return false;
  end if;

  begin
    v_cid := v_raw::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  return exists (
    select 1
    from core.company_members cm
    where cm.company_id = v_cid
      and cm.clerk_user_id = v_uid
  );
end;
$$;

revoke all on function public.billing_receipt_tenant_can_issue_for_payment(uuid) from public;
grant execute on function public.billing_receipt_tenant_can_issue_for_payment(uuid) to authenticated;
grant execute on function public.billing_receipt_tenant_can_issue_for_payment(uuid) to service_role;

commit;

notify pgrst, 'reload schema';
