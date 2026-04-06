-- =============================================================================
-- FarmVault: Normalize Clerk User IDs and Fix RLS
-- Migration: 20260404240000_normalize_clerk_user_ids_and_fix_rls.sql
--
-- Problem:
--   core.company_members has user_id UUID (or is a VIEW with no clerk_user_id),
--   but Clerk sends string IDs like 'user_3BtH5ZUhRts1iNVmGndNOYLTNmR',
--   causing: "invalid input syntax for type uuid".
--
-- Approach (Option A): Convert all user identity columns to TEXT using clerk_user_id.
--   - core.company_members  → ensure clerk_user_id TEXT NOT NULL (required)
--   - public.company_members → guarded (may not exist in all envs)
--   - Rebuild all RLS policies on both tables + public.employees
--   - Refresh all identity helper functions
--
-- Safe to run multiple times (idempotent where possible).
-- Does NOT drop data. Does NOT recreate tables.
-- All public.company_members operations are guarded with existence checks.
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1: core.company_members — normalize to clerk_user_id TEXT
-- =============================================================================

DO $$
DECLARE
  v_relkind       "char";
  v_has_user_id   BOOLEAN := FALSE;
  v_user_id_type  TEXT;
  v_has_cuid      BOOLEAN := FALSE;
  v_has_uid_text  BOOLEAN := FALSE;
  v_pub_exists    BOOLEAN := FALSE;
