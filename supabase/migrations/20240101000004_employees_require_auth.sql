-- FarmVault migration 0004: employees require auth, profiles PK, RLS tightening.
-- Depends on 0001, 0002, 0003. Do NOT modify previous migrations. Patch only.

-- =============================================================================
-- 1) PROFILES PK STANDARDIZATION
-- =============================================================================
-- Ensure profiles.user_id is the PRIMARY KEY; remove profiles.id if it exists.

DO $$
DECLARE
  pk_attnames TEXT[];
BEGIN
  SELECT array_agg(a.attname ORDER BY array_position(cc.conkey, a.attnum))
    INTO pk_attnames
  FROM pg_constraint cc
  JOIN pg_attribute a ON a.attrelid = cc.conrelid AND a.attnum = ANY(cc.conkey) AND NOT a.attisdropped
  WHERE cc.conrelid = 'public.profiles'::regclass AND cc.contype = 'p';

  IF pk_attnames = ARRAY['id'] OR (EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id') AND (pk_attnames IS NULL OR pk_attnames <> ARRAY['user_id'])) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pkey;
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS id;
    ALTER TABLE public.profiles ADD PRIMARY KEY (user_id);
  ELSIF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass AND contype = 'p') THEN
    ALTER TABLE public.profiles ADD PRIMARY KEY (user_id);
  END IF;
END $$;


-- =============================================================================
-- 2) EMPLOYEES AUTH REQUIREMENT: user_id NOT NULL, migrate from auth_user_id
-- =============================================================================
-- Add employees.user_id as FK to auth.users; backfill from auth_user_id; then drop auth_user_id.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.employees
SET user_id = auth_user_id
WHERE auth_user_id IS NOT NULL AND user_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.employees WHERE user_id IS NULL LIMIT 1) THEN
    RAISE EXCEPTION 'employees_require_auth: Some employees have no auth user. Set user_id or auth_user_id for all rows, or delete those rows, then re-run migration.'
      USING ERRCODE = 'check_violation';
  END IF;
END $$;

ALTER TABLE public.employees
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_user_id_key;
ALTER TABLE public.employees
  ADD CONSTRAINT employees_user_id_key UNIQUE (user_id);

ALTER TABLE public.employees
  DROP COLUMN IF EXISTS auth_user_id;

CREATE INDEX IF NOT EXISTS idx_employees_company_id ON public.employees(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON public.employees(user_id);


-- =============================================================================
-- 3) MULTI-TENANT: profiles.company_id (comment; NOT NULL optional when onboarding done)
-- =============================================================================
COMMENT ON COLUMN public.profiles.company_id IS 'Tenant: user belongs to this company. NULL only during onboarding; set when user creates or joins a company.';


-- =============================================================================
-- 4) RLS: EMPLOYEES POLICIES (user_id; company-admin create; self read/update limited)
-- =============================================================================
DROP POLICY IF EXISTS employees_select ON public.employees;
DROP POLICY IF EXISTS employees_insert ON public.employees;
DROP POLICY IF EXISTS employees_update ON public.employees;
DROP POLICY IF EXISTS employees_delete ON public.employees;

CREATE POLICY employees_select ON public.employees FOR SELECT
  USING (
    is_developer()
    OR row_company_matches_user(company_id)
    OR user_id = auth.uid()
  );

CREATE POLICY employees_insert ON public.employees FOR INSERT
  WITH CHECK (
    is_developer()
    OR (is_company_admin() AND company_id = current_company_id())
  );

CREATE POLICY employees_update ON public.employees FOR UPDATE
  USING (
    is_developer()
    OR row_company_matches_user(company_id)
    OR user_id = auth.uid()
  )
  WITH CHECK (
    is_developer()
    OR (row_company_matches_user(company_id) AND user_id = auth.uid())
    OR (user_id = auth.uid())
  );

CREATE POLICY employees_delete ON public.employees FOR DELETE
  USING (is_developer() OR row_company_matches_user(company_id));


-- =============================================================================
-- 4b) TRIGGER: Prevent non-developers from changing employees.company_id or role
-- =============================================================================
CREATE OR REPLACE FUNCTION public.employees_protect_company_and_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF is_developer() THEN
    RETURN NEW;
  END IF;
  IF OLD.company_id IS DISTINCT FROM NEW.company_id OR OLD.role IS DISTINCT FROM NEW.role THEN
    RAISE EXCEPTION 'Only a developer can change employee company_id or role'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS employees_protect_company_and_role_trigger ON public.employees;
CREATE TRIGGER employees_protect_company_and_role_trigger
  BEFORE UPDATE ON public.employees
  FOR EACH ROW
  EXECUTE PROCEDURE public.employees_protect_company_and_role();


-- =============================================================================
-- 5) UPDATE is_manager() to use employees.user_id
-- =============================================================================
CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    LEFT JOIN public.employees e ON e.user_id = p.user_id AND e.company_id = p.company_id
    WHERE p.user_id = auth.uid()
      AND (
        p.role = 'manager'
        OR p.employee_role IN ('manager', 'operations-manager')
        OR e.employee_role IN ('manager', 'operations-manager')
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;
