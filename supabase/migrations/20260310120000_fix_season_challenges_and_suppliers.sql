-- Safe repair: ensure critical tables exist in public schema.
-- This is idempotent and avoids breaking existing deployments.

-- ============== season_challenges ==============
CREATE TABLE IF NOT EXISTS public.season_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  project_id UUID NOT NULL,
  crop_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  challenge_type TEXT,
  stage_index INT,
  stage_name TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'identified',
  date_identified DATE NOT NULL,
  date_resolved DATE,
  what_was_done TEXT,
  items_used JSONB,
  plan2_if_fails TEXT,
  source TEXT,
  source_plan_challenge_id TEXT,
  created_by TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_season_challenges_company_project
  ON public.season_challenges(company_id, project_id);

ALTER TABLE public.season_challenges ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'season_challenges' AND policyname = 'season_challenges_select'
  ) THEN
    CREATE POLICY season_challenges_select ON public.season_challenges FOR SELECT
      USING (is_developer() OR row_company_matches_user(company_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'season_challenges' AND policyname = 'season_challenges_insert'
  ) THEN
    CREATE POLICY season_challenges_insert ON public.season_challenges FOR INSERT
      WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'season_challenges' AND policyname = 'season_challenges_update'
  ) THEN
    CREATE POLICY season_challenges_update ON public.season_challenges FOR UPDATE
      USING (is_developer() OR row_company_matches_user(company_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'season_challenges' AND policyname = 'season_challenges_delete'
  ) THEN
    CREATE POLICY season_challenges_delete ON public.season_challenges FOR DELETE
      USING (is_developer() OR row_company_matches_user(company_id));
  END IF;
END $$;

-- ============== suppliers ==============
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id TEXT NOT NULL,
  name TEXT NOT NULL,
  contact TEXT,
  email TEXT,
  category TEXT,
  categories TEXT[],
  rating INT DEFAULT 0,
  status TEXT DEFAULT 'active',
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_company_id
  ON public.suppliers(company_id);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'suppliers' AND policyname = 'suppliers_policy'
  ) THEN
    CREATE POLICY suppliers_policy ON public.suppliers FOR ALL
      USING (is_developer() OR row_company_matches_user(company_id))
      WITH CHECK (auth.uid() IS NOT NULL AND (company_id = current_company_id() OR is_developer()));
  END IF;
END $$;

