-- =============================================================================
-- FarmVault: Rate Limiting & Feature Restriction System
-- Migration:  20260412000000
-- Auth:       Clerk JWT → current_clerk_id() returns TEXT user ID
-- Plan:       company_subscriptions.plan_code → 'basic' | 'pro'
--
-- Design notes:
--   • get_user_plan() has NO parameters. It resolves the plan for the current
--     session via current_company_id() — the battle-tested helper that already
--     handles all profiles schema drift (company_id vs active_company_id etc).
--     This avoids any direct join against profiles and all column-name issues.
--   • check_rate_limit() takes a TEXT user_id (Clerk user ID). rate_limits.user_id
--     is TEXT — no FK to auth.users since Clerk IDs live outside auth.users.
--   • All RLS policies use current_clerk_id() for identity.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. RATE LIMITS TABLE
--    user_id = Clerk user ID (TEXT). No FK because Clerk IDs are not in
--    auth.users. One row per allowed action attempt in the sliding window.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    text        NOT NULL,        -- Clerk user ID e.g. 'user_2abc...'
  action     text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Composite index drives the sliding-window count query
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action_time
  ON public.rate_limits (user_id, action, created_at DESC);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Block all direct client access; only SECURITY DEFINER functions may touch it
DROP POLICY IF EXISTS "rate_limits_deny_direct" ON public.rate_limits;
CREATE POLICY "rate_limits_deny_direct" ON public.rate_limits
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- =============================================================================
-- 2. get_user_plan()
--    Returns 'basic' | 'pro' for the current session user.
--    Uses current_company_id() — no direct profiles join, zero column drift.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_user_plan()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    nullif(trim(cs.plan_code), ''),
    nullif(trim(cs.plan_id),   ''),
    nullif(trim(cs.plan),      ''),
    'basic'
  )
  FROM public.company_subscriptions cs
  WHERE cs.company_id::text = public.current_company_id()::text
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_plan() TO authenticated;

-- =============================================================================
-- 3. check_rate_limit(p_user_id TEXT, p_action, p_limit_count, p_time_window_secs)
--    Returns TRUE  → within limit + records the attempt.
--    Returns FALSE → limit exceeded; no insert; RLS blocks the row.
--    SECURITY DEFINER: bypasses the deny-all policy on rate_limits.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id          text,     -- Clerk user ID (current_clerk_id())
  p_action           text,
  p_limit_count      integer,
  p_time_window_secs integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count  integer;
  v_window interval := (p_time_window_secs || ' seconds')::interval;
BEGIN
  -- Deny if no identity in context
  IF p_user_id IS NULL OR p_user_id = '' THEN
    RETURN false;
  END IF;

  SELECT count(*)
  INTO   v_count
  FROM   public.rate_limits
  WHERE  user_id    = p_user_id
    AND  action     = p_action
    AND  created_at > now() - v_window;

  IF v_count >= p_limit_count THEN
    RETURN false;    -- limit exceeded; do NOT record this attempt
  END IF;

  -- Record the attempt (auto-rolled back if the outer INSERT transaction fails)
  INSERT INTO public.rate_limits (user_id, action)
  VALUES (p_user_id, p_action);

  RETURN true;
END;
$$;

-- Intentionally not granted to authenticated; called only from SECURITY DEFINER context

