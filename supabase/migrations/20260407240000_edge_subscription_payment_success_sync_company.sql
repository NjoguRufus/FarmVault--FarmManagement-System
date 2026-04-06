-- Edge handleSuccessfulPayment: sync core.companies via SECURITY DEFINER RPC so PostgREST does not
-- require direct UPDATE grants on core.companies for service_role (avoids "permission denied for table companies").
-- Also grant service_role read access to companies tables used by billing email resolution.

begin;

create or replace function public.subscription_payment_success_sync_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_company_id is null then
    raise exception 'company_id required' using errcode = 'P0001';
  end if;

  update core.companies
  set
    subscription_status  = 'active',
    payment_confirmed    = true,
    pending_confirmation = false,
    last_payment_at      = v_now
  where id = p_company_id;
end;
$$;

comment on function public.subscription_payment_success_sync_company(uuid) is
  'Called from Edge handleSuccessfulPayment only. Syncs paid workspace snapshot + last_payment_at.';

revoke all on function public.subscription_payment_success_sync_company(uuid) from public;
grant execute on function public.subscription_payment_success_sync_company(uuid) to service_role;

grant usage on schema core to service_role;
grant select on table core.companies to service_role;

do $$
begin
  if to_regclass('public.companies') is not null then
    execute 'grant select on table public.companies to service_role';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