BEGIN
  -- Check if public.company_members exists (used for seeding)
  SELECT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'company_members'
  ) INTO v_pub_exists;

  -- Determine what core.company_members currently is
  SELECT c.relkind
    INTO v_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'core' AND c.relname = 'company_members';

  RAISE NOTICE '[Step 1] core.company_members relkind=%, public.company_members exists=%',
    COALESCE(v_relkind::text, 'MISSING'), v_pub_exists;

  -- -------------------------------------------------------------------------
  -- CASE A: VIEW → drop and create a proper TABLE
  -- -------------------------------------------------------------------------
  IF v_relkind = 'v' THEN
    EXECUTE 'DROP VIEW IF EXISTS core.company_members CASCADE';

    EXECUTE $create$
      CREATE TABLE core.company_members (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id    UUID        NOT NULL,
        clerk_user_id TEXT        NOT NULL,
        role          TEXT        NOT NULL DEFAULT 'company_admin',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, clerk_user_id)
      )
    $create$;

    -- Seed from public.company_members only if it exists
    IF v_pub_exists THEN
      BEGIN
        EXECUTE $seed$
          INSERT INTO core.company_members (id, company_id, clerk_user_id, role, created_at)
          SELECT
            id,
            company_id,
            COALESCE(
              NULLIF(TRIM(COALESCE(clerk_user_id::TEXT, '')), ''),
              NULLIF(TRIM(user_id::TEXT), '')
            ),
            COALESCE(NULLIF(TRIM(role), ''), 'company_admin'),
            created_at
          FROM public.company_members
          WHERE COALESCE(
            NULLIF(TRIM(COALESCE(clerk_user_id::TEXT, '')), ''),
            NULLIF(TRIM(user_id::TEXT), '')
          ) IS NOT NULL
          ON CONFLICT (id) DO NOTHING
        $seed$;
        RAISE NOTICE '[Step 1A] Seeded from public.company_members';
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '[Step 1A] Seed skipped: %', SQLERRM;
      END;
    ELSE
      RAISE NOTICE '[Step 1A] public.company_members not found — seed skipped';
    END IF;

    RAISE NOTICE '[Step 1A] Converted VIEW → TABLE';
    RETURN;
  END IF;

  -- -------------------------------------------------------------------------
  -- CASE B: Does not exist → create fresh TABLE
  -- -------------------------------------------------------------------------
  IF v_relkind IS NULL THEN
    EXECUTE $create$
      CREATE TABLE core.company_members (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id    UUID        NOT NULL,
        clerk_user_id TEXT        NOT NULL,
        role          TEXT        NOT NULL DEFAULT 'company_admin',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, clerk_user_id)
      )
    $create$;

    IF v_pub_exists THEN
      BEGIN
        EXECUTE $seed$
          INSERT INTO core.company_members (id, company_id, clerk_user_id, role, created_at)
          SELECT
            id,
            company_id,
            COALESCE(
              NULLIF(TRIM(COALESCE(clerk_user_id::TEXT, '')), ''),
              NULLIF(TRIM(user_id::TEXT), '')
            ),
            COALESCE(NULLIF(TRIM(role), ''), 'company_admin'),
            created_at
          FROM public.company_members
          WHERE COALESCE(
            NULLIF(TRIM(COALESCE(clerk_user_id::TEXT, '')), ''),
            NULLIF(TRIM(user_id::TEXT), '')
          ) IS NOT NULL
          ON CONFLICT (id) DO NOTHING
        $seed$;
        RAISE NOTICE '[Step 1B] Seeded from public.company_members';
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '[Step 1B] Seed skipped: %', SQLERRM;
      END;
    END IF;

    RAISE NOTICE '[Step 1B] Created TABLE core.company_members';
    RETURN;
  END IF;

  -- -------------------------------------------------------------------------
  -- CASE C: TABLE exists — inspect and normalize columns
  -- -------------------------------------------------------------------------
  IF v_relkind = 'r' THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'core' AND table_name = 'company_members' AND column_name = 'user_id'
    ) INTO v_has_user_id;

    IF v_has_user_id THEN
      SELECT data_type INTO v_user_id_type
      FROM information_schema.columns
      WHERE table_schema = 'core' AND table_name = 'company_members' AND column_name = 'user_id';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'core' AND table_name = 'company_members' AND column_name = 'clerk_user_id'
    ) INTO v_has_cuid;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'core' AND table_name = 'company_members' AND column_name = 'user_id_text'
    ) INTO v_has_uid_text;

    RAISE NOTICE '[Step 1C] Columns: user_id=%(%), clerk_user_id=%, user_id_text=%',
      v_has_user_id, COALESCE(v_user_id_type, 'n/a'), v_has_cuid, v_has_uid_text;

    -- Add clerk_user_id if missing
    IF NOT v_has_cuid THEN
      EXECUTE 'ALTER TABLE core.company_members ADD COLUMN IF NOT EXISTS clerk_user_id TEXT';
      v_has_cuid := TRUE;
      RAISE NOTICE '[Step 1C] Added clerk_user_id TEXT';
    END IF;

    -- Backfill clerk_user_id from user_id (UUID → TEXT is a start; cross-seed below overwrites)
    IF v_has_user_id THEN
      EXECUTE '
        UPDATE core.company_members
        SET clerk_user_id = user_id::TEXT
        WHERE clerk_user_id IS NULL OR TRIM(clerk_user_id) = ''''
      ';
      RAISE NOTICE '[Step 1C] Backfilled clerk_user_id from user_id (type: %)', v_user_id_type;
    END IF;

    -- Backfill from user_id_text if present (partial-fix artifact)
    IF v_has_uid_text THEN
      EXECUTE '
        UPDATE core.company_members
        SET clerk_user_id = user_id_text
        WHERE (clerk_user_id IS NULL OR TRIM(clerk_user_id) = '''')
          AND user_id_text IS NOT NULL AND TRIM(user_id_text) <> ''''
      ';
      RAISE NOTICE '[Step 1C] Backfilled clerk_user_id from user_id_text';
    END IF;

    -- Cross-seed from public.company_members (authoritative Clerk IDs)
    IF v_pub_exists THEN
      BEGIN
        EXECUTE $seed$
          INSERT INTO core.company_members (id, company_id, clerk_user_id, role, created_at)
          SELECT
            gen_random_uuid(),
            pm.company_id,
            COALESCE(
              NULLIF(TRIM(COALESCE(pm.clerk_user_id::TEXT, '')), ''),
              NULLIF(TRIM(pm.user_id::TEXT), '')
            ),
            COALESCE(NULLIF(TRIM(pm.role), ''), 'company_admin'),
            pm.created_at
          FROM public.company_members pm
          WHERE COALESCE(
            NULLIF(TRIM(COALESCE(pm.clerk_user_id::TEXT, '')), ''),
            NULLIF(TRIM(pm.user_id::TEXT), '')
          ) IS NOT NULL
          ON CONFLICT (company_id, clerk_user_id) DO UPDATE
            SET role = EXCLUDED.role
        $seed$;
        RAISE NOTICE '[Step 1C] Cross-seeded from public.company_members';
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '[Step 1C] Cross-seed skipped: %', SQLERRM;
      END;
    END IF;

    -- Remove rows with no valid clerk_user_id after all backfills
    EXECUTE '
      DELETE FROM core.company_members
      WHERE clerk_user_id IS NULL OR TRIM(clerk_user_id) = ''''
    ';

    -- Set NOT NULL on clerk_user_id
    EXECUTE 'ALTER TABLE core.company_members ALTER COLUMN clerk_user_id SET NOT NULL';

    -- Drop user_id_text (obsolete partial-fix column)
    IF v_has_uid_text THEN
      EXECUTE 'ALTER TABLE core.company_members DROP COLUMN user_id_text CASCADE';
      RAISE NOTICE '[Step 1C] Dropped user_id_text';
    END IF;

    -- Drop user_id (replaced by clerk_user_id); CASCADE removes dependent constraints/indexes
    IF v_has_user_id THEN
      EXECUTE 'ALTER TABLE core.company_members DROP COLUMN user_id CASCADE';
      RAISE NOTICE '[Step 1C] Dropped user_id (was: %)', v_user_id_type;
    END IF;

    -- Ensure UNIQUE(company_id, clerk_user_id)
    BEGIN
      EXECUTE '
        DELETE FROM core.company_members del
        WHERE del.id NOT IN (
          SELECT MIN(id)
          FROM core.company_members
          GROUP BY company_id, clerk_user_id
        )
      ';
      EXECUTE '
        ALTER TABLE core.company_members
          ADD CONSTRAINT uq_core_cm_company_clerk
          UNIQUE (company_id, clerk_user_id)
      ';
      RAISE NOTICE '[Step 1C] Added UNIQUE(company_id, clerk_user_id)';
    EXCEPTION
      WHEN duplicate_object THEN
        RAISE NOTICE '[Step 1C] UNIQUE(company_id, clerk_user_id) already exists';
      WHEN OTHERS THEN
        RAISE NOTICE '[Step 1C] Could not add UNIQUE: %', SQLERRM;
    END;

  END IF; -- relkind = 'r'
