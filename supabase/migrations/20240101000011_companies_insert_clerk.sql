-- Allow company insert when user is authenticated via Clerk (for onboarding).
-- Fixes: new row violates row-level security policy for table "companies"
-- Existing policies may require auth.uid() (Supabase Auth) or created_by = current_clerk_id();
-- with Clerk, auth.uid() is null and we may not send created_by (0001 schema).

CREATE OR REPLACE FUNCTION public.current_clerk_id()
RETURNS TEXT AS $$
  SELECT NULLIF(TRIM(auth.jwt() ->> 'sub'), '')::text;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

-- Drop every existing INSERT policy on companies (names can vary by migration)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'companies' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.companies', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY companies_insert ON public.companies FOR INSERT
  WITH CHECK (
    current_clerk_id() IS NOT NULL
    OR (auth.jwt() IS NOT NULL AND auth.jwt() ->> 'role' = 'authenticated')
  );
