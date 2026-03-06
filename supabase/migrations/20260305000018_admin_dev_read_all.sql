-- Admin developer platform-wide read access based on admin.developers.

CREATE SCHEMA IF NOT EXISTS admin;

-- Helper: admin.is_developer() based on admin.developers + Clerk id.
CREATE OR REPLACE FUNCTION admin.is_developer()
RETURNS BOOLEAN AS $$
DECLARE
  v_is_dev BOOLEAN := FALSE;
BEGIN
  -- If admin.developers table is missing, treat as non-developer.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'admin'
      AND c.relname = 'developers'
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM admin.developers d
    WHERE d.clerk_user_id = core.current_user_id()
  )
  INTO v_is_dev;

  RETURN COALESCE(v_is_dev, FALSE);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, core, admin;

-- Add dev_read_all SELECT policies for key tenant tables.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'companies'
      AND policyname = 'companies_dev_read_all'
  ) THEN
    CREATE POLICY companies_dev_read_all
      ON public.companies
      FOR SELECT
      USING (admin.is_developer());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_dev_read_all'
  ) THEN
    CREATE POLICY profiles_dev_read_all
      ON public.profiles
      FOR SELECT
      USING (admin.is_developer());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employees'
      AND policyname = 'employees_dev_read_all'
  ) THEN
    CREATE POLICY employees_dev_read_all
      ON public.employees
      FOR SELECT
      USING (admin.is_developer());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'company_members'
      AND policyname = 'company_members_dev_read_all'
  ) THEN
    CREATE POLICY company_members_dev_read_all
      ON public.company_members
      FOR SELECT
      USING (admin.is_developer());
  END IF;
END $$;

DO $$
BEGIN
  -- Only add policy if subscription_payments table exists in this environment.
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'subscription_payments'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'subscription_payments'
        AND policyname = 'subscription_payments_dev_read_all'
    ) THEN
      CREATE POLICY subscription_payments_dev_read_all
        ON public.subscription_payments
        FOR SELECT
        USING (admin.is_developer());
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  -- Only add policy if company_subscriptions table exists in this environment.
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'company_subscriptions'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'company_subscriptions'
        AND policyname = 'company_subscriptions_dev_read_all'
    ) THEN
      CREATE POLICY company_subscriptions_dev_read_all
        ON public.company_subscriptions
        FOR SELECT
        USING (admin.is_developer());
    END IF;
  END IF;
END $$;