END $$;

-- Indexes on core.company_members
CREATE INDEX IF NOT EXISTS idx_core_cm_clerk_user_id ON core.company_members (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_core_cm_company_id    ON core.company_members (company_id);


-- =============================================================================
-- STEP 2: public.company_members — ensure user_id is TEXT (GUARDED)
-- Entire step is skipped when public.company_members does not exist.
-- =============================================================================

DO $$
DECLARE
  v_pub_relkind "char";
  v_type        TEXT;
  v_converted   BOOLEAN := FALSE;
BEGIN
  SELECT c.relkind INTO v_pub_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'company_members';

  IF v_pub_relkind IS NULL THEN
    RAISE NOTICE '[Step 2] public.company_members does not exist — skipped';
    RETURN;
  END IF;

  IF v_pub_relkind <> 'r' THEN
    RAISE NOTICE '[Step 2] public.company_members is not a table (relkind=%) — skipped', v_pub_relkind;
    RETURN;
  END IF;

  -- Check user_id column type
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'company_members'
    AND column_name  = 'user_id';

  IF v_type = 'uuid' THEN
    DECLARE r RECORD;
    BEGIN
      -- Drop constraints that block the type change
      FOR r IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.conrelid = 'public.company_members'::regclass
          AND a.attname = 'user_id'
          AND c.contype IN ('u','p')
      LOOP
        EXECUTE format('ALTER TABLE public.company_members DROP CONSTRAINT IF EXISTS %I', r.conname);
      END LOOP;
    END;

    EXECUTE 'ALTER TABLE public.company_members ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT';
    v_converted := TRUE;
    RAISE NOTICE '[Step 2] Converted public.company_members.user_id UUID → TEXT';
  ELSE
    RAISE NOTICE '[Step 2] public.company_members.user_id is % — no change', COALESCE(v_type,'MISSING');
  END IF;

  -- Add clerk_user_id alias column for dual-key compatibility
  EXECUTE 'ALTER TABLE public.company_members ADD COLUMN IF NOT EXISTS clerk_user_id TEXT';
  EXECUTE '
    UPDATE public.company_members
    SET clerk_user_id = user_id
    WHERE clerk_user_id IS NULL AND user_id IS NOT NULL
  ';
  RAISE NOTICE '[Step 2] Ensured clerk_user_id on public.company_members';

  -- UUID→TEXT conversion drops UNIQUE(company_id, user_id) when that constraint
  -- included user_id. Recreate a single canonical unique index (idempotent name).
  BEGIN
    IF v_converted
       AND NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'uq_pub_company_members_company_user'
        AND c.relkind = 'i'
    ) THEN
      EXECUTE '
        DELETE FROM public.company_members del
        WHERE del.ctid NOT IN (
          SELECT MIN(m.ctid)
          FROM public.company_members m
          GROUP BY m.company_id, m.user_id
        )
      ';
      EXECUTE '
        CREATE UNIQUE INDEX uq_pub_company_members_company_user
        ON public.company_members (company_id, user_id)
      ';
      RAISE NOTICE '[Step 2] Created UNIQUE index on (company_id, user_id)';
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE '[Step 2] Could not create UNIQUE(company_id, user_id): %', SQLERRM;
  END;
