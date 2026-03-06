-- Harden multi-tenant company resolution and guardrails for Clerk-based tenants.

-- 1) core.current_user_id(): Clerk user id from JWT (delegates to public.current_clerk_id()).
CREATE SCHEMA IF NOT EXISTS core;

CREATE OR REPLACE FUNCTION core.current_user_id()
RETURNS TEXT AS $$
  SELECT public.current_clerk_id();
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, core;

-- 2) BEFORE INSERT trigger on companies to ensure created_by_clerk_user_id is always set.
CREATE OR REPLACE FUNCTION core.companies_set_created_by()
RETURNS trigger AS $$
BEGIN
  IF NEW.created_by_clerk_user_id IS NULL THEN
    NEW.created_by_clerk_user_id := core.current_user_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, core;

DROP TRIGGER IF EXISTS set_companies_created_by ON public.companies;
CREATE TRIGGER set_companies_created_by
BEFORE INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION core.companies_set_created_by();

-- 3) RLS guardrails for companies: inserts must be owned by current Clerk user.
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'companies'
      AND policyname = 'companies_insert_owned_by_clerk'
  ) THEN
    CREATE POLICY companies_insert_owned_by_clerk
      ON public.companies
      FOR INSERT
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND (created_by_clerk_user_id IS NULL OR created_by_clerk_user_id = core.current_user_id())
      );
  END IF;
END $$;

-- 4) RLS guardrails for company_members: users can insert memberships only for themselves.
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'company_members'
      AND policyname = 'company_members_insert_self'
  ) THEN
    CREATE POLICY company_members_insert_self
      ON public.company_members
      FOR INSERT
      WITH CHECK (
        auth.uid() IS NOT NULL
        AND user_id = core.current_user_id()
      );
  END IF;
END $$;

-- 5) RLS guardrails for profiles: users can update their own active_company_id.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_update_active_company_self'
  ) THEN
    CREATE POLICY profiles_update_active_company_self
      ON public.profiles
      FOR UPDATE
      USING (clerk_user_id = core.current_user_id())
      WITH CHECK (clerk_user_id = core.current_user_id());
  END IF;
END $$;

