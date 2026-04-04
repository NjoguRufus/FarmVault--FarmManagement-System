-- Fix: permission denied / no rows on core.profiles for Clerk-authenticated clients.
-- 1) GRANT USAGE/SELECT so the table is readable by role authenticated (not only RLS).
-- 2) One clear SELECT policy: match JWT sub to clerk_user_id and/or id (when id column exists).
-- 3) Drop duplicate SELECT policy from 20260403232000 if present.
--
-- Clerk: JWT must include "sub" (template supabase). For PostgREST, JWT should use role "authenticated"
-- (Clerk third-party auth / custom template — see Supabase + Clerk docs).

begin;

do $do$
declare
  relkind "char";
  has_id_col boolean;
  sel_qual text;
begin
  select c.relkind into relkind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'core' and c.relname = 'profiles';

  if relkind is distinct from 'r' then
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'core' and table_name = 'profiles' and column_name = 'id'
  ) into has_id_col;

  -- Base: Clerk sub ↔ clerk_user_id (canonical for FarmVault core.profiles)
  sel_qual :=
    '(nullif(auth.jwt() ->> ''sub'', '''') is not null and clerk_user_id = nullif(auth.jwt() ->> ''sub'', ''''))';

  if has_id_col then
    sel_qual := sel_qual
      || ' or (id::text = nullif(auth.jwt() ->> ''sub'', ''''))'
      || ' or (id = auth.uid())';
  end if;

  execute 'grant usage on schema core to authenticated';
  execute 'grant select, insert, update on table core.profiles to authenticated';

  execute 'drop policy if exists core_profiles_select_own_clerk_jwt on core.profiles';
  execute 'drop policy if exists profiles_select_own on core.profiles';

  execute format(
    'create policy profiles_select_own on core.profiles for select to authenticated using (%s)',
    sel_qual
  );

  -- INSERT/UPDATE policies remain as in 20260305000035_current_context_rpc_and_rls.sql
  -- (clerk_user_id = core.current_user_id()). Do not broaden write RLS here.
end
$do$;

commit;
