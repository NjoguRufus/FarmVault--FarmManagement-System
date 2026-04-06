-- subscription_payment_success_sync_company: return name/email after update so Edge skips extra
-- PostgREST reads on core.companies (avoids service_role SELECT failures).
-- Drop void overload from 20260407240000 before creating jsonb return type.

begin;

drop function if exists public.subscription_payment_success_sync_company(uuid);

create or replace function public.subscription_payment_success_sync_company(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = admin, core, public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_name text;
  v_email text;
  v_owner_email text;
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

  select c.name, c.email, c.owner_email
  into v_name, v_email, v_owner_email
  from core.companies c
  where c.id = p_company_id;

  return jsonb_build_object(
    'name', v_name,
    'email', v_email,
    'owner_email', v_owner_email
  );
end;
$$;

comment on function public.subscription_payment_success_sync_company(uuid) is
  'Edge handleSuccessfulPayment: sync paid snapshot + last_payment_at; returns company row fields.';

revoke all on function public.subscription_payment_success_sync_company(uuid) from public;
grant execute on function public.subscription_payment_success_sync_company(uuid) to service_role;

grant usage on schema core to service_role;
grant usage on schema public to service_role;
grant select on table core.companies to service_role;

do $$
begin
  if to_regclass('public.companies') is not null then
    execute 'grant select on table public.companies to service_role';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
