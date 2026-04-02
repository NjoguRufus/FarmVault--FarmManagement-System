-- PostgREST can still pick a (uuid) overload or coerce JSON/"" to uuid, producing:
--   invalid input syntax for type uuid: ""
-- Drop any overload whose argument list mentions uuid. Canonical signatures use only text + int.

begin;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'list_company_record_crops'
      and pg_get_function_identity_arguments(p.oid) ~* '[[:<:]]uuid[[:>:]]'
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'dev_list_crop_records'
      and pg_get_function_identity_arguments(p.oid) ~* '[[:<:]]uuid[[:>:]]'
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;

grant execute on function public.list_company_record_crops(text) to authenticated;
grant execute on function public.dev_list_crop_records(text, text, text, int, int) to authenticated;

-- Best-effort: nudge PostgREST to reload schema (hosted Supabase usually refreshes after migrations).
do $$
begin
  perform pg_notify('pgrst', 'reload schema');
end $$;

commit;
