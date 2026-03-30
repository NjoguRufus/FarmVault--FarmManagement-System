-- Consolidate duplicate KeyFarm company records.
-- Move KeyFarm projects and season challenges from the old company UUID to the kept company UUID.
-- Do NOT delete the old company row.

DO $$
DECLARE
  v_old_company_id UUID := 'fa61d13d-3466-48db-a39c-4a474ccfed58';
  v_kept_company_id UUID := 'fa61d13d-3466-49db-a39c-4e474ccfed58';

  v_projects_old_remaining INT := 0;
  v_season_challenges_old_remaining INT := 0;
  v_season_company_id_data_type TEXT := NULL;
BEGIN
  -- 1. Move projects.
  UPDATE projects.projects
  SET company_id = v_kept_company_id
  WHERE company_id = v_old_company_id;

  -- 2. Move season challenges.
  -- Handle both historical variants where season_challenges.company_id might be TEXT or UUID.
  SELECT c.data_type
  INTO v_season_company_id_data_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'season_challenges'
    AND c.column_name = 'company_id';

  IF v_season_company_id_data_type IS NULL OR v_season_company_id_data_type = 'uuid' THEN
    UPDATE public.season_challenges
    SET company_id = v_kept_company_id
    WHERE company_id = v_old_company_id;
  ELSE
    UPDATE public.season_challenges
    SET company_id = v_kept_company_id::text
    WHERE company_id = v_old_company_id::text;
  END IF;

  -- 3. Verify: no remaining rows should exist on the old company id.
  SELECT COUNT(*) INTO v_projects_old_remaining
  FROM projects.projects
  WHERE company_id = v_old_company_id;

  SELECT COUNT(*) INTO v_season_challenges_old_remaining
  FROM public.season_challenges
  WHERE
    company_id::uuid = v_old_company_id;

  RAISE NOTICE 'KeyFarm consolidation verification: projects(old)=% season_challenges(old)=%',
    v_projects_old_remaining,
    v_season_challenges_old_remaining;

  IF v_projects_old_remaining <> 0 OR v_season_challenges_old_remaining <> 0 THEN
    RAISE EXCEPTION 'KeyFarm consolidation incomplete. Remaining rows: projects(old)=% season_challenges(old)=%',
      v_projects_old_remaining,
      v_season_challenges_old_remaining;
  END IF;
END $$;

