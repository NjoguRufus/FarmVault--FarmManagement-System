-- Fix season_challenges policies without touching global helper functions.
-- Uses:
-- - public.fv_is_developer()
-- - public.fv_current_company_id_text()
-- - public.fv_normalize_company_key(text|uuid)

BEGIN;

ALTER TABLE public.season_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "season_challenges_select" ON public.season_challenges;
DROP POLICY IF EXISTS "season_challenges_insert" ON public.season_challenges;
DROP POLICY IF EXISTS "season_challenges_update" ON public.season_challenges;
DROP POLICY IF EXISTS "season_challenges_delete" ON public.season_challenges;

CREATE POLICY "season_challenges_select"
ON public.season_challenges
FOR SELECT
USING (
  public.fv_is_developer()
  OR public.fv_normalize_company_key(company_id) = public.fv_normalize_company_key(public.fv_current_company_id_text())
);

CREATE POLICY "season_challenges_insert"
ON public.season_challenges
FOR INSERT
WITH CHECK (
  public.fv_is_developer()
  OR public.fv_normalize_company_key(company_id) = public.fv_normalize_company_key(public.fv_current_company_id_text())
);

CREATE POLICY "season_challenges_update"
ON public.season_challenges
FOR UPDATE
USING (
  public.fv_is_developer()
  OR public.fv_normalize_company_key(company_id) = public.fv_normalize_company_key(public.fv_current_company_id_text())
)
WITH CHECK (
  public.fv_is_developer()
  OR public.fv_normalize_company_key(company_id) = public.fv_normalize_company_key(public.fv_current_company_id_text())
);

CREATE POLICY "season_challenges_delete"
ON public.season_challenges
FOR DELETE
USING (
  public.fv_is_developer()
  OR public.fv_normalize_company_key(company_id) = public.fv_normalize_company_key(public.fv_current_company_id_text())
);

COMMIT;

