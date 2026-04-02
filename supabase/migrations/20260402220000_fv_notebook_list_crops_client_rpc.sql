-- Client-facing notebook crop list: unique name so PostgREST never binds a stale uuid overload
-- for "rpc_farmvault_notebook_list_crops". Server calls the canonical RPC with a text argument only.

begin;

drop function if exists public.fv_notebook_list_crops(text);

create function public.fv_notebook_list_crops(p_company_id text)
returns table (
  crop_id text,
  crop_name text,
  slug text,
  is_global boolean,
  records_count int,
  last_updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.rpc_farmvault_notebook_list_crops(p_company_id);
$$;

revoke all on function public.fv_notebook_list_crops(text) from public;
grant execute on function public.fv_notebook_list_crops(text) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
