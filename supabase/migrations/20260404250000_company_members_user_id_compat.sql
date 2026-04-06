-- =============================================================================
-- FarmVault: company_members.user_id compatibility (Clerk)
--
-- Problem: core.company_members dropped user_id in favor of clerk_user_id, but
-- many policies and helpers still reference public.company_members.user_id (or
-- assume a legacy column exists). That surfaces as:
--   column 'user_id' of relation 'company_members' does not exist
--
-- Fix:
--   1) Add user_id TEXT on core + public company_members, keep it in sync with
--      clerk_user_id via trigger (canonical value remains clerk_user_id).
--   2) Replace core.is_company_member / core.is_company_admin public fallbacks
--      so missing columns never error at parse time.
--   3) Rebuild public.subscriptions RLS to match on clerk_user_id OR user_id.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) core.company_members: mirror column + trigger
-- ---------------------------------------------------------------------------
ALTER TABLE core.company_members
  ADD COLUMN IF NOT EXISTS user_id TEXT;

UPDATE core.company_members
SET user_id = clerk_user_id
WHERE user_id IS NULL
   OR trim(user_id) = ''
   OR user_id IS DISTINCT FROM clerk_user_id;

CREATE OR REPLACE FUNCTION core.trg_company_members_sync_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, public
AS $$
BEGIN
  IF NEW.clerk_user_id IS NOT NULL AND trim(NEW.clerk_user_id) <> '' THEN
    NEW.user_id := NEW.clerk_user_id;
  ELSIF NEW.user_id IS NOT NULL AND trim(NEW.user_id) <> ''
        AND (NEW.clerk_user_id IS NULL OR trim(NEW.clerk_user_id) = '') THEN
    NEW.clerk_user_id := NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_core_company_members_sync_user_id ON core.company_members;
CREATE TRIGGER trg_core_company_members_sync_user_id
  BEFORE INSERT OR UPDATE ON core.company_members
  FOR EACH ROW
  EXECUTE PROCEDURE core.trg_company_members_sync_user_id();


-- ---------------------------------------------------------------------------
-- 2) public.company_members (when present): mirror column + trigger
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.company_members') IS NULL THEN
    RAISE NOTICE '[compat] public.company_members missing — skipped';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.company_members ADD COLUMN IF NOT EXISTS user_id TEXT';
  EXECUTE 'ALTER TABLE public.company_members ADD COLUMN IF NOT EXISTS clerk_user_id TEXT';

  EXECUTE $u$
    UPDATE public.company_members
    SET user_id = clerk_user_id
    WHERE (user_id IS NULL OR trim(user_id) = '')
      AND clerk_user_id IS NOT NULL AND trim(clerk_user_id) <> ''
  $u$;

  EXECUTE $u$
    UPDATE public.company_members
    SET clerk_user_id = user_id
    WHERE (clerk_user_id IS NULL OR trim(clerk_user_id) = '')
      AND user_id IS NOT NULL AND trim(user_id) <> ''
  $u$;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.trg_pub_company_members_sync_user_id()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $b$
    BEGIN
      IF NEW.clerk_user_id IS NOT NULL AND trim(NEW.clerk_user_id) <> '' THEN
        NEW.user_id := NEW.clerk_user_id;
      ELSIF NEW.user_id IS NOT NULL AND trim(NEW.user_id) <> ''
            AND (NEW.clerk_user_id IS NULL OR trim(NEW.clerk_user_id) = '') THEN
        NEW.clerk_user_id := NEW.user_id;
      END IF;
      RETURN NEW;
    END;
    $b$;
  $fn$;

  EXECUTE 'DROP TRIGGER IF EXISTS trg_pub_company_members_sync_user_id ON public.company_members';
  EXECUTE $tr$
    CREATE TRIGGER trg_pub_company_members_sync_user_id
      BEFORE INSERT OR UPDATE ON public.company_members
      FOR EACH ROW
      EXECUTE PROCEDURE public.trg_pub_company_members_sync_user_id()
  $tr$;

  RAISE NOTICE '[compat] public.company_members user_id/clerk_user_id mirrored';
END $$;


