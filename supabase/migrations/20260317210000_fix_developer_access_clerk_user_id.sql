-- Fix admin.developers table and admin.is_developer() function to use Clerk user IDs (text)
-- instead of auth.uid() (uuid).
--
-- The 20260316100000_developer_intelligence_center.sql migration incorrectly changed:
-- 1. admin.developers.user_id to uuid (should be clerk_user_id text)
-- 2. admin.is_developer() to use auth.uid() (should use core.current_user_id() / Clerk JWT)
--
-- This migration fixes both issues to restore developer access for Clerk-authenticated users.

-- =========================================================
-- 1) FIX admin.developers TABLE STRUCTURE
-- =========================================================
-- Add clerk_user_id column if missing (the correct key for Clerk-based auth)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'admin'
      AND table_name = 'developers'
      AND column_name = 'clerk_user_id'
  ) THEN
    ALTER TABLE admin.developers ADD COLUMN clerk_user_id TEXT;
  END IF;
  
  -- Add is_active column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'admin'
      AND table_name = 'developers'
      AND column_name = 'is_active'
  ) THEN
    ALTER TABLE admin.developers ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
END $$;

-- Copy existing user_id values to clerk_user_id if user_id column exists
-- (In case some UUIDs were stored, though they won't match Clerk IDs)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'admin'
      AND table_name = 'developers'
      AND column_name = 'user_id'
  ) THEN
    UPDATE admin.developers
    SET clerk_user_id = user_id::text
    WHERE clerk_user_id IS NULL AND user_id IS NOT NULL;
  END IF;
END $$;

-- Create index on clerk_user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_admin_developers_clerk_user_id
ON admin.developers (clerk_user_id);

-- =========================================================
-- 2) FIX admin.is_developer() FUNCTION
-- =========================================================
-- This function must use core.current_user_id() (Clerk JWT user_id claim)
-- NOT auth.uid() (which is Supabase Auth UUID, not set for Clerk users)

CREATE OR REPLACE FUNCTION admin.is_developer()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = admin, core, public
AS $$
DECLARE
  v_is_dev boolean := false;
  v_user text;
BEGIN
  -- Get Clerk user ID from JWT (via core.current_user_id or public.current_clerk_id)
  BEGIN
    v_user := core.current_user_id();
  EXCEPTION WHEN OTHERS THEN
    v_user := NULL;
  END;
  
  -- Fallback to public.current_clerk_id if core function unavailable
  IF v_user IS NULL THEN
    BEGIN
      v_user := public.current_clerk_id();
    EXCEPTION WHEN OTHERS THEN
      v_user := NULL;
    END;
  END IF;
  
  IF v_user IS NULL THEN
    RETURN false;
  END IF;

  -- Check if admin.developers table exists
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'admin'
      AND table_name = 'developers'
  ) THEN
    RETURN false;
  END IF;

  -- Check by clerk_user_id (text column - correct for Clerk auth)
  SELECT EXISTS (
    SELECT 1
    FROM admin.developers d
    WHERE d.clerk_user_id = v_user
      AND (d.is_active IS NULL OR d.is_active = true)
  )
  INTO v_is_dev;

  RETURN COALESCE(v_is_dev, false);
END;
$$;

-- Also fix the overloaded version that takes a user_id parameter
CREATE OR REPLACE FUNCTION admin.is_developer(p_clerk_user_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, admin
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admin.developers d
    WHERE d.clerk_user_id = p_clerk_user_id
      AND (d.is_active IS NULL OR d.is_active = true)
  );
$$;

-- =========================================================
-- 3) FIX developer.assert_developer() FUNCTION
-- =========================================================
CREATE OR REPLACE FUNCTION developer.assert_developer()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, admin, developer
AS $$
BEGIN
  IF NOT admin.is_developer() THEN
    RAISE EXCEPTION 'Developer access required';
  END IF;
END;
$$;

-- =========================================================
-- 4) ENSURE DEVELOPER ROW EXISTS FOR KNOWN DEVELOPERS
-- =========================================================
-- Insert farmvaultke@gmail.com developer if not present
INSERT INTO admin.developers (clerk_user_id, email, is_active, created_at)
VALUES ('user_3B4LAH4EICHODSUUFJI3CFXTXS6', 'farmvaultke@gmail.com', true, NOW())
ON CONFLICT DO NOTHING;

-- Also try inserting with unique constraint handling
DO $$
BEGIN
  -- Check if row already exists by clerk_user_id
  IF NOT EXISTS (
    SELECT 1 FROM admin.developers WHERE clerk_user_id = 'user_3B4LAH4EICHODSUUFJI3CFXTXS6'
  ) THEN
    -- Try to insert, handling any constraint violations
    BEGIN
      INSERT INTO admin.developers (clerk_user_id, email, is_active, full_name, created_at)
      VALUES (
        'user_3B4LAH4EICHODSUUFJI3CFXTXS6',
        'farmvaultke@gmail.com',
        true,
        'FarmVault Developer',
        NOW()
      );
    EXCEPTION WHEN unique_violation THEN
      -- Update existing row to set clerk_user_id
      UPDATE admin.developers
      SET clerk_user_id = 'user_3B4LAH4EICHODSUUFJI3CFXTXS6',
          is_active = true
      WHERE email = 'farmvaultke@gmail.com';
    END;
  ELSE
    -- Ensure is_active is true
    UPDATE admin.developers
    SET is_active = true
    WHERE clerk_user_id = 'user_3B4LAH4EICHODSUUFJI3CFXTXS6';
  END IF;
