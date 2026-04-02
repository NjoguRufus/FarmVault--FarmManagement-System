-- PostgREST can still bind p_company_id to a stale uuid overload on text-named RPCs, yielding
-- 22P02 invalid uuid "". A single jsonb parameter avoids uuid-typed candidates at the HTTP boundary;
-- the company id is read as text inside SQL and passed to the canonical text RPC.

begin;

drop function if exists public.fv_notebook_list_crops_ctx(jsonb);

create function public.fv_notebook_list_crops_ctx(p_ctx jsonb)
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
  from public.rpc_farmvault_notebook_list_crops(
    nullif(trim(coalesce(p_ctx->>'p_company_id', '')), '')
  );
$$;

revoke all on function public.fv_notebook_list_crops_ctx(jsonb) from public;
grant execute on function public.fv_notebook_list_crops_ctx(jsonb) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
