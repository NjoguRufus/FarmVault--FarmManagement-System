-- =============================================================================
-- FarmVault French Beans Harvest Collections — SQL Introspection Pack
-- READ-ONLY: no ALTER, no DROP, no data changes.
-- =============================================================================
--
-- HOW TO RUN
-- ----------
-- 1. Open Supabase Dashboard → SQL Editor.
-- 2. Paste this entire file into a new query.
-- 3. Run the query (all SELECTs execute in one run).
-- 4. Results appear as multiple result sets; label each by the "section" column
--    (A1_TABLES_VIEWS, A2_COLUMNS, A3_PK, A3_FK, A4_RLS_POLICIES, A5_RLS_ENABLED,
--     A6_FUNCTIONS, A7_VIEWS, A7_PUBLIC_COMPANY_SUB_TYPE).
-- 5. Export or copy results to confirm actual DB columns, RLS, and functions
--    before applying migrations or code changes.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A1) Tables/views in harvest, billing, projects, core, public (existence check)
-- -----------------------------------------------------------------------------
SELECT 'A1_TABLES_VIEWS' AS section, table_schema, table_name, table_type
FROM information_schema.tables
WHERE (table_schema = 'harvest' AND table_name IN (
  'harvest_collections', 'harvest_pickers', 'picker_intake_entries', 'picker_payment_entries', 'sales', 'harvests'
))
   OR (table_schema = 'projects' AND table_name = 'projects')
   OR (table_schema = 'public' AND table_name IN ('projects', 'company_subscriptions'))
   OR (table_schema = 'core' AND table_name IN ('companies', 'company_members', 'profiles'))
   OR (table_schema = 'billing' AND table_name IN ('company_subscriptions', 'payments'))
ORDER BY table_schema, table_name;

-- -----------------------------------------------------------------------------
-- A2) Columns for each object (ordinal_position order)
-- -----------------------------------------------------------------------------
SELECT 'A2_COLUMNS' AS section, c.table_schema, c.table_name, c.ordinal_position,
  c.column_name, c.data_type, c.udt_name,
  c.is_nullable, c.column_default
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE (c.table_schema = 'harvest' AND c.table_name IN (
  'harvest_collections', 'harvest_pickers', 'picker_intake_entries', 'picker_payment_entries', 'sales', 'harvests'
))
   OR (c.table_schema = 'projects' AND c.table_name = 'projects')
   OR (c.table_schema = 'public' AND c.table_name IN ('projects', 'company_subscriptions'))
   OR (c.table_schema = 'core' AND c.table_name IN ('companies', 'company_members', 'profiles'))
   OR (c.table_schema = 'billing' AND c.table_name IN ('company_subscriptions', 'payments'))
ORDER BY c.table_schema, c.table_name, c.ordinal_position;

-- -----------------------------------------------------------------------------
-- A3) Primary keys and foreign keys for those tables
-- -----------------------------------------------------------------------------
-- Primary keys
SELECT 'A3_PK' AS section, tc.table_schema, tc.table_name, tc.constraint_name,
  kcu.column_name, kcu.ordinal_position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND ((tc.table_schema = 'harvest' AND tc.table_name IN (
    'harvest_collections', 'harvest_pickers', 'picker_intake_entries', 'picker_payment_entries', 'sales', 'harvests'))
   OR (tc.table_schema = 'projects' AND tc.table_name = 'projects')
   OR (tc.table_schema = 'public' AND tc.table_name IN ('projects', 'company_subscriptions'))
   OR (tc.table_schema = 'core' AND tc.table_name IN ('companies', 'company_members', 'profiles'))
   OR (tc.table_schema = 'billing' AND tc.table_name IN ('company_subscriptions', 'payments')))
ORDER BY tc.table_schema, tc.table_name, kcu.ordinal_position;

