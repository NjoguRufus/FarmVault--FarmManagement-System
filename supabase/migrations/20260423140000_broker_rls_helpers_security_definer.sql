-- Harden broker harvest visibility:
-- 1) user_is_sales_broker_in_company: uses employees.role (normalized via _employee_role_is_sales_broker).
-- 2) dispatch_broker_matches_me / fallback_dispatch_broker_matches_me: SECURITY DEFINER so
--    the EXISTS join to public.employees is not affected by RLS edge cases on employees.
--    Policies still pass company_id from the harvest row; function only returns boolean.

begin;

create or replace function harvest.user_is_sales_broker_in_company(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public, core, harvest
as $$
  select exists (
    select 1
    from public.employees e
    where e.company_id = p_company
      and nullif(trim(e.clerk_user_id), '') is not null
      and nullif(trim(e.clerk_user_id), '') = nullif(trim(core.current_user_id()), '')
      and harvest._employee_role_is_sales_broker(nullif(trim(e.role::text), ''))
  );
$$;

create or replace function harvest.dispatch_broker_matches_me(p_dispatch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = harvest, public, core
as $$
  select exists (
    select 1
    from harvest.tomato_market_dispatches d
    join public.employees e on e.id = d.broker_employee_id
    where d.id = p_dispatch_id
      and nullif(trim(e.clerk_user_id), '') is not null
      and nullif(trim(e.clerk_user_id), '') = nullif(trim(core.current_user_id()), '')
  );
$$;

create or replace function harvest.fallback_dispatch_broker_matches_me(p_dispatch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = harvest, public, core
as $$
  select exists (
    select 1
    from harvest.fallback_market_dispatches d
    join public.employees e on e.id = d.broker_employee_id
    where d.id = p_dispatch_id
      and nullif(trim(e.clerk_user_id), '') is not null
      and nullif(trim(e.clerk_user_id), '') = nullif(trim(core.current_user_id()), '')
  );
$$;

revoke all on function harvest.user_is_sales_broker_in_company(uuid) from public;
revoke all on function harvest.dispatch_broker_matches_me(uuid) from public;
revoke all on function harvest.fallback_dispatch_broker_matches_me(uuid) from public;
grant execute on function harvest.user_is_sales_broker_in_company(uuid) to authenticated, service_role;
grant execute on function harvest.dispatch_broker_matches_me(uuid) to authenticated, service_role;
grant execute on function harvest.fallback_dispatch_broker_matches_me(uuid) to authenticated, service_role;

commit;
