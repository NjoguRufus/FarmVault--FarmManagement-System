-- Update developer_bootstrap_company to accept Clerk user id explicitly.
-- This avoids relying solely on auth.jwt() inside Postgres and makes the
-- RPC more robust when called from a Clerk-secured frontend.

CREATE OR REPLACE FUNCTION public.current_clerk_id()
RETURNS TEXT AS $$
  SELECT NULLIF(TRIM(auth.jwt() ->> 'sub'), '')::text;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

-- Drop the old function variant (three TEXT args) if it exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'developer_bootstrap_company'
      AND pg_catalog.pg_get_function_identity_arguments(oid) = 'in_clerk_org_id text, in_name text, in_logo_url text'
  ) THEN
    DROP FUNCTION public.developer_bootstrap_company(IN in_clerk_org_id TEXT, IN in_name TEXT, IN in_logo_url TEXT);
  END IF;
END $$;

-- New signature includes in_clerk_user_id so the caller can pass Clerk user id.
CREATE OR REPLACE FUNCTION public.developer_bootstrap_company(
  in_clerk_user_id TEXT,
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
  v_clerk_id TEXT := COALESCE(NULLIF(TRIM(in_clerk_user_id), ''), current_clerk_id());
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
      INSERT INTO public.companies (name, clerk_org_id, created_by_clerk_user_id, logo_url)
      VALUES (
        COALESCE(v_name, 'Developer Company'),
        in_clerk_org_id,
        v_clerk_id,
        in_logo_url
      )
      RETURNING id INTO v_company_id;

      INSERT INTO public.company_members (company_id, user_id, role)
      VALUES (v_company_id, v_clerk_id, 'developer')
      ON CONFLICT (company_id, user_id) DO NOTHING;
    END IF;
  END IF;

  -- 4) Ensure profile exists, points to this company, and is marked as onboarded.
  --    Use clerk_user_id as the stable key so we never write Clerk ids into UUID PK columns.
  INSERT INTO public.profiles (clerk_user_id, company_id, active_company_id, email, full_name, onboarding_complete)
  VALUES (
    v_clerk_id,
    v_company_id,
    v_company_id,
    v_email,
    COALESCE(v_name, v_email, v_clerk_id),
    TRUE
  )
  ON CONFLICT (clerk_user_id) DO UPDATE
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

