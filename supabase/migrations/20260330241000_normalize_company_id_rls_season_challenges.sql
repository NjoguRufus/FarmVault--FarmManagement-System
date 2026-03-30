-- Make season_challenges RLS robust to company_id format drift.
-- Some deployments store company_id as:
-- - dashed UUID text (aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee)
-- - compact UUID text (32 hex chars, no dashes)
-- - mixed case
--
-- This migration normalizes both row.company_id and current_company_id() so company users can read their own rows.

BEGIN;

CREATE OR REPLACE FUNCTION public.fv_normalize_company_key(p_value text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT NULLIF(regexp_replace(lower(trim(coalesce(p_value, ''))), '-', '', 'g'), '');
$$;

-- Overload for environments where company_id / current_company_id() is UUID.
CREATE OR REPLACE FUNCTION public.fv_normalize_company_key(p_value uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.fv_normalize_company_key(p_value::text);
$$;

ALTER TABLE public.season_challenges ENABLE ROW LEVEL SECURITY;

-- Replace policies to use normalized matching.
DROP POLICY IF EXISTS "season_challenges_select" ON public.season_challenges;
DROP POLICY IF EXISTS "season_challenges_insert" ON public.season_challenges;
DROP POLICY IF EXISTS "season_challenges_update" ON public.season_challenges;
DROP POLICY IF EXISTS "season_challenges_delete" ON public.season_challenges;

CREATE POLICY "season_challenges_select"
ON public.season_challenges
FOR SELECT
USING (
  public.is_developer()
  OR public.fv_normalize_company_key(company_id) = public.fv_normalize_company_key(public.current_company_id())
);

CREATE POLICY "season_challenges_insert"
ON public.season_challenges
FOR INSERT
WITH CHECK (
  public.is_developer()
  OR public.fv_normalize_company_key(company_id) = public.fv_normalize_company_key(public.current_company_id())
);

CREATE POLICY "season_challenges_update"
ON public.season_challenges
FOR UPDATE
USING (
  public.is_developer()
  OR public.fv_normalize_company_key(company_id) = public.fv_normalize_company_key(public.current_company_id())
)
WITH CHECK (
  public.is_developer()
  OR public.fv_normalize_company_key(company_id) = public.fv_normalize_company_key(public.current_company_id())
);

CREATE POLICY "season_challenges_delete"
ON public.season_challenges
FOR DELETE
USING (
  public.is_developer()
  OR public.fv_normalize_company_key(company_id) = public.fv_normalize_company_key(public.current_company_id())
);

COMMIT;