END $$;


-- =============================================================================
-- STEP 3: Remove UUID-coercion triggers added during failed fix attempts
-- =============================================================================

DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN
    SELECT trigger_name, event_object_schema || '.' || event_object_table AS tbl
    FROM information_schema.triggers
    WHERE trigger_schema IN ('core','public')
      AND (
        trigger_name ILIKE '%coerce%user%'
        OR trigger_name ILIKE '%user%coerce%'
        OR trigger_name ILIKE '%uuid_text%'
        OR trigger_name ILIKE '%text_uuid%'
        OR trigger_name ILIKE '%user_id_cast%'
        OR trigger_name ILIKE '%user_id_text%'
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', t.trigger_name, t.tbl);
    RAISE NOTICE '[Step 3] Dropped trigger: % on %', t.trigger_name, t.tbl;
  END LOOP;
END $$;


-- =============================================================================
-- STEP 4: Canonical identity and tenant-context functions
-- =============================================================================

-- 4.1 — Primary Clerk ID reader: 'user_id' claim first, 'sub' fallback
CREATE OR REPLACE FUNCTION public.current_clerk_id()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(TRIM(auth.jwt() ->> 'user_id'), ''),
    NULLIF(TRIM(auth.jwt() ->> 'sub'),     '')
  )::TEXT;
$$;

GRANT EXECUTE ON FUNCTION public.current_clerk_id() TO authenticated, anon;

-- 4.2 — core schema alias
CREATE OR REPLACE FUNCTION core.current_user_id()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, core
AS $$
  SELECT public.current_clerk_id();
$$;

