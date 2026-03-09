-- =========================================================
-- FARMVAULT SCHEMA DISCOVERY FOR EMPLOYEE SYSTEM
-- Run this in Supabase SQL Editor
-- =========================================================

-- 1. Show all non-system tables
select
  table_schema,
  table_name
from information_schema.tables
where table_schema not in ('pg_catalog', 'information_schema')
order by table_schema, table_name;

-- 2. Show all columns for all public tables
select
  table_schema,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- 3. Show only likely company/user/employee/project related tables
select
  table_schema,
  table_name
from information_schema.tables
where table_schema = 'public'
  and (
    table_name ilike '%company%'
    or table_name ilike '%user%'
    or table_name ilike '%employee%'
    or table_name ilike '%project%'
    or table_name ilike '%member%'
    or table_name ilike '%staff%'
    or table_name ilike '%team%'
    or table_name ilike '%profile%'
    or table_name ilike '%org%'
  )
order by table_name;

-- 4. Show columns for likely company/user/employee/project related tables
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and (
    table_name ilike '%company%'
    or table_name ilike '%user%'
    or table_name ilike '%employee%'
    or table_name ilike '%project%'
    or table_name ilike '%member%'
    or table_name ilike '%staff%'
    or table_name ilike '%team%'
    or table_name ilike '%profile%'
    or table_name ilike '%org%'
  )
order by table_name, ordinal_position;

-- 5. Show all foreign keys in public schema
select
  tc.table_name as source_table,
  kcu.column_name as source_column,
  ccu.table_name as referenced_table,
  ccu.column_name as referenced_column,
  tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.table_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
order by tc.table_name, kcu.column_name;

-- 6. Show primary keys
select
  tc.table_name,
  kcu.column_name,
  tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
where tc.constraint_type = 'PRIMARY KEY'
  and tc.table_schema = 'public'
order by tc.table_name, kcu.ordinal_position;

-- 7. Show unique constraints
select
  tc.table_name,
  kcu.column_name,
  tc.constraint_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
where tc.constraint_type = 'UNIQUE'
  and tc.table_schema = 'public'
order by tc.table_name, tc.constraint_name, kcu.ordinal_position;

-- 8. Show indexes
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;

-- 9. Show RLS status on public tables
-- (pg_tables has no RLS columns; use pg_class)
select
  n.nspname as schemaname,
  c.relname as tablename,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by c.relname;

-- 10. Show RLS policies
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 11. Show postgres enum types
select
  t.typname as enum_name,
  e.enumlabel as enum_value,
  e.enumsortorder
from pg_type t
join pg_enum e on t.oid = e.enumtypid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
order by enum_name, e.enumsortorder;

-- 12. Check whether key tables exist exactly
select
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'companies'
  ) as has_companies,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'projects'
  ) as has_projects,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'employees'
  ) as has_employees,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) as has_profiles,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'memberships'
  ) as has_memberships;

-- 13. Inspect auth users structure (works in SQL editor if allowed)
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'auth'
  and table_name = 'users'
order by ordinal_position;

-- 14. Preview auth users
select
  id,
  email,
  phone,
  created_at,
  last_sign_in_at
from auth.users
order by created_at desc
limit 50;

-- 15. Search for columns that may link to auth users / companies / projects
select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and (
    column_name in ('user_id', 'company_id', 'project_id', 'owner_id', 'created_by', 'updated_by')
    or column_name ilike '%user%'
    or column_name ilike '%company%'
    or column_name ilike '%project%'
    or column_name ilike '%owner%'
    or column_name ilike '%member%'
    or column_name ilike '%employee%'
  )
order by table_name, column_name;

-- 16. Show table definitions for companies-like tables
select
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in (
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and (
        table_name ilike '%company%'
        or table_name ilike '%org%'
      )
  )
order by c.table_name, c.ordinal_position;

-- 17. Show table definitions for project-like tables
select
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in (
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name ilike '%project%'
  )
order by c.table_name, c.ordinal_position;

-- 18. Show table definitions for employee/member/profile/user-like tables
select
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in (
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and (
        table_name ilike '%employee%'
        or table_name ilike '%member%'
        or table_name ilike '%profile%'
        or table_name ilike '%user%'
        or table_name ilike '%staff%'
        or table_name ilike '%team%'
      )
  )
order by c.table_name, c.ordinal_position;

-- 19. Row counts for likely relevant tables
do $$
declare
  r record;
  sql_text text;
begin
  for r in
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and (
        table_name ilike '%company%'
        or table_name ilike '%project%'
        or table_name ilike '%employee%'
        or table_name ilike '%member%'
        or table_name ilike '%profile%'
        or table_name ilike '%user%'
        or table_name ilike '%staff%'
        or table_name ilike '%team%'
      )
    order by table_name
  loop
    sql_text := format('select %L as table_name, count(*) as row_count from public.%I', r.table_name, r.table_name);
    execute sql_text;
  end loop;
end $$;

-- 20. Optional: search for a specific table name quickly
-- Replace 'companies' with any table you want to inspect
select
  *
from information_schema.columns
where table_schema = 'public'
  and table_name = 'companies'
order by ordinal_position;
