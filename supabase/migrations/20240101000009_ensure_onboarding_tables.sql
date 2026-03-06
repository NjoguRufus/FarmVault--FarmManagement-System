-- Ensure onboarding tables exist: companies, profiles (Clerk id TEXT PK), company_members.
-- Safe to run on existing DBs: creates tables only if missing; adds columns to profiles if needed.
-- Email/name are read from Clerk in the app; profiles stores active_company_id only if you add optional columns.

-- ============== HELPER: current user id from Clerk JWT ==============
CREATE OR REPLACE FUNCTION public.current_clerk_id()
RETURNS TEXT AS $$
  SELECT NULLIF(TRIM(auth.jwt() ->> 'sub'), '')::text;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

-- ============== COMPANIES (create if not exists) ==============
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'Kenya',
  phone TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============== PROFILES: Clerk user id as primary key (create if not exists) ==============
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  active_company_id UUID,
  permissions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add optional columns to existing profiles (no-op if already exist)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_company_id UUID;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions JSONB;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ============== COMPANY_MEMBERS (create if not exists) ==============
CREATE TABLE IF NOT EXISTS public.company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'company_admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_company_members_company_id ON public.company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user_id ON public.company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_active_company_id ON public.profiles(active_company_id);

-- ============== RLS ==============
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- Helpers for policies (idempotent)
CREATE OR REPLACE FUNCTION public.is_company_member(check_company_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = check_company_id AND user_id = current_clerk_id()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_company_admin_of(check_company_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = check_company_id AND user_id = current_clerk_id() AND role = 'company_admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Drop existing policies if present (so we can recreate)
DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
DROP POLICY IF EXISTS profiles_update ON public.profiles;
DROP POLICY IF EXISTS profiles_delete ON public.profiles;
DROP POLICY IF EXISTS companies_select ON public.companies;
DROP POLICY IF EXISTS companies_insert ON public.companies;
DROP POLICY IF EXISTS companies_update ON public.companies;
DROP POLICY IF EXISTS companies_delete ON public.companies;
DROP POLICY IF EXISTS company_members_select ON public.company_members;
DROP POLICY IF EXISTS company_members_insert ON public.company_members;
DROP POLICY IF EXISTS company_members_update ON public.company_members;
DROP POLICY IF EXISTS company_members_delete ON public.company_members;

-- PROFILES: own row by Clerk id
CREATE POLICY profiles_select ON public.profiles FOR SELECT
  USING (id = current_clerk_id());

CREATE POLICY profiles_insert ON public.profiles FOR INSERT
  WITH CHECK (id = current_clerk_id());

CREATE POLICY profiles_update ON public.profiles FOR UPDATE
  USING (id = current_clerk_id());

CREATE POLICY profiles_delete ON public.profiles FOR DELETE
  USING (id = current_clerk_id());

-- COMPANIES: read if member; insert when created_by = current user
CREATE POLICY companies_select ON public.companies FOR SELECT
  USING (is_company_member(id));

CREATE POLICY companies_insert ON public.companies FOR INSERT
  WITH CHECK (created_by = current_clerk_id());

CREATE POLICY companies_update ON public.companies FOR UPDATE
  USING (is_company_member(id));

CREATE POLICY companies_delete ON public.companies FOR DELETE
  USING (is_company_admin_of(id));

-- COMPANY_MEMBERS: insert when creating company (creator) or when company_admin
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
