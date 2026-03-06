-- FarmVault: Clerk-only auth — profiles keyed by Clerk user id (TEXT).
-- Use auth.jwt() ->> 'sub' for current user in RLS (Clerk sends sub = user id).
-- Depends on 0001–0005.
--
-- Required: In Supabase Dashboard → Authentication → JWT Settings, add Clerk as
-- a custom JWT issuer (or use Customize JWT) so that API requests with Bearer <Clerk token>
-- set auth.jwt() and auth.uid()/sub is available. Then run this migration.

-- ============== 1) HELPER: current user id from JWT (Clerk sub) ==============
CREATE OR REPLACE FUNCTION current_clerk_id()
RETURNS TEXT AS $$
  SELECT NULLIF(TRIM(auth.jwt() ->> 'sub'), '')::text;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

-- ============== 2) PROFILES: migrate user_id UUID PK to id TEXT PK (Clerk id) ==============
-- After 0004, profiles has user_id as PK. Add id TEXT, backfill, then switch.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id') THEN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS id TEXT;
    UPDATE public.profiles SET id = user_id::text WHERE id IS NULL;
    UPDATE public.profiles SET id = gen_random_uuid()::text WHERE id IS NULL;
    ALTER TABLE public.profiles ALTER COLUMN id SET NOT NULL;
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pkey;
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_key;
    ALTER TABLE public.profiles DROP COLUMN IF EXISTS user_id;
    ALTER TABLE public.profiles ADD PRIMARY KEY (id);
  ELSIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id') THEN
    ALTER TABLE public.profiles ADD COLUMN id TEXT PRIMARY KEY;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_company_id ON public.profiles(company_id);

-- ============== 2b) EMPLOYEES: auth_user_id can be Clerk id (TEXT) ==============
ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_auth_user_id_fkey;
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'auth_user_id') = 'uuid' THEN
    ALTER TABLE public.employees ALTER COLUMN auth_user_id TYPE TEXT USING auth_user_id::text;
  END IF;
END $$;

-- ============== 3) RLS HELPER FUNCTIONS: use current_clerk_id() ==============
CREATE OR REPLACE FUNCTION current_company_id()
RETURNS TEXT AS $$
  SELECT company_id FROM public.profiles WHERE id = current_clerk_id() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION is_developer()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = current_clerk_id()
      AND role = 'developer'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION is_company_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = current_clerk_id()
      AND (role = 'company-admin' OR role = 'company_admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    LEFT JOIN public.employees e ON e.auth_user_id::text = p.id AND e.company_id = p.company_id
    WHERE p.id = current_clerk_id()
      AND (
        p.role = 'manager'
        OR p.employee_role IN ('manager', 'operations-manager')
        OR e.employee_role IN ('manager', 'operations-manager')
      )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

-- ============== 4) DROP OLD POLICIES THAT REFERENCE user_id / auth.uid() ==============
DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
DROP POLICY IF EXISTS profiles_update ON public.profiles;
DROP POLICY IF EXISTS profiles_delete ON public.profiles;

-- ============== 5) PROFILES POLICIES: use id = current_clerk_id() ==============
CREATE POLICY profiles_select ON public.profiles FOR SELECT
  USING (
    id = current_clerk_id()
    OR (current_company_id() IS NOT NULL AND company_id = current_company_id())
    OR is_developer()
  );

CREATE POLICY profiles_insert ON public.profiles FOR INSERT
  WITH CHECK (id = current_clerk_id());

CREATE POLICY profiles_update ON public.profiles FOR UPDATE
  USING (id = current_clerk_id() OR (is_company_admin() AND company_id = current_company_id()) OR is_developer());

CREATE POLICY profiles_delete ON public.profiles FOR DELETE
  USING (id = current_clerk_id() OR is_developer());

-- ============== 6) COMPANIES INSERT: allow when JWT present (onboarding) ==============
DROP POLICY IF EXISTS companies_insert ON public.companies;
CREATE POLICY companies_insert ON public.companies FOR INSERT
  WITH CHECK (current_clerk_id() IS NOT NULL);

-- ============== 7) PROJECTS INSERT: use current_clerk_id instead of auth.uid() ==============
DROP POLICY IF EXISTS projects_insert ON public.projects;
CREATE POLICY projects_insert ON public.projects FOR INSERT
  WITH CHECK (current_clerk_id() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));

DROP POLICY IF EXISTS project_stages_insert ON public.project_stages;
CREATE POLICY project_stages_insert ON public.project_stages FOR INSERT
  WITH CHECK (current_clerk_id() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));
