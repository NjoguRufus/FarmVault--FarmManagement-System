-- Ensure public.create_company_with_admin exists so Supabase JS client can call it.
-- Fixes: "Could not find the function public.create_company_with_admin(_name) in the schema cache"

begin;

drop function if exists public.create_company_with_admin(text);

create function public.create_company_with_admin(_name text)
returns uuid
language sql
stable
security definer
set search_path = core, public
as $$
  select core.create_company_with_admin(_name);
$$;

grant execute on function public.create_company_with_admin(text) to authenticated;

commit;
