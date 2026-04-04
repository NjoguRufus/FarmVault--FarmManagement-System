-- Fix: public.create_company_with_admin was calling core.create_company_and_admin
-- (the old alias that does NOT update user_type on the profile).
-- It must call core.create_company_with_admin, which correctly promotes
-- ambassador → both when a user creates their first company.

begin;

drop function if exists public.create_company_with_admin(text);

create function public.create_company_with_admin(_name text)
returns uuid
language sql
volatile
security definer
set search_path = core, public
as $$
  select core.create_company_with_admin(_name);
$$;

revoke all on function public.create_company_with_admin(text) from public;
grant execute on function public.create_company_with_admin(text) to authenticated;

commit;

notify pgrst, 'reload schema';
