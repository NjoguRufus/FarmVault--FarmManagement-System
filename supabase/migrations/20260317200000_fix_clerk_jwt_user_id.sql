-- Fix current_clerk_id() to read from 'user_id' claim instead of 'sub'
-- Clerk doesn't allow setting 'sub' in JWT templates, so we use 'user_id' instead.
-- This migration updates the helper function to check both for backwards compatibility.

CREATE OR REPLACE FUNCTION public.current_clerk_id()
RETURNS TEXT AS $$
  -- Try 'user_id' first (new Clerk JWT template format)
  -- Fall back to 'sub' for backwards compatibility
  SELECT COALESCE(
    NULLIF(TRIM(auth.jwt() ->> 'user_id'), ''),
    NULLIF(TRIM(auth.jwt() ->> 'sub'), '')
  )::text;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

-- Also update in core schema if it exists there
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'core') THEN
    EXECUTE $core$
      CREATE OR REPLACE FUNCTION core.current_clerk_id()
      RETURNS TEXT AS $fn$
        SELECT COALESCE(
          NULLIF(TRIM(auth.jwt() ->> 'user_id'), ''),
          NULLIF(TRIM(auth.jwt() ->> 'sub'), '')
        )::text;
      $fn$ LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path = core, public;
    $core$;
  END IF;
END $$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.current_clerk_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_clerk_id() TO anon;
