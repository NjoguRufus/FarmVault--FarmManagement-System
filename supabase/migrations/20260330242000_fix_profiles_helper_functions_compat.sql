-- Compatibility fix (SAFE): some deployments have different profiles PK column names.
--
-- IMPORTANT:
-- Do NOT drop/replace global `current_company_id()` or `is_developer()` here.
-- In some environments those functions have a different return type (e.g. uuid) and are
-- referenced by many existing RLS policies across schemas. Dropping them will fail.
--
-- Instead, create season-challenges-specific helpers that are resilient to column drift.

BEGIN;

-- Returns the current user's company_id as TEXT (best-effort across schema drift).
CREATE OR REPLACE FUNCTION public.fv_current_company_id_text()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  result text;
BEGIN
  result := null;

  -- Prefer the canonical helper used by the app (Clerk-only deployments use auth.jwt()->sub).
  BEGIN
    EXECUTE 'SELECT public.current_company_id()' INTO result;
  EXCEPTION WHEN OTHERS THEN
    result := null;
  END;

  -- Some newer flows store tenant context in core.current_company_id() (uuid).
  IF result IS NULL THEN
    BEGIN
      EXECUTE 'SELECT core.current_company_id()::text' INTO result;
    EXCEPTION WHEN OTHERS THEN
      result := null;
    END;
  END IF;

  -- Last resort: attempt legacy profile lookups keyed by auth.uid() (Supabase Auth UUID).
  IF result IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id'
    ) THEN
      EXECUTE 'SELECT company_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1' INTO result;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'auth_user_id'
    ) THEN
      EXECUTE 'SELECT company_id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1' INTO result;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id'
    ) THEN
      EXECUTE 'SELECT company_id FROM public.profiles WHERE id = auth.uid() LIMIT 1' INTO result;
    END IF;
  END IF;

  RETURN result;
END;
$fn$;

-- Returns true if the current user is a developer (or company admin), across schema drift.
CREATE OR REPLACE FUNCTION public.fv_is_developer()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  result boolean;
BEGIN
  -- Prefer the platform developer gate (admin.developers + Clerk JWT).
  BEGIN
    EXECUTE 'SELECT admin.is_developer()' INTO result;
  EXCEPTION WHEN OTHERS THEN
    result := null;
  END;

  -- Fallback to public role helper where available.
  IF result IS NULL THEN
    BEGIN
      EXECUTE 'SELECT public.is_developer()' INTO result;
    EXCEPTION WHEN OTHERS THEN
      result := null;
    END;
  END IF;

  -- Last resort: legacy profile role checks keyed by auth.uid().
  IF result IS NULL THEN
    result := false;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id'
    ) THEN
      EXECUTE $q$SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid()
          AND (role::text = 'developer')
      )$q$ INTO result;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'auth_user_id'
    ) THEN
      EXECUTE $q$SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE auth_user_id = auth.uid()
          AND (role::text = 'developer')
      )$q$ INTO result;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id'
    ) THEN
      EXECUTE $q$SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND (role::text = 'developer')
      )$q$ INTO result;
    END IF;
  END IF;

  RETURN coalesce(result, false);
END;
$fn$;

-- Hardening: some environments have an older `public.is_developer()` that references `profiles.user_id`.
-- Keep the signature but make it resilient to schema drift.
-- IMPORTANT: returns TRUE only for real developers (NOT company-admins).
CREATE OR REPLACE FUNCTION public.is_developer()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, admin, core
AS $fn$
DECLARE
  result boolean;
BEGIN
  result := null;

  -- Prefer platform developer gate when present (Clerk JWT).
  BEGIN
    result := admin.is_developer();
  EXCEPTION WHEN OTHERS THEN
    result := null;
  END;

  -- Clerk profiles schema: profiles.id = current_clerk_id()
  IF result IS NULL THEN
    BEGIN
      IF public.current_clerk_id() IS NOT NULL
         AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id'
        ) THEN
        SELECT EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = public.current_clerk_id()
            AND p.role::text = 'developer'
        ) INTO result;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      result := null;
    END;
  END IF;

  -- Supabase Auth schema: profiles.user_id = auth.uid()
  IF result IS NULL THEN
    BEGIN
      IF auth.uid() IS NOT NULL
         AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id'
        ) THEN
        SELECT EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.user_id = auth.uid()
            AND p.role::text = 'developer'
        ) INTO result;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      result := null;
    END;
  END IF;

  -- Legacy: profiles.auth_user_id = auth.uid()
  IF result IS NULL THEN
    BEGIN
      IF auth.uid() IS NOT NULL
         AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'auth_user_id'
        ) THEN
        SELECT EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.auth_user_id = auth.uid()
            AND p.role::text = 'developer'
        ) INTO result;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      result := null;
    END;
  END IF;

  RETURN COALESCE(result, false);
END;
$fn$;

COMMIT;

