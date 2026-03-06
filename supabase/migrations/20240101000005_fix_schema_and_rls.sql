-- FarmVault migration 0004: schema and RLS fixes.
-- Depends on 0001, 0002, 0003. Do NOT edit previous migrations.

-- =============================================================================
-- 1) FIX PROFILES PRIMARY KEY: user_id as PK, remove id
-- =============================================================================
-- Make profiles.user_id the primary key (1:1 with auth.users.id).
-- Drop existing PK and id column only when PK is still on id (idempotent).

DO $$
DECLARE
  pk_attnames TEXT[];
BEGIN
  -- Get the column name(s) that form the current primary key on profiles.
  SELECT array_agg(a.attname ORDER BY array_position(cc.conkey, a.attnum))
    INTO pk_attnames
  FROM pg_constraint cc
  JOIN pg_attribute a ON a.attrelid = cc.conrelid AND a.attnum = ANY(cc.conkey) AND NOT a.attisdropped
  WHERE cc.conrelid = 'public.profiles'::regclass AND cc.contype = 'p';

  -- If PK is on 'id' (or id column exists and PK is not yet on user_id), migrate.
  IF pk_attnames = ARRAY['id'] OR (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id') AND (pk_attnames IS NULL OR pk_attnames <> ARRAY['user_id'])) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pkey;
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS id;
    ALTER TABLE public.profiles ADD PRIMARY KEY (user_id);
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass AND contype = 'p') THEN
    -- No PK at all (e.g. id already dropped manually); add PK on user_id.
    ALTER TABLE public.profiles ADD PRIMARY KEY (user_id);
  END IF;
END $$;


-- =============================================================================
-- 2) USE ENUMS CONSISTENTLY: profiles.role, employees.role -> app_user_role
-- =============================================================================
-- Cast TEXT role columns to app_user_role. Enum includes 'developer', 'company-admin',
-- 'company_admin', 'manager', 'broker', 'employee'. Invalid values will raise; defaults preserved.

-- profiles.role: NOT NULL, default 'employee'. Cast via text (existing values must match enum).
ALTER TABLE IF EXISTS profiles
  ALTER COLUMN role TYPE app_user_role
  USING (
    CASE
      WHEN role::text IN ('developer', 'company-admin', 'company_admin', 'manager', 'broker', 'employee') THEN role::text::app_user_role
      ELSE 'employee'::app_user_role
    END
  ),
  ALTER COLUMN role SET DEFAULT 'employee'::app_user_role;

-- employees.role: nullable. Same enum; NULL stays NULL.
ALTER TABLE IF EXISTS employees
  ALTER COLUMN role TYPE app_user_role
  USING (
    CASE
      WHEN role IS NULL THEN NULL
      WHEN role::text IN ('developer', 'company-admin', 'company_admin', 'manager', 'broker', 'employee') THEN role::text::app_user_role
      ELSE NULL
    END
  );


-- =============================================================================
-- 3) FIX RLS HELPER FUNCTIONS: is_developer, row_company_matches_user, search_path
-- =============================================================================
-- is_developer(): return TRUE only when profiles.role = 'developer' (not company_admin).
-- row_company_matches_user(): explicit parentheses for correct precedence.
-- Security: set search_path = public on all helper functions to avoid search_path injection.

CREATE OR REPLACE FUNCTION current_company_id()
RETURNS TEXT AS $$
  SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION is_developer()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND role = 'developer'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION is_company_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
      AND (role = 'company-admin' OR role = 'company_admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    LEFT JOIN public.employees e ON e.auth_user_id = p.user_id AND e.company_id = p.company_id
    WHERE p.user_id = auth.uid()
      AND (
        p.role = 'manager'
        OR p.employee_role IN ('manager', 'operations-manager')
        OR e.employee_role IN ('manager', 'operations-manager')
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

-- Explicit parentheses: ( (row_company_id IS NOT NULL AND row_company_id = current_company_id()) OR (current_company_id() IS NULL AND row_company_id IS NULL) ).
CREATE OR REPLACE FUNCTION row_company_matches_user(row_company_id TEXT)
RETURNS BOOLEAN AS $$
  SELECT (
    (row_company_id IS NOT NULL AND row_company_id = current_company_id())
    OR
    (current_company_id() IS NULL AND row_company_id IS NULL)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;


-- =============================================================================
-- 4) FIX company_record_shares UPDATE POLICY: developer-only
-- =============================================================================
-- Replace existing update policy with one that allows only developers.

DROP POLICY IF EXISTS company_record_shares_update ON company_record_shares;

CREATE POLICY company_record_shares_update ON company_record_shares
  FOR UPDATE
  USING (is_developer())
  WITH CHECK (is_developer());


-- =============================================================================
-- 5) ENFORCE APPEND-ONLY TABLES WITH TRIGGERS
-- =============================================================================
-- Block UPDATE and DELETE on audit_logs, activity_logs, inventory_audit_logs, project_wallet_ledger.

CREATE OR REPLACE FUNCTION deny_update_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Updates and deletes are not allowed on %', TG_TABLE_NAME
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- audit_logs: append-only
DROP TRIGGER IF EXISTS deny_audit_logs_update ON audit_logs;
DROP TRIGGER IF EXISTS deny_audit_logs_delete ON audit_logs;
CREATE TRIGGER deny_audit_logs_update BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE PROCEDURE deny_update_delete();
CREATE TRIGGER deny_audit_logs_delete BEFORE DELETE ON audit_logs FOR EACH ROW EXECUTE PROCEDURE deny_update_delete();

-- activity_logs: append-only
DROP TRIGGER IF EXISTS deny_activity_logs_update ON activity_logs;
DROP TRIGGER IF EXISTS deny_activity_logs_delete ON activity_logs;
CREATE TRIGGER deny_activity_logs_update BEFORE UPDATE ON activity_logs FOR EACH ROW EXECUTE PROCEDURE deny_update_delete();
CREATE TRIGGER deny_activity_logs_delete BEFORE DELETE ON activity_logs FOR EACH ROW EXECUTE PROCEDURE deny_update_delete();

-- inventory_audit_logs: append-only
DROP TRIGGER IF EXISTS deny_inventory_audit_logs_update ON inventory_audit_logs;
DROP TRIGGER IF EXISTS deny_inventory_audit_logs_delete ON inventory_audit_logs;
CREATE TRIGGER deny_inventory_audit_logs_update BEFORE UPDATE ON inventory_audit_logs FOR EACH ROW EXECUTE PROCEDURE deny_update_delete();
CREATE TRIGGER deny_inventory_audit_logs_delete BEFORE DELETE ON inventory_audit_logs FOR EACH ROW EXECUTE PROCEDURE deny_update_delete();

-- project_wallet_ledger: append-only
DROP TRIGGER IF EXISTS deny_project_wallet_ledger_update ON project_wallet_ledger;
DROP TRIGGER IF EXISTS deny_project_wallet_ledger_delete ON project_wallet_ledger;
CREATE TRIGGER deny_project_wallet_ledger_update BEFORE UPDATE ON project_wallet_ledger FOR EACH ROW EXECUTE PROCEDURE deny_update_delete();
CREATE TRIGGER deny_project_wallet_ledger_delete BEFORE DELETE ON project_wallet_ledger FOR EACH ROW EXECUTE PROCEDURE deny_update_delete();


-- =============================================================================
-- 6) SAFETY: Apply search_path to set_updated_at if it exists (from 0001)
-- =============================================================================
ALTER FUNCTION IF EXISTS set_updated_at() SET search_path = public;
