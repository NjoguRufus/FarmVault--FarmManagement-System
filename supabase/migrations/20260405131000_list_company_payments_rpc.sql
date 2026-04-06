-- Tenant-safe RPC: list subscription_payments for a company.
-- SECURITY DEFINER bypasses RLS entirely — the function itself enforces
-- authorization by verifying the caller is a member of the requested company.
--
-- This is belt-and-suspenders alongside the RLS fix in 20260405130000:
-- even if the RLS policy were misconfigured, the RPC still enforces membership.
--
-- Called from: billingSubmissionService.ts → listCompanySubscriptionPayments()

begin;

create or replace function public.list_company_payments(
  _company_id uuid
)
returns table (
  id               uuid,
  company_id       text,
  plan_id          text,
  amount           numeric,
  status           text,
  billing_mode     text,
  billing_cycle    text,
  currency         text,
  payment_method   text,
  mpesa_name       text,
  mpesa_phone      text,
  transaction_code text,
  notes            text,
  created_at       timestamptz,
  submitted_at     timestamptz,
  approved_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public, core, admin
as $$
declare
  v_caller_id text;
  v_is_member boolean := false;
begin
  -- Identify caller
  v_caller_id := nullif(trim(coalesce(auth.jwt() ->> 'sub', '')), '');

  if v_caller_id is null then
    -- Not authenticated
    return;
  end if;

  -- Developers may read any company's payments
  if admin.is_developer() then
    return query
      select
        sp.id,
        sp.company_id,
        sp.plan_id,
        sp.amount,
        sp.status::text,
        sp.billing_mode,
        sp.billing_cycle,
        sp.currency,
        sp.payment_method,
        sp.mpesa_name,
        sp.mpesa_phone,
        sp.transaction_code,
        sp.notes,
        sp.created_at,
        sp.submitted_at,
        sp.approved_at
      from public.subscription_payments sp
      where sp.company_id = _company_id::text
      order by sp.created_at desc;
    return;
  end if;

  -- Tenant: verify caller is a member of this company
  select exists (
    select 1
    from core.company_members m
    where m.company_id = _company_id
      and m.clerk_user_id = v_caller_id
  ) into v_is_member;

  if not v_is_member then
    -- Also check core.profiles.active_company_id as fallback
    select exists (
      select 1
      from core.profiles p
      where p.clerk_user_id = v_caller_id
        and p.active_company_id = _company_id
    ) into v_is_member;
  end if;

  if not v_is_member then
    return; -- Return empty — caller is not a member of this company
  end if;

  return query
    select
      sp.id,
      sp.company_id,
      sp.plan_id,
      sp.amount,
      sp.status::text,
      sp.billing_mode,
      sp.billing_cycle,
      sp.currency,
      sp.payment_method,
      sp.mpesa_name,
      sp.mpesa_phone,
      sp.transaction_code,
      sp.notes,
      sp.created_at,
      sp.submitted_at,
      sp.approved_at
    from public.subscription_payments sp
    where sp.company_id = _company_id::text
    order by sp.created_at desc;
end;
$$;

revoke all on function public.list_company_payments(uuid) from public;
grant execute on function public.list_company_payments(uuid) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
