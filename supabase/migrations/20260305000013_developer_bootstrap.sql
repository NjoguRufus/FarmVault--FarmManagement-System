-- Developer bootstrap flow for Clerk + Supabase.
-- Creates minimal columns for Clerk org mapping and a single RPC used by the
-- /dev/bootstrap route. Idempotent: calling multiple times will not create
-- duplicate companies or memberships.

-- Ensure helper exists to read Clerk user id from JWT (Clerk sub).
CREATE OR REPLACE FUNCTION public.current_clerk_id()
RETURNS TEXT AS $$
  SELECT NULLIF(TRIM(auth.jwt() ->> 'sub'), '')::text;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

-- Extra metadata on companies for Clerk org + branding.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS clerk_org_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS created_by_clerk_user_id TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Track onboarding completion at profile level so the app can skip the normal wizard.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS active_company_id TEXT;

-- Core RPC used by the developer bootstrap UI.
CREATE OR REPLACE FUNCTION public.developer_bootstrap_company(
  in_clerk_org_id TEXT,
  in_name TEXT,
  in_logo_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clerk_id TEXT := current_clerk_id();
  v_company_id TEXT;
  v_existing_company_id TEXT;
  v_name TEXT := NULLIF(TRIM(in_name), '');
  v_email TEXT;
  v_already BOOLEAN := FALSE;
BEGIN
  IF v_clerk_id IS NULL THEN
    RAISE EXCEPTION 'developer_bootstrap_company: unauthenticated'
      USING ERRCODE = '28000';
  END IF;

  v_email := NULLIF(TRIM(auth.jwt() ->> 'email'), '');

  -- 1) Existing membership for this user: reuse and mark as already bootstrapped.
  IF EXISTS (SELECT 1 FROM public.company_members WHERE user_id = v_clerk_id) THEN
    SELECT company_id
    INTO v_existing_company_id
    FROM public.company_members
    WHERE user_id = v_clerk_id
    ORDER BY created_at ASC
    LIMIT 1;

    v_company_id := v_existing_company_id;
    v_already := TRUE;
  ELSE
    -- 2) Existing company linked to same Clerk org id (e.g. org re-use).
    IF in_clerk_org_id IS NOT NULL THEN
      SELECT id
      INTO v_existing_company_id
      FROM public.companies
      WHERE clerk_org_id = in_clerk_org_id
      LIMIT 1;
    END IF;

    IF v_existing_company_id IS NOT NULL THEN
      v_company_id := v_existing_company_id;
      v_already := TRUE;

      INSERT INTO public.company_members (company_id, user_id, role)
      VALUES (v_company_id, v_clerk_id, 'developer')
      ON CONFLICT (company_id, user_id) DO NOTHING;
    ELSE
      -- 3) Fresh company for this developer.
      v_company_id := gen_random_uuid()::text;

      INSERT INTO public.companies (id, name, clerk_org_id, created_by_clerk_user_id, logo_url)
      VALUES (
        v_company_id,
        COALESCE(v_name, 'Developer Company'),
        in_clerk_org_id,
        v_clerk_id,
        in_logo_url
      );

      INSERT INTO public.company_members (company_id, user_id, role)
      VALUES (v_company_id, v_clerk_id, 'developer')
      ON CONFLICT (company_id, user_id) DO NOTHING;
    END IF;
  END IF;

  -- 4) Ensure profile exists, points to this company, and is marked as onboarded.
  INSERT INTO public.profiles (id, company_id, active_company_id, email, full_name, onboarding_complete)
  VALUES (
    v_clerk_id,
    v_company_id,
    v_company_id,
    v_email,
    COALESCE(v_name, v_email, v_clerk_id),
    TRUE
  )
  ON CONFLICT (id) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        active_company_id = EXCLUDED.active_company_id,
        onboarding_complete = TRUE;

  RETURN json_build_object(
    'company_id',
    v_company_id,
    'already_exists',
    v_already
  );
END;
$$;