END $$;

-- =========================================================
-- 5) FIX RLS POLICIES ON admin.developers
-- =========================================================
DROP POLICY IF EXISTS developers_select_self_or_developer ON admin.developers;
CREATE POLICY developers_select_self_or_developer
ON admin.developers
FOR SELECT
TO authenticated
USING (
  clerk_user_id = COALESCE(core.current_user_id(), public.current_clerk_id())
  OR EXISTS (
    SELECT 1
    FROM admin.developers d
    WHERE d.clerk_user_id = COALESCE(core.current_user_id(), public.current_clerk_id())
      AND (d.is_active IS NULL OR d.is_active = true)
  )
);

-- =========================================================
-- 6) GRANT EXECUTE PERMISSIONS
-- =========================================================
GRANT EXECUTE ON FUNCTION admin.is_developer() TO authenticated;
GRANT EXECUTE ON FUNCTION admin.is_developer(text) TO authenticated;
GRANT EXECUTE ON FUNCTION developer.assert_developer() TO authenticated;

-- =========================================================
-- 7) CREATE PUBLIC WRAPPERS FOR developer.* FUNCTIONS
-- =========================================================
-- The frontend calls supabase.rpc('list_companies', { p_search, p_limit, p_offset })
-- which needs to resolve to developer.list_companies or a public wrapper.

-- Drop any existing public.list_companies that might conflict
DROP FUNCTION IF EXISTS public.list_companies(text, int, int);

-- Create wrapper that delegates to developer.list_companies
CREATE OR REPLACE FUNCTION public.list_companies(
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, developer, admin
AS $$
  SELECT developer.list_companies(p_search, p_limit, p_offset);
$$;

-- Similarly for list_users
-- Frontend calls with 3 params (p_search, p_limit, p_offset), not 4
DROP FUNCTION IF EXISTS public.list_users(text, int, int);
DROP FUNCTION IF EXISTS public.list_users(text, uuid, int, int);

-- Create wrapper matching frontend signature (3 params)
CREATE OR REPLACE FUNCTION public.list_users(
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, developer, admin
AS $$
  SELECT developer.list_users(p_search, NULL::uuid, p_limit, p_offset);
$$;

GRANT EXECUTE ON FUNCTION public.list_companies(text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_users(text, int, int) TO authenticated;

-- =========================================================
-- 8) FIX admin.bootstrap_developer FOR NEW TABLE SCHEMA
-- =========================================================
-- The table now has: id uuid PK, clerk_user_id text UNIQUE, email text, role text, is_active boolean

CREATE OR REPLACE FUNCTION admin.bootstrap_developer(_email text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = admin, core, public
AS $$
DECLARE
  v_user text;
BEGIN
  -- Get current user's Clerk ID
  BEGIN
    v_user := core.current_user_id();
  EXCEPTION WHEN OTHERS THEN
    v_user := NULL;
  END;
  
  IF v_user IS NULL THEN
    BEGIN
      v_user := public.current_clerk_id();
    EXCEPTION WHEN OTHERS THEN
      v_user := NULL;
    END;
  END IF;
  
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'bootstrap_developer: unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- Insert or update developer record
  INSERT INTO admin.developers (id, clerk_user_id, email, role, is_active, created_at)
  VALUES (gen_random_uuid(), v_user, _email, 'developer', true, now())
  ON CONFLICT (clerk_user_id) DO UPDATE
    SET email = EXCLUDED.email,
        is_active = true;
END;
$$;

-- Update the public wrapper to use VOLATILE (since it modifies data)
CREATE OR REPLACE FUNCTION public.bootstrap_developer(_email text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = admin, core, public
AS $$
BEGIN
  PERFORM admin.bootstrap_developer(_email);
END;
$$;

GRANT EXECUTE ON FUNCTION admin.bootstrap_developer(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_developer(text) TO authenticated;

-- =========================================================
-- 9) DIAGNOSTIC: Log current state for debugging
-- =========================================================
DO $$
DECLARE
  v_dev_count int;
  v_clerk_dev_count int;
BEGIN
  SELECT COUNT(*) INTO v_dev_count FROM admin.developers;
  SELECT COUNT(*) INTO v_clerk_dev_count FROM admin.developers WHERE clerk_user_id IS NOT NULL;
  RAISE NOTICE 'admin.developers: % total rows, % with clerk_user_id set', v_dev_count, v_clerk_dev_count;
END $$;
