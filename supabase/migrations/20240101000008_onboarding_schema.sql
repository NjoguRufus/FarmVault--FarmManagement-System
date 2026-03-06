-- Onboarding schema: profiles, companies, company_members, subscriptions, projects.
-- Uses Clerk JWT: auth.jwt() ->> 'sub' for user id.
-- Required: Supabase Dashboard → Authentication → JWT Settings — add Clerk as custom JWT issuer
-- so that requests with Authorization: Bearer <Clerk token> set auth.jwt() and sub is available.
-- This migration DROPs and recreates these five tables; run on a fresh project or ensure no
-- other objects depend on the previous companies/profiles/projects/subscriptions/company_members.

-- ============== HELPER: current user id from Clerk JWT ==============
CREATE OR REPLACE FUNCTION current_clerk_id()
RETURNS TEXT AS $$
  SELECT NULLIF(TRIM(auth.jwt() ->> 'sub'), '')::text;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

-- ============== DROP EXISTING (order: dependents first) ==============
DROP TABLE IF EXISTS public.subscriptions;
DROP TABLE IF EXISTS public.company_members;
DROP TABLE IF EXISTS public.projects;
DROP TABLE IF EXISTS public.companies CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ============== PROFILES ==============
CREATE TABLE public.profiles (
  id TEXT PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  active_company_id UUID,
  permissions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============== COMPANIES ==============
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'Kenya',
  phone TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============== COMPANY_MEMBERS ==============
CREATE TABLE public.company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'company_admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

CREATE INDEX idx_company_members_company_id ON public.company_members(company_id);
CREATE INDEX idx_company_members_user_id ON public.company_members(user_id);

-- ============== SUBSCRIPTIONS ==============
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_company_id ON public.subscriptions(company_id);

-- ============== PROJECTS ==============
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  crop_type TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'open_field',
  planting_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_company_id ON public.projects(company_id);

-- ============== RLS ==============
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Helper: is user a member of a given company?
CREATE OR REPLACE FUNCTION is_company_member(check_company_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = check_company_id AND user_id = current_clerk_id()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Helper: is user company_admin of a given company?
CREATE OR REPLACE FUNCTION is_company_admin_of(check_company_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = check_company_id AND user_id = current_clerk_id() AND role = 'company_admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- --------------- PROFILES: own row only ---------------
CREATE POLICY profiles_select ON public.profiles FOR SELECT
  USING (id = current_clerk_id());

CREATE POLICY profiles_insert ON public.profiles FOR INSERT
  WITH CHECK (id = current_clerk_id());

CREATE POLICY profiles_update ON public.profiles FOR UPDATE
  USING (id = current_clerk_id());

CREATE POLICY profiles_delete ON public.profiles FOR DELETE
  USING (id = current_clerk_id());

-- --------------- COMPANIES: read if member ---------------
CREATE POLICY companies_select ON public.companies FOR SELECT
  USING (is_company_member(id));

CREATE POLICY companies_insert ON public.companies FOR INSERT
  WITH CHECK (created_by = current_clerk_id());

CREATE POLICY companies_update ON public.companies FOR UPDATE
  USING (is_company_member(id));

CREATE POLICY companies_delete ON public.companies FOR DELETE
  USING (is_company_admin_of(id));

-- --------------- COMPANY_MEMBERS: read if same company; insert only by company_admin ---------------
CREATE POLICY company_members_select ON public.company_members FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY company_members_insert ON public.company_members FOR INSERT
  WITH CHECK (
    is_company_admin_of(company_id)
    OR (SELECT c.created_by FROM public.companies c WHERE c.id = company_id) = current_clerk_id()
  );

CREATE POLICY company_members_update ON public.company_members FOR UPDATE
  USING (is_company_admin_of(company_id));

CREATE POLICY company_members_delete ON public.company_members FOR DELETE
  USING (is_company_admin_of(company_id));

-- --------------- SUBSCRIPTIONS: read/write if company_admin of company ---------------
CREATE POLICY subscriptions_select ON public.subscriptions FOR SELECT
  USING (is_company_admin_of(company_id));

CREATE POLICY subscriptions_insert ON public.subscriptions FOR INSERT
  WITH CHECK (is_company_admin_of(company_id));

CREATE POLICY subscriptions_update ON public.subscriptions FOR UPDATE
  USING (is_company_admin_of(company_id));

CREATE POLICY subscriptions_delete ON public.subscriptions FOR DELETE
  USING (is_company_admin_of(company_id));

-- --------------- PROJECTS: read/write if member of company ---------------
CREATE POLICY projects_select ON public.projects FOR SELECT
  USING (is_company_member(company_id));

CREATE POLICY projects_insert ON public.projects FOR INSERT
  WITH CHECK (is_company_member(company_id));

CREATE POLICY projects_update ON public.projects FOR UPDATE
  USING (is_company_member(company_id));

CREATE POLICY projects_delete ON public.projects FOR DELETE
  USING (is_company_member(company_id));
