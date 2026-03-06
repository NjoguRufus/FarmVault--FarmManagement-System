-- Permissive RLS policies so onboarding can: create company, add membership, update profile.
-- Run this in SQL Editor or via: npx supabase db push

-- Ensure RLS is enabled
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- ============== COMPANIES: drop existing policies then create new ones ==============
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'companies'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.companies', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "users can create companies"
  ON public.companies FOR INSERT
  WITH CHECK (true);

CREATE POLICY "users can read companies"
  ON public.companies FOR SELECT
  USING (true);

-- ============== PROFILES: drop existing policies then create new ones ==============
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "users can create profile"
  ON public.profiles FOR INSERT
  WITH CHECK (true);

CREATE POLICY "users can read profile"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "users can update profile"
  ON public.profiles FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ============== COMPANY_MEMBERS: drop existing policies then create new ones ==============
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'company_members'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.company_members', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "users can add membership"
  ON public.company_members FOR INSERT
  WITH CHECK (true);

CREATE POLICY "users can read memberships"
  ON public.company_members FOR SELECT
  USING (true);