GRANT EXECUTE ON FUNCTION core.current_user_id() TO authenticated, anon;

-- 4.3 — Resolve current tenant company UUID
--   Priority: core.profiles.active_company_id → latest core.company_members row
CREATE OR REPLACE FUNCTION core.current_company_id()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = core, public
AS $$
DECLARE
  v_uid TEXT;
  v_cid UUID;
BEGIN
  v_uid := core.current_user_id();
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT p.active_company_id INTO v_cid
  FROM core.profiles p
  WHERE p.clerk_user_id = v_uid
  LIMIT 1;

  IF v_cid IS NOT NULL THEN RETURN v_cid; END IF;

  SELECT m.company_id INTO v_cid
  FROM core.company_members m
  WHERE m.clerk_user_id = v_uid
  ORDER BY m.created_at DESC NULLS LAST
  LIMIT 1;

  RETURN v_cid;
END;
$$;

GRANT EXECUTE ON FUNCTION core.current_company_id() TO authenticated;

-- 4.4 — Public wrapper (supabase.rpc frontend calls)
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = core, public
AS $$
  SELECT core.current_company_id();
$$;

GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;

-- 4.5 — is_company_member
--   Uses PL/pgSQL so the public.company_members fallback can be skipped gracefully
--   when that table does not exist in this environment.
CREATE OR REPLACE FUNCTION public.is_company_member(check_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = core, public
AS $$
DECLARE
  v_uid TEXT;
  v_res BOOLEAN := FALSE;
BEGIN
  v_uid := core.current_user_id();
  IF v_uid IS NULL THEN RETURN FALSE; END IF;

  -- Primary: core.company_members
  SELECT EXISTS (
    SELECT 1 FROM core.company_members
    WHERE company_id    = check_company_id
      AND clerk_user_id = v_uid
  ) INTO v_res;

  IF v_res THEN RETURN TRUE; END IF;

  -- Fallback: public.company_members (may not exist)
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.company_members
      WHERE company_id = check_company_id
        AND user_id    = v_uid
    ) INTO v_res;
  EXCEPTION WHEN undefined_table THEN
    v_res := FALSE;
  END;

  RETURN COALESCE(v_res, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_company_member(UUID) TO authenticated;

-- 4.6 — is_company_admin_of
CREATE OR REPLACE FUNCTION public.is_company_admin_of(check_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = core, public
AS $$
DECLARE
  v_uid TEXT;
  v_res BOOLEAN := FALSE;
BEGIN
  v_uid := core.current_user_id();
  IF v_uid IS NULL THEN RETURN FALSE; END IF;

  SELECT EXISTS (
    SELECT 1 FROM core.company_members
    WHERE company_id    = check_company_id
      AND clerk_user_id = v_uid
      AND role IN ('company_admin','admin','owner')
  ) INTO v_res;

  IF v_res THEN RETURN TRUE; END IF;

  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.company_members
      WHERE company_id = check_company_id
        AND user_id    = v_uid
        AND role IN ('company_admin','admin')
    ) INTO v_res;
  EXCEPTION WHEN undefined_table THEN
    v_res := FALSE;
  END;

  RETURN COALESCE(v_res, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_company_admin_of(UUID) TO authenticated;

-- 4.7 — row_company_matches_user: TEXT company_id → compare with current UUID company
CREATE OR REPLACE FUNCTION public.row_company_matches_user(row_company_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, core
AS $$
DECLARE
  v_row TEXT;
  v_cur UUID;
BEGIN
  v_row := NULLIF(TRIM(COALESCE(row_company_id, '')), '');
  IF v_row IS NULL THEN
    RETURN core.current_company_id() IS NULL;
  END IF;

  v_cur := core.current_company_id();
  IF v_cur IS NULL THEN RETURN FALSE; END IF;

  BEGIN
    RETURN v_row::UUID = v_cur;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN v_row = v_cur::TEXT;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.row_company_matches_user(TEXT) TO authenticated;

-- UUID overload: public.employees.company_id is UUID in some deployments
CREATE OR REPLACE FUNCTION public.row_company_matches_user(row_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, core
AS $$
  SELECT public.row_company_matches_user(row_company_id::text);
$$;

GRANT EXECUTE ON FUNCTION public.row_company_matches_user(UUID) TO authenticated;

-- 4.8 — is_manager: checks public.profiles + core.company_members manager roles
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, core
AS $$
DECLARE
  v_uid TEXT;
  v_res BOOLEAN := FALSE;
BEGIN
  v_uid := core.current_user_id();
  IF v_uid IS NULL THEN RETURN FALSE; END IF;

  -- Check public.profiles role
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_uid
        AND p.role IN ('manager','operations-manager')
    ) INTO v_res;
  EXCEPTION WHEN OTHERS THEN
    v_res := FALSE;
  END;

  IF v_res THEN RETURN TRUE; END IF;

  -- Check core.company_members role
  SELECT EXISTS (
    SELECT 1 FROM core.company_members m
    WHERE m.clerk_user_id = v_uid
      AND m.role IN ('manager','supervisor','farm_manager','operations-manager')
  ) INTO v_res;

  RETURN COALESCE(v_res, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated;


-- =============================================================================
-- STEP 5: RLS policies — clean slate + canonical rebuild
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 5.1  core.company_members
-- ---------------------------------------------------------------------------

ALTER TABLE core.company_members ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'core' AND tablename = 'company_members'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON core.company_members', pol.policyname);
  END LOOP;
END $$;

-- service_role: unrestricted
CREATE POLICY cm_service ON core.company_members
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- SELECT: own memberships only
-- Note: core.current_company_id() is SECURITY DEFINER so it bypasses this policy
CREATE POLICY cm_select_own ON core.company_members
  FOR SELECT TO authenticated
  USING (clerk_user_id = core.current_user_id());

-- INSERT: own membership only
-- create_company_with_admin inserts via SECURITY DEFINER, bypasses this
CREATE POLICY cm_insert_self ON core.company_members
  FOR INSERT TO authenticated
  WITH CHECK (clerk_user_id = core.current_user_id());

-- UPDATE / DELETE: own record or developer
-- Admin role changes go through SECURITY DEFINER functions, bypassing RLS
CREATE POLICY cm_update ON core.company_members
  FOR UPDATE TO authenticated
  USING (
    admin.is_developer()
    OR clerk_user_id = core.current_user_id()
  );

CREATE POLICY cm_delete ON core.company_members
  FOR DELETE TO authenticated
  USING (
    admin.is_developer()
    OR clerk_user_id = core.current_user_id()
  );


-- ---------------------------------------------------------------------------
-- 5.2  public.company_members — fully guarded
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_relkind "char";
  pol       RECORD;
BEGIN
  SELECT c.relkind INTO v_relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'company_members';

  IF v_relkind IS NULL THEN
    RAISE NOTICE '[Step 5.2] public.company_members does not exist — skipped';
    RETURN;
  END IF;

  IF v_relkind <> 'r' THEN
    RAISE NOTICE '[Step 5.2] public.company_members is not a table — skipped';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY';

  -- Drop all existing policies
  FOR pol IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'company_members'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.company_members', pol.policyname);
  END LOOP;

  -- service_role
  EXECUTE $p$
    CREATE POLICY pub_cm_service ON public.company_members
      FOR ALL TO service_role
      USING (true) WITH CHECK (true)
  $p$;

  -- SELECT: own row or developer
  EXECUTE $p$
    CREATE POLICY pub_cm_select ON public.company_members
      FOR SELECT TO authenticated
      USING (
        user_id = core.current_user_id()
        OR admin.is_developer()
      )
  $p$;

  -- INSERT: self, company creator, or developer
  EXECUTE $p$
    CREATE POLICY pub_cm_insert ON public.company_members
      FOR INSERT TO authenticated
      WITH CHECK (
        user_id = core.current_user_id()
        OR admin.is_developer()
        OR (
          SELECT c.created_by
          FROM public.companies c
          WHERE c.id::text = company_id::text
        ) = core.current_user_id()
      )
  $p$;

  -- UPDATE
  EXECUTE $p$
    CREATE POLICY pub_cm_update ON public.company_members
      FOR UPDATE TO authenticated
      USING (
        user_id = core.current_user_id()
        OR admin.is_developer()
      )
  $p$;

  -- DELETE
  EXECUTE $p$
    CREATE POLICY pub_cm_delete ON public.company_members
      FOR DELETE TO authenticated
      USING (
        user_id = core.current_user_id()
        OR admin.is_developer()
      )
  $p$;

  RAISE NOTICE '[Step 5.2] RLS rebuilt on public.company_members';
END $$;


-- ---------------------------------------------------------------------------
-- 5.3  public.employees
-- ---------------------------------------------------------------------------

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'employees'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.employees', pol.policyname);
  END LOOP;
END $$;

-- service_role
CREATE POLICY employees_service ON public.employees
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- SELECT: developer OR same company OR own employee record (if clerk_user_id column exists)
DO $$
DECLARE has_cuid BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'employees'
      AND column_name  = 'clerk_user_id'
  ) INTO has_cuid;

  IF has_cuid THEN
    EXECUTE $pol$
      CREATE POLICY employees_select ON public.employees
        FOR SELECT TO authenticated
        USING (
          admin.is_developer()
          OR public.row_company_matches_user(company_id)
          OR clerk_user_id = core.current_user_id()
        )
    $pol$;
  ELSE
    EXECUTE $pol$
      CREATE POLICY employees_select ON public.employees
        FOR SELECT TO authenticated
        USING (
          admin.is_developer()
          OR public.row_company_matches_user(company_id)
        )
    $pol$;
  END IF;
END $$;

-- INSERT: developer OR admin/manager of current company
-- Compare as text so uuid and text company_id columns both work (no uuid = text).
CREATE POLICY employees_insert ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (
    admin.is_developer()
    OR (
      company_id::text = core.current_company_id()::text
      AND (
        public.is_company_admin_of(core.current_company_id())
        OR public.is_manager()
      )
    )
  );

-- UPDATE: developer OR same company
CREATE POLICY employees_update ON public.employees
  FOR UPDATE TO authenticated
  USING (
    admin.is_developer()
    OR public.row_company_matches_user(company_id)
  );

-- DELETE: developer OR same company
CREATE POLICY employees_delete ON public.employees
  FOR DELETE TO authenticated
  USING (
    admin.is_developer()
    OR public.row_company_matches_user(company_id)
  );


-- =============================================================================
-- STEP 5.4: core.create_company_with_admin — TEXT identity + clerk_user_id member row
-- (Idempotent; keeps onboarding correct if older function versions drifted.)
-- =============================================================================

ALTER TABLE core.profiles
  ADD COLUMN IF NOT EXISTS user_type text NOT NULL DEFAULT 'company_admin';

-- Drop every overload (e.g. text vs varchar) so resolution is unambiguous (fixes 42725).
-- Order: dependents first (create_company_and_admin calls create_company_with_admin).
DO $$
DECLARE
  sig text;
BEGIN
  FOR sig IN
    SELECT format(
      'public.create_company_with_admin(%s)',
      pg_catalog.pg_get_function_identity_arguments(p.oid)
    )
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_company_with_admin'
      AND p.prokind = 'f'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || sig;
  END LOOP;

  FOR sig IN
    SELECT format(
      'core.create_company_and_admin(%s)',
      pg_catalog.pg_get_function_identity_arguments(p.oid)
    )
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'core'
      AND p.proname = 'create_company_and_admin'
      AND p.prokind = 'f'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || sig;
  END LOOP;

  FOR sig IN
    SELECT format(
      'core.create_company_with_admin(%s)',
      pg_catalog.pg_get_function_identity_arguments(p.oid)
    )
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'core'
      AND p.proname = 'create_company_with_admin'
      AND p.prokind = 'f'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION core.create_company_with_admin(_name text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = core, public
AS $$
DECLARE
  v_user_id    text;
  v_norm_name  text;
  v_company_id uuid;
BEGIN
  v_user_id := core.current_user_id();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'create_company_with_admin: unauthenticated' USING errcode = '28000';
  END IF;

  v_norm_name := lower(trim(_name));
  IF v_norm_name IS NULL OR v_norm_name = '' THEN
    RAISE EXCEPTION 'create_company_with_admin: empty company name' USING errcode = '22023';
  END IF;

  SELECT c.id
  INTO v_company_id
  FROM core.companies c
  LEFT JOIN core.company_members m
    ON m.company_id = c.id
   AND m.clerk_user_id = v_user_id
  WHERE lower(trim(c.name)) = v_norm_name
    AND (c.created_by = v_user_id OR m.clerk_user_id IS NOT NULL)
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF v_company_id IS NULL THEN
    INSERT INTO core.companies (name, created_by)
    VALUES (_name, v_user_id)
    RETURNING id INTO v_company_id;
  END IF;

  INSERT INTO core.profiles (clerk_user_id, active_company_id, created_at, updated_at, user_type)
  VALUES (v_user_id, v_company_id, now(), now(), 'company_admin')
  ON CONFLICT (clerk_user_id) DO UPDATE
    SET active_company_id = excluded.active_company_id,
        updated_at        = now(),
        user_type         = CASE
                              WHEN core.profiles.user_type = 'ambassador' THEN 'both'
                              ELSE core.profiles.user_type
                            END;

  INSERT INTO core.company_members (company_id, clerk_user_id, role)
  VALUES (v_company_id, v_user_id, 'company_admin')
  ON CONFLICT (company_id, clerk_user_id) DO UPDATE
    SET role = excluded.role;

  RETURN v_company_id;
END;
$$;

REVOKE ALL ON FUNCTION core.create_company_with_admin(text) FROM public;
GRANT EXECUTE ON FUNCTION core.create_company_with_admin(text) TO authenticated;

-- Backwards-compatible alias (older RPCs); must match single core implementation.
CREATE OR REPLACE FUNCTION core.create_company_and_admin(_name text)
RETURNS uuid
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = core, public
AS $$
  SELECT core.create_company_with_admin(_name::text);
$$;

REVOKE ALL ON FUNCTION core.create_company_and_admin(text) FROM public;
GRANT EXECUTE ON FUNCTION core.create_company_and_admin(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_company_with_admin(_name text)
RETURNS uuid
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = core, public
AS $$
  SELECT core.create_company_with_admin(_name::text);
$$;

REVOKE ALL ON FUNCTION public.create_company_with_admin(text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_company_with_admin(text) TO authenticated;


-- =============================================================================
-- STEP 6: Grants
-- =============================================================================

GRANT USAGE ON SCHEMA core  TO authenticated;
GRANT USAGE ON SCHEMA admin TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON core.company_members TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON core.profiles         TO authenticated;

GRANT EXECUTE ON FUNCTION admin.is_developer()                  TO authenticated;
GRANT EXECUTE ON FUNCTION core.current_user_id()                TO authenticated;
GRANT EXECUTE ON FUNCTION core.current_company_id()             TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_member(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_admin_of(UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.row_company_matches_user(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.row_company_matches_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager()                   TO authenticated;


-- =============================================================================
-- STEP 7: Reload PostgREST schema cache
-- =============================================================================

NOTIFY pgrst, 'reload schema';

COMMIT;
