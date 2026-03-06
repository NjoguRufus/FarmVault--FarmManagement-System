-- FarmVault migration 0005: employees must be authenticated users + pgcrypto fix
-- Depends on 0001, 0002, 0003, 0004

-- 1) Ensure gen_random_uuid() works
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2) Enforce every employee has an auth user
--    Make auth_user_id required + unique (one login per employee)
ALTER TABLE public.employees
  ALTER COLUMN auth_user_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_auth_user_id_unique'
      AND conrelid = 'public.employees'::regclass
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_auth_user_id_unique UNIQUE (auth_user_id);
  END IF;
END $$;

-- 3) Optional but strongly recommended:
--    Ensure employee auth_user_id exists in profiles and matches company_id
--    (prevents cross-company linking)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_auth_user_id_fk_profiles'
      AND conrelid = 'public.employees'::regclass
  ) THEN
    ALTER TABLE public.employees
      ADD CONSTRAINT employees_auth_user_id_fk_profiles
      FOREIGN KEY (auth_user_id)
      REFERENCES public.profiles(user_id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_employee_company_match()
RETURNS trigger AS $$
DECLARE
  p_company TEXT;
BEGIN
  SELECT company_id INTO p_company
  FROM public.profiles
  WHERE user_id = NEW.auth_user_id;

  IF p_company IS NULL THEN
    RAISE EXCEPTION 'Employee must have a profile with company_id set';
  END IF;

  IF NEW.company_id <> p_company THEN
    RAISE EXCEPTION 'Employee company_id must match profile company_id';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_employee_company_match ON public.employees;
CREATE TRIGGER trg_employee_company_match
BEFORE INSERT OR UPDATE OF company_id, auth_user_id
ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.enforce_employee_company_match();

-- 4) RLS tightening for employees
-- Drop old broad policies (names may differ; keep safe with IF EXISTS)
DROP POLICY IF EXISTS employees_update ON public.employees;
DROP POLICY IF EXISTS employees_delete ON public.employees;
DROP POLICY IF EXISTS employees_insert ON public.employees;

-- Allow reading employees in own company + self
CREATE POLICY employees_select_v2 ON public.employees
FOR SELECT
USING (
  is_developer()
  OR company_id = current_company_id()
  OR auth_user_id = auth.uid()
);

-- Only company admins (or developer) can create employees
CREATE POLICY employees_insert_v2 ON public.employees
FOR INSERT
WITH CHECK (
  is_developer()
  OR (is_company_admin() AND company_id = current_company_id())
);

-- Updates:
-- - developer can update anything
-- - company admin can update employees in company
-- - employee can update only their own “safe fields”
CREATE POLICY employees_update_v2 ON public.employees
FOR UPDATE
USING (
  is_developer()
  OR (is_company_admin() AND company_id = current_company_id())
  OR auth_user_id = auth.uid()
)
WITH CHECK (
  -- Stop normal users from switching company/role by updating the row:
  (is_developer() OR is_company_admin())
  OR (
    auth_user_id = auth.uid()
    AND company_id = current_company_id()
    AND NEW.company_id = OLD.company_id
    AND NEW.auth_user_id = OLD.auth_user_id
    AND NEW.role = OLD.role
  )
);

-- Delete: company admin or developer only
CREATE POLICY employees_delete_v2 ON public.employees
FOR DELETE
USING (
  is_developer()
  OR (is_company_admin() AND company_id = current_company_id())
);