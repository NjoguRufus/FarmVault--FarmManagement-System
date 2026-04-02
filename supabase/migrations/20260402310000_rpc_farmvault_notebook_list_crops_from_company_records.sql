-- Notebook crop list: derive from visible company_records (any crop with notes),
-- enrich names/slugs from company_record_crops when present (join on company_id + crop_id).
-- p_company_id NULL + is_developer(): aggregate across all companies (Developer Control Center).
-- p_company_id set: that company only; members or developers.
-- Replaces prior canonical/union-heavy implementation per product request.
-- Drops all rpc_farmvault_notebook_list_crops overloads and recreates dependents (CASCADE).

begin;

-- Wrappers may survive a partial run or if CASCADE from dropping rpc did not remove them (dependency quirks).
drop function if exists public.fv_notebook_list_crops_ctx(jsonb) cascade;
drop function if exists public.fv_notebook_list_crops(text) cascade;
drop function if exists public.list_company_record_crops(text) cascade;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rpc_farmvault_notebook_list_crops'
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;

create or replace function public.rpc_farmvault_notebook_list_crops(p_company_id text default null)
returns table (
  crop_id text,
  crop_name text,
  slug text,
  is_global boolean,
  records_count integer,
  last_updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.crop_id,
    s.crop_name,
    s.slug,
    false::boolean as is_global,
    s.records_count,
    s.last_updated_at
  from (
    select
      r.crop_id::text as crop_id,
      max(
        coalesce(
          nullif(trim(c.crop_name), ''),
          nullif(trim(r.crop_name), ''),
          r.crop_id::text
        )
      ) as crop_name,
      max(coalesce(nullif(trim(c.slug), ''), r.crop_id::text)) as slug,
      count(r.id)::int as records_count,
      max(coalesce(r.updated_at, r.created_at)) as last_updated_at
    from public.company_records r
    left join public.company_record_crops c
      on c.company_id = r.company_id
     and c.crop_id = r.crop_id
    where r.visibility = 'visible'
      and r.crop_id is not null
      and trim(r.crop_id) <> ''
      and (
        (
          nullif(trim(coalesce(p_company_id, '')), '') is null
          and public.is_developer()
        )
        or (
          nullif(trim(coalesce(p_company_id, '')), '') is not null
          and r.company_id = nullif(trim(coalesce(p_company_id, '')), '')
          and (
            public.is_developer()
            or public.row_company_matches_user(r.company_id)
          )
        )
      )
    group by r.crop_id
  ) s
  order by s.crop_name asc nulls last, s.crop_id asc;
$$;

create or replace function public.fv_notebook_list_crops(p_company_id text)
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

create or replace function public.fv_notebook_list_crops_ctx(p_ctx jsonb)
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

create or replace function public.list_company_record_crops(p_company_id text)
returns table (
  crop_id text,
  crop_name text,
  slug text,
  is_global boolean,
  records_count int,
  last_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select *
  from public.rpc_farmvault_notebook_list_crops(p_company_id);
end;
$$;

revoke all on function public.rpc_farmvault_notebook_list_crops(text) from public;
grant execute on function public.rpc_farmvault_notebook_list_crops(text) to authenticated, service_role;

revoke all on function public.fv_notebook_list_crops(text) from public;
grant execute on function public.fv_notebook_list_crops(text) to authenticated, service_role;

revoke all on function public.fv_notebook_list_crops_ctx(jsonb) from public;
grant execute on function public.fv_notebook_list_crops_ctx(jsonb) to authenticated, service_role;

revoke all on function public.list_company_record_crops(text) from public;
grant execute on function public.list_company_record_crops(text) to service_role;

commit;

notify pgrst, 'reload schema';
