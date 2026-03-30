-- Ensure Developer Console can read season_challenges across companies.
-- Idempotent: safe to run multiple times.

BEGIN;

-- 1) Ensure RLS is enabled.
ALTER TABLE public.season_challenges ENABLE ROW LEVEL SECURITY;

-- 2) Drop known conflicting legacy policies (if they exist).
DROP POLICY IF EXISTS "season_challenges_select" ON public.season_challenges;
DROP POLICY IF EXISTS "Season challenges select" ON public.season_challenges;
DROP POLICY IF EXISTS "Users can view season challenges" ON public.season_challenges;
DROP POLICY IF EXISTS "Developers and company users can view season challenges" ON public.season_challenges;
DROP POLICY IF EXISTS "season_challenges_read" ON public.season_challenges;

DROP POLICY IF EXISTS "season_challenges_insert" ON public.season_challenges;
DROP POLICY IF EXISTS "season_challenges_update" ON public.season_challenges;
DROP POLICY IF EXISTS "season_challenges_delete" ON public.season_challenges;

-- 3) Create the canonical policies.
CREATE POLICY "season_challenges_select"
ON public.season_challenges
FOR SELECT
USING (
  public.is_developer()
  OR company_id = public.current_company_id()
);

CREATE POLICY "season_challenges_insert"
ON public.season_challenges
FOR INSERT
WITH CHECK (
  public.is_developer()
  OR company_id = public.current_company_id()
);

CREATE POLICY "season_challenges_update"
ON public.season_challenges
FOR UPDATE
USING (
  public.is_developer()
  OR company_id = public.current_company_id()
)
WITH CHECK (
  public.is_developer()
  OR company_id = public.current_company_id()
);

CREATE POLICY "season_challenges_delete"
ON public.season_challenges
FOR DELETE
USING (
  public.is_developer()
  OR company_id = public.current_company_id()
);

COMMIT;