-- =============================================================================
-- 4. get_rate_limit_for_action(p_action TEXT)
--    Resolves the per-minute cap for the current session user's plan.
--    Calls get_user_plan() — no parameters needed.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_rate_limit_for_action(
  p_action text
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE public.get_user_plan()

    WHEN 'pro' THEN CASE p_action
      WHEN 'projects_create'           THEN 100
      WHEN 'harvest_collection_create' THEN  40
      WHEN 'harvest_picker_add'        THEN 120
      WHEN 'expenses_create'           THEN 120
      WHEN 'inventory_create'          THEN 100
      WHEN 'records_create'            THEN 150
      WHEN 'season_challenges_create'  THEN  40
      WHEN 'suppliers_create'          THEN  20
      ELSE 50
    END

    ELSE CASE p_action          -- 'basic' or any unknown plan
      WHEN 'projects_create'           THEN  20
      WHEN 'harvest_collection_create' THEN  10
      WHEN 'harvest_picker_add'        THEN  30
      WHEN 'expenses_create'           THEN  40
      WHEN 'inventory_create'          THEN  30
      WHEN 'records_create'            THEN  50
      WHEN 'season_challenges_create'  THEN  10
      WHEN 'suppliers_create'          THEN   5
      ELSE 20
    END

  END;
$$;

GRANT EXECUTE ON FUNCTION public.get_rate_limit_for_action(text) TO authenticated;

-- =============================================================================
-- 5. cleanup_rate_limits()
--    Deletes entries older than 2 hours (safely beyond the 60 s window).
--    Enable pg_cron (Dashboard → Database → Extensions) then uncomment below.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limits
  WHERE created_at < now() - interval '2 hours';
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_rate_limits() TO authenticated;

-- =============================================================================
-- 6–14. RLS POLICIES (conditional — skips tables that are views or missing)
--
-- Many public.* objects in this codebase are views over schema-specific tables
-- (e.g. public.projects → projects.projects). RLS policies can only be applied
-- to real tables (relkind = 'r'). Each block below checks before applying.
-- If a table is a view, enforcement falls back to the Edge Function pre-flight
-- check. The notice log records which policies were applied vs skipped.
-- =============================================================================

DO $$
DECLARE
  v_rk "char";
BEGIN

  -- ── 6. PROJECTS: rate limit + max 2 per farm (basic) ─────────────────────
  SELECT c.relkind INTO v_rk
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'projects';
  IF v_rk = 'r' THEN
    EXECUTE 'DROP POLICY IF EXISTS "projects_rate_and_feature_limit" ON public.projects';
    EXECUTE $pol$
      CREATE POLICY "projects_rate_and_feature_limit" ON public.projects
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (
          public.check_rate_limit(public.current_clerk_id(),
            'projects_create', public.get_rate_limit_for_action('projects_create'), 60)
          AND (
            public.get_user_plan() = 'pro'
            OR (SELECT count(*) FROM public.projects e
                WHERE e.company_id::text = public.current_company_id()::text) < 2
          )
        )
    $pol$;
    RAISE NOTICE 'RLS applied: public.projects';
  ELSE
    RAISE NOTICE 'SKIP public.projects (relkind=%) — not a plain table; rate limiting via Edge Function only.', COALESCE(v_rk::text,'(missing)');
  END IF;

  -- ── 7. EMPLOYEES: max 2 per farm (basic) ──────────────────────────────────
  SELECT c.relkind INTO v_rk
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'employees';
  IF v_rk = 'r' THEN
    EXECUTE 'DROP POLICY IF EXISTS "employees_feature_limit" ON public.employees';
    EXECUTE $pol$
      CREATE POLICY "employees_feature_limit" ON public.employees
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (
          public.get_user_plan() = 'pro'
          OR (SELECT count(*) FROM public.employees e
              WHERE e.company_id::text = public.current_company_id()::text) < 2
        )
    $pol$;
    RAISE NOTICE 'RLS applied: public.employees';
  ELSE
    RAISE NOTICE 'SKIP public.employees (relkind=%).', COALESCE(v_rk::text,'(missing)');
  END IF;

  -- ── 8. HARVEST COLLECTIONS: rate limit ────────────────────────────────────
  SELECT c.relkind INTO v_rk
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'harvest_collections';
  IF v_rk = 'r' THEN
    EXECUTE 'DROP POLICY IF EXISTS "harvest_collections_rate_limit" ON public.harvest_collections';
    EXECUTE $pol$
      CREATE POLICY "harvest_collections_rate_limit" ON public.harvest_collections
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (
          public.check_rate_limit(public.current_clerk_id(),
            'harvest_collection_create',
            public.get_rate_limit_for_action('harvest_collection_create'), 60)
        )
    $pol$;
    RAISE NOTICE 'RLS applied: public.harvest_collections';
  ELSE
    RAISE NOTICE 'SKIP public.harvest_collections (relkind=%).', COALESCE(v_rk::text,'(missing)');
  END IF;

  -- ── 9. HARVEST PICKERS: rate limit + max 50 in roster per company (basic) ──
  --    harvest_pickers is a company-wide picker roster (no collection_id).
  SELECT c.relkind INTO v_rk
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'harvest_pickers';
  IF v_rk = 'r' THEN
    EXECUTE 'DROP POLICY IF EXISTS "harvest_pickers_insert_limits" ON public.harvest_pickers';
    EXECUTE $pol$
      CREATE POLICY "harvest_pickers_insert_limits" ON public.harvest_pickers
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (
          public.check_rate_limit(public.current_clerk_id(),
            'harvest_picker_add',
            public.get_rate_limit_for_action('harvest_picker_add'), 60)
          AND (
            public.get_user_plan() = 'pro'
            OR (SELECT count(*) FROM public.harvest_pickers e
                WHERE e.company_id::text = public.current_company_id()::text) < 50
          )
        )
    $pol$;
    RAISE NOTICE 'RLS applied: public.harvest_pickers';
  ELSE
    RAISE NOTICE 'SKIP public.harvest_pickers (relkind=%).', COALESCE(v_rk::text,'(missing)');
  END IF;

  -- ── 10. EXPENSES: rate limit ───────────────────────────────────────────────
  SELECT c.relkind INTO v_rk
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'expenses';
  IF v_rk = 'r' THEN
    EXECUTE 'DROP POLICY IF EXISTS "expenses_rate_limit" ON public.expenses';
    EXECUTE $pol$
      CREATE POLICY "expenses_rate_limit" ON public.expenses
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (
          public.check_rate_limit(public.current_clerk_id(),
            'expenses_create', public.get_rate_limit_for_action('expenses_create'), 60)
        )
    $pol$;
    RAISE NOTICE 'RLS applied: public.expenses';
  ELSE
    RAISE NOTICE 'SKIP public.expenses (relkind=%).', COALESCE(v_rk::text,'(missing)');
  END IF;

  -- ── 11. INVENTORY ITEMS: rate limit ───────────────────────────────────────
  SELECT c.relkind INTO v_rk
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'inventory_items';
  IF v_rk = 'r' THEN
    EXECUTE 'DROP POLICY IF EXISTS "inventory_items_rate_limit" ON public.inventory_items';
    EXECUTE $pol$
      CREATE POLICY "inventory_items_rate_limit" ON public.inventory_items
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (
          public.check_rate_limit(public.current_clerk_id(),
            'inventory_create', public.get_rate_limit_for_action('inventory_create'), 60)
        )
    $pol$;
    RAISE NOTICE 'RLS applied: public.inventory_items';
  ELSE
    RAISE NOTICE 'SKIP public.inventory_items (relkind=%).', COALESCE(v_rk::text,'(missing)');
  END IF;

  -- ── 12. COMPANY RECORDS: rate limit ───────────────────────────────────────
  SELECT c.relkind INTO v_rk
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'company_records';
  IF v_rk = 'r' THEN
    EXECUTE 'DROP POLICY IF EXISTS "company_records_rate_limit" ON public.company_records';
    EXECUTE $pol$
      CREATE POLICY "company_records_rate_limit" ON public.company_records
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (
          public.check_rate_limit(public.current_clerk_id(),
            'records_create', public.get_rate_limit_for_action('records_create'), 60)
        )
    $pol$;
    RAISE NOTICE 'RLS applied: public.company_records';
  ELSE
    RAISE NOTICE 'SKIP public.company_records (relkind=%).', COALESCE(v_rk::text,'(missing)');
  END IF;

  -- ── 13. SEASON CHALLENGES: rate limit ─────────────────────────────────────
  SELECT c.relkind INTO v_rk
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'season_challenges';
  IF v_rk = 'r' THEN
    EXECUTE 'DROP POLICY IF EXISTS "season_challenges_rate_limit" ON public.season_challenges';
    EXECUTE $pol$
      CREATE POLICY "season_challenges_rate_limit" ON public.season_challenges
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (
          public.check_rate_limit(public.current_clerk_id(),
            'season_challenges_create',
            public.get_rate_limit_for_action('season_challenges_create'), 60)
        )
    $pol$;
    RAISE NOTICE 'RLS applied: public.season_challenges';
  ELSE
    RAISE NOTICE 'SKIP public.season_challenges (relkind=%).', COALESCE(v_rk::text,'(missing)');
  END IF;

  -- ── 14. SUPPLIERS: rate limit ──────────────────────────────────────────────
  SELECT c.relkind INTO v_rk
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'suppliers';
  IF v_rk = 'r' THEN
    EXECUTE 'DROP POLICY IF EXISTS "suppliers_rate_limit" ON public.suppliers';
    EXECUTE $pol$
      CREATE POLICY "suppliers_rate_limit" ON public.suppliers
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (
          public.check_rate_limit(public.current_clerk_id(),
            'suppliers_create', public.get_rate_limit_for_action('suppliers_create'), 60)
        )
    $pol$;
    RAISE NOTICE 'RLS applied: public.suppliers';
  ELSE
    RAISE NOTICE 'SKIP public.suppliers (relkind=%).', COALESCE(v_rk::text,'(missing)');
  END IF;

END $$;

-- =============================================================================
-- 15. OPTIONAL: pg_cron cleanup job
--     Enable pg_cron first: Dashboard → Database → Extensions → pg_cron
-- =============================================================================
-- SELECT cron.schedule(
--   'fv-cleanup-rate-limits',
--   '*/30 * * * *',
--   $$SELECT public.cleanup_rate_limits()$$
-- );

COMMIT;
