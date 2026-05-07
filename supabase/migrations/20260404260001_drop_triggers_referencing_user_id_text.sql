-- =============================================================================
-- Remove stale triggers that still reference NEW.user_id_text
--
-- Partial Clerk migrations sometimes added user_id_text + triggers; 20260404240000
-- drops the column. Triggers are not always CASCADE-dependent on the column, so
-- they survive and fail on INSERT with:
--   record "new" has no field "user_id_text"
-- =============================================================================

BEGIN;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT t.tgname,
           ns.nspname AS table_schema,
           cl.relname AS table_name
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_class cl ON cl.oid = t.tgrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    WHERE NOT t.tgisinternal
      AND ns.nspname IN ('core', 'public')
      AND cl.relname IN (
        'company_members',
        'companies',
        'profiles'
      )
      AND p.prosrc IS NOT NULL
      AND p.prosrc ILIKE '%user_id_text%'
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I.%I',
      r.tgname,
      r.table_schema,
      r.table_name
    );
    RAISE NOTICE '[user_id_text cleanup] Dropped trigger % on %.%',
      r.tgname, r.table_schema, r.table_name;
  END LOOP;
END $$;

-- Also match trigger names from failed coercion attempts (Step 3 pattern in 20260404240000)
DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT tr.trigger_name,
           tr.event_object_schema,
           tr.event_object_table
    FROM information_schema.triggers tr
    WHERE tr.trigger_schema IN ('core', 'public')
      AND tr.event_object_table IN ('company_members', 'companies', 'profiles')
      AND (
        tr.trigger_name ILIKE '%user_id_text%'
        OR tr.trigger_name ILIKE '%useridtext%'
      )
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I.%I',
      t.trigger_name,
      t.event_object_schema,
      t.event_object_table
    );
    RAISE NOTICE '[user_id_text cleanup] Dropped trigger % (name match) on %.%',
      t.trigger_name, t.event_object_schema, t.event_object_table;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
