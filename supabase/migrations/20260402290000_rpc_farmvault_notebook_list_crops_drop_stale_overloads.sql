-- PostgREST PGRST203: "Could not choose the best candidate function" when both
-- rpc_farmvault_notebook_list_crops(p_company_id text) and (... uuid) exist.
-- create or replace only updates the matching signature; a stale uuid overload survives.
--
-- If the database has ONLY the uuid overload (e.g. a simpler hand-maintained function),
-- do not drop it — otherwise we would remove the only implementation.

begin;

do $$
declare
  r record;
  v_has_text boolean;
begin
  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rpc_farmvault_notebook_list_crops'
      and pg_catalog.pg_get_function_identity_arguments(p.oid) = 'p_company_id text'
  )
  into v_has_text;

  if v_has_text then
    for r in
      select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'rpc_farmvault_notebook_list_crops'
        and pg_catalog.pg_get_function_identity_arguments(p.oid) is distinct from 'p_company_id text'
    loop
      execute format('drop function if exists %s cascade', r.sig);
    end loop;
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
