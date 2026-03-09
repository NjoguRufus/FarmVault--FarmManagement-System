-- =========================================================
-- FARMVAULT EMPLOYEE SCHEMA AUDIT
-- Purpose:
-- 1. Show real employees-related schema
-- 2. Show columns, keys, indexes, views, policies
-- 3. Confirm whether company_members is a view
-- 4. Find invalid columns like name / created_by assumptions
-- =========================================================

-- ---------------------------------------------------------
-- 1) What are these objects really? table or view?
-- ---------------------------------------------------------
select
  table_schema,
  table_name,
  table_type
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'employees',
    'profiles',
    'projects',
    'companies',
    'company_members',
    'employee_project_access',
    'employee_activity_logs'
  )
order by table_name;

-- ---------------------------------------------------------
-- 2) Exact columns for core employee-related objects
-- ---------------------------------------------------------
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'employees',
    'profiles',
    'projects',
    'companies',
    'company_members',
    'employee_project_access',
    'employee_activity_logs'
  )
order by table_name, ordinal_position;

-- ---------------------------------------------------------
-- 3) Foreign keys touching those objects
-- ---------------------------------------------------------
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
  and (
    tc.table_name in (
      'employees',
      'profiles',
      'projects',
      'companies',
      'company_members',
      'employee_project_access',
      'employee_activity_logs'
    )
    or ccu.table_name in (
      'employees',
      'profiles',
      'projects',
      'companies',
      'company_members',
      'employee_project_access',
      'employee_activity_logs'
    )
  )
order by tc.table_name, kcu.column_name;

-- ---------------------------------------------------------
-- 4) Primary keys
-- ---------------------------------------------------------
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
  and tc.table_name in (
    'employees',
    'profiles',
    'projects',
    'companies',
    'company_members',
    'employee_project_access',
    'employee_activity_logs'
  )
order by tc.table_name, kcu.ordinal_position;

-- ---------------------------------------------------------
-- 5) Unique constraints
-- ---------------------------------------------------------
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
  and tc.table_name in (
    'employees',
    'profiles',
    'projects',
    'companies',
    'company_members',
    'employee_project_access',
    'employee_activity_logs'
  )
order by tc.table_name, tc.constraint_name, kcu.ordinal_position;

-- ---------------------------------------------------------
-- 6) Indexes
-- ---------------------------------------------------------
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'employees',
    'profiles',
    'projects',
    'companies',
    'employee_project_access',
    'employee_activity_logs'
  )
order by tablename, indexname;

-- ---------------------------------------------------------
-- 7) If company_members is a view, show its SQL
-- ---------------------------------------------------------
select
  schemaname,
  viewname,
  definition
from pg_views
where schemaname = 'public'
  and viewname = 'company_members';

-- ---------------------------------------------------------
-- 8) RLS enabled status
-- ---------------------------------------------------------
select
  schemaname,
  tablename,
  rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
  and tablename in (
    'employees',
    'profiles',
    'projects',
    'companies',
    'employee_project_access',
    'employee_activity_logs'
  )
order by tablename;

-- ---------------------------------------------------------
-- 9) RLS policies
-- ---------------------------------------------------------
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
  and tablename in (
    'employees',
    'profiles',
    'projects',
    'companies',
    'employee_project_access',
    'employee_activity_logs'
  )
order by tablename, policyname;

-- ---------------------------------------------------------
-- 10) Check whether these often-assumed columns actually exist
-- ---------------------------------------------------------
select
  table_name,
  max(case when column_name = 'name' then 1 else 0 end) as has_name,
  max(case when column_name = 'full_name' then 1 else 0 end) as has_full_name,
  max(case when column_name = 'created_by' then 1 else 0 end) as has_created_by,
  max(case when column_name = 'updated_by' then 1 else 0 end) as has_updated_by,
  max(case when column_name = 'clerk_user_id' then 1 else 0 end) as has_clerk_user_id,
  max(case when column_name = 'permission_preset' then 1 else 0 end) as has_permission_preset,
  max(case when column_name = 'permissions' then 1 else 0 end) as has_permissions,
  max(case when column_name = 'status' then 1 else 0 end) as has_status
from information_schema.columns
where table_schema = 'public'
  and table_name in ('employees', 'profiles', 'projects', 'companies', 'company_members')
group by table_name
order by table_name;

-- ---------------------------------------------------------
-- 11) Row counts
-- ---------------------------------------------------------
select 'employees' as table_name, count(*) as row_count from public.employees
union all
select 'profiles', count(*) from public.profiles
union all
select 'projects', count(*) from public.projects
union all
select 'companies', count(*) from public.companies
union all
select 'employee_project_access', count(*) from public.employee_project_access
union all
select 'employee_activity_logs', count(*) from public.employee_activity_logs;

-- ---------------------------------------------------------
-- 12) Safe sample rows: employees
-- ---------------------------------------------------------
select
  id,
  company_id,
  clerk_user_id,
  email,
  full_name,
  phone,
  role,
  department,
  permission_preset,
  permissions,
  status,
  created_at
from public.employees
limit 10;

-- ---------------------------------------------------------
-- 13) Safe sample rows: profiles
-- ---------------------------------------------------------
select
  clerk_user_id,
  email,
  full_name,
  active_company_id,
  created_at,
  updated_at
from public.profiles
limit 10;

-- ---------------------------------------------------------
-- 14) Safe sample rows: projects
-- ---------------------------------------------------------
select
  id,
  company_id,
  name,
  created_by,
  created_at
from public.projects
limit 10;

-- ---------------------------------------------------------
-- 15) Safe sample rows: employee_project_access
-- ---------------------------------------------------------
select *
from public.employee_project_access
limit 10;

-- ---------------------------------------------------------
-- 16) Safe sample rows: employee_activity_logs
-- ---------------------------------------------------------
select *
from public.employee_activity_logs
limit 10;

-- ---------------------------------------------------------
-- 17) Check function definitions that may still reference bad columns
-- Very important for invite-employee DB helpers / RPCs
--
-- NOTE: pg_proc includes aggregates (e.g. array_agg). Calling pg_get_functiondef()
-- on aggregates throws: ERROR 42809 "... is an aggregate function".
-- This query filters to real functions only: prokind = 'f'.
-- ---------------------------------------------------------
with defs as (
  select
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_functiondef(p.oid) as function_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
)
select *
from defs
where lower(function_name) like '%employee%'
   or lower(function_definition) like '%employee%'
   or lower(function_definition) like '%employees%'
order by function_name;

-- ---------------------------------------------------------
-- 18) Check triggers on employee-related tables
-- ---------------------------------------------------------
select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in (
    'employees',
    'employee_project_access',
    'employee_activity_logs'
  )
order by event_object_table, trigger_name;

-- ---------------------------------------------------------
-- 19) Quick truth query for employees only
-- ---------------------------------------------------------
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'employees'
order by ordinal_position;