-- Foreign keys (referencing and referenced)
SELECT 'A3_FK' AS section, tc.table_schema, tc.table_name, tc.constraint_name,
  kcu.column_name, ccu.table_schema AS ref_schema, ccu.table_name AS ref_table, ccu.column_name AS ref_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name AND tc.constraint_schema = ccu.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND ((tc.table_schema = 'harvest' AND tc.table_name IN (
    'harvest_collections', 'harvest_pickers', 'picker_intake_entries', 'picker_payment_entries', 'sales', 'harvests'))
   OR (tc.table_schema = 'projects' AND tc.table_name = 'projects')
   OR (tc.table_schema = 'public' AND tc.table_name IN ('projects', 'company_subscriptions'))
   OR (tc.table_schema = 'core' AND tc.table_name IN ('companies', 'company_members', 'profiles'))
   OR (tc.table_schema = 'billing' AND tc.table_name IN ('company_subscriptions', 'payments')))
ORDER BY tc.table_schema, tc.table_name, tc.constraint_name;

-- -----------------------------------------------------------------------------
-- A4) RLS policies for these tables (pg_policies)
-- -----------------------------------------------------------------------------
SELECT 'A4_RLS_POLICIES' AS section, schemaname, tablename, policyname, permissive, roles, cmd,
  qual::text AS using_expression, with_check::text AS with_check_expression
FROM pg_policies
WHERE (schemaname = 'harvest' AND tablename IN (
  'harvest_collections', 'harvest_pickers', 'picker_intake_entries', 'picker_payment_entries', 'sales', 'harvests'))
   OR (schemaname = 'projects' AND tablename = 'projects')
   OR (schemaname = 'public' AND tablename IN ('projects', 'company_subscriptions'))
   OR (schemaname = 'core' AND tablename IN ('companies', 'company_members', 'profiles'))
   OR (schemaname = 'billing' AND tablename IN ('company_subscriptions', 'payments'))
ORDER BY schemaname, tablename, policyname;

-- -----------------------------------------------------------------------------
-- A5) RLS enabled on each table (pg_class + pg_namespace)
-- -----------------------------------------------------------------------------
SELECT 'A5_RLS_ENABLED' AS section, n.nspname AS table_schema, c.relname AS table_name,
  c.relkind AS kind, (c.relrowsecurity) AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'v')
  AND ((n.nspname = 'harvest' AND c.relname IN (
    'harvest_collections', 'harvest_pickers', 'picker_intake_entries', 'picker_payment_entries', 'sales', 'harvests'))
   OR (n.nspname = 'projects' AND c.relname = 'projects')
   OR (n.nspname = 'public' AND c.relname IN ('projects', 'company_subscriptions'))
   OR (n.nspname = 'core' AND c.relname IN ('companies', 'company_members', 'profiles'))
   OR (n.nspname = 'billing' AND c.relname IN ('company_subscriptions', 'payments')))
ORDER BY n.nspname, c.relname;

-- -----------------------------------------------------------------------------
-- A6) Function definitions (core + admin + harvest RPCs)
-- -----------------------------------------------------------------------------
SELECT 'A6_FUNCTIONS' AS section, n.nspname AS schema_name, p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE (n.nspname = 'core' AND p.proname IN ('current_user_id', 'current_company_id', 'is_company_member', 'is_company_admin'))
   OR (n.nspname = 'admin' AND p.proname IN ('current_clerk_user_id', 'is_developer'))
   OR (n.nspname = 'public' AND p.proname IN ('current_company_id', 'current_context'))
   OR (n.nspname = 'harvest' AND p.proname IN ('create_collection', 'record_intake', 'record_payment', 'close_collection'))
ORDER BY n.nspname, p.proname;

-- -----------------------------------------------------------------------------
-- A7) View definitions (public.company_subscriptions, harvest summary views)
-- -----------------------------------------------------------------------------
SELECT 'A7_VIEWS' AS section, schemaname, viewname, definition
FROM pg_views
WHERE (schemaname = 'public' AND viewname = 'company_subscriptions')
   OR (schemaname = 'harvest' AND viewname IN ('intake_entry_balances', 'collection_picker_totals', 'company_subscriptions'));

-- If pg_views shows nothing for public.company_subscriptions (it might be a table now), list table_type for that object:
SELECT 'A7_PUBLIC_COMPANY_SUB_TYPE' AS section, table_schema, table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'company_subscriptions';