-- ---------------------------------------------------------------------------
-- 3) core.is_company_member / core.is_company_admin — safe public fallback
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.is_company_member(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = core, public
AS $$
DECLARE
  v_user_id TEXT;
BEGIN
  v_user_id := core.current_user_id();
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'core' AND table_name = 'company_members' AND column_name = 'clerk_user_id'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM core.company_members m
      WHERE m.company_id = _company_id AND m.clerk_user_id = v_user_id
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'core' AND table_name = 'company_members' AND column_name = 'user_id'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM core.company_members m
      WHERE m.company_id = _company_id AND m.user_id = v_user_id
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  IF to_regclass('public.company_members') IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'company_members' AND column_name = 'clerk_user_id'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.company_id = _company_id AND m.clerk_user_id = v_user_id
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'company_members' AND column_name = 'user_id'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.company_id = _company_id AND m.user_id = v_user_id
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION core.is_company_admin(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = core, public
AS $$
DECLARE
  v_user_id TEXT;
BEGIN
  v_user_id := core.current_user_id();
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'core' AND table_name = 'company_members' AND column_name = 'clerk_user_id'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM core.company_members m
      WHERE m.company_id = _company_id
        AND m.clerk_user_id = v_user_id
        AND m.role IN ('company_admin', 'admin', 'owner')
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'core' AND table_name = 'company_members' AND column_name = 'user_id'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM core.company_members m
      WHERE m.company_id = _company_id
        AND m.user_id = v_user_id
        AND m.role IN ('company_admin', 'admin', 'owner')
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  IF to_regclass('public.company_members') IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'company_members' AND column_name = 'clerk_user_id'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.company_id = _company_id
        AND m.clerk_user_id = v_user_id
        AND m.role IN ('company_admin', 'admin', 'owner')
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'company_members' AND column_name = 'user_id'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.company_id = _company_id
        AND m.user_id = v_user_id
        AND m.role IN ('company_admin', 'admin', 'owner')
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION core.is_company_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION core.is_company_admin(UUID) TO authenticated;


-- ---------------------------------------------------------------------------
-- 4) public.subscriptions RLS — stop hard-depending on user_id only
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  pol RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND table_type = 'BASE TABLE'
  ) THEN
    RAISE NOTICE '[compat] public.subscriptions not a base table — skipped';
    RETURN;
  END IF;

  IF to_regclass('public.company_members') IS NULL THEN
    RAISE NOTICE '[compat] public.company_members missing — subscriptions RLS skipped';
    RETURN;
  END IF;

  ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'subscriptions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.subscriptions', pol.policyname);
  END LOOP;

  EXECUTE $p$
    CREATE POLICY subscriptions_select_member ON public.subscriptions
      FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.company_members m
          WHERE m.company_id = public.subscriptions.company_id
            AND (
              m.clerk_user_id IS NOT DISTINCT FROM public.current_clerk_id()
              OR m.user_id IS NOT DISTINCT FROM public.current_clerk_id()
            )
        )
        OR admin.is_developer()
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY subscriptions_insert_member ON public.subscriptions
      FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.company_members m
          WHERE m.company_id = public.subscriptions.company_id
            AND (
              m.clerk_user_id IS NOT DISTINCT FROM public.current_clerk_id()
              OR m.user_id IS NOT DISTINCT FROM public.current_clerk_id()
            )
            AND m.role = 'company_admin'
        )
        OR admin.is_developer()
      )
  $p$;

  EXECUTE $p$
    CREATE POLICY subscriptions_update_member ON public.subscriptions
      FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.company_members m
          WHERE m.company_id = public.subscriptions.company_id
            AND (
              m.clerk_user_id IS NOT DISTINCT FROM public.current_clerk_id()
              OR m.user_id IS NOT DISTINCT FROM public.current_clerk_id()
            )
            AND m.role = 'company_admin'
        )
        OR admin.is_developer()
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.company_members m
          WHERE m.company_id = public.subscriptions.company_id
            AND (
              m.clerk_user_id IS NOT DISTINCT FROM public.current_clerk_id()
              OR m.user_id IS NOT DISTINCT FROM public.current_clerk_id()
            )
            AND m.role = 'company_admin'
        )
        OR admin.is_developer()
      )
  $p$;

  RAISE NOTICE '[compat] public.subscriptions RLS rebuilt';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
