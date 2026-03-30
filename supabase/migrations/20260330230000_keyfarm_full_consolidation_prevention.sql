-- KeyFarm duplicate consolidation + drift prevention.
-- Consolidate duplicate company_id across FarmVault tables and harden future creation/insert flows.

begin;

DO $$
DECLARE
  v_old_company_id   uuid := 'fa61d13d-3466-49db-a39c-4a474ccfed58'; -- DUPLICATE (retire)
  v_kept_company_id  uuid := 'fa61d13d-3466-48db-a39c-4a474ccfed58'; -- CANONICAL (keep)

  v_sc_company_id_type text := NULL;
BEGIN
  -- 0) Basic sanity: ensure both core company ids exist (or continue best-effort).
  -- If one is missing, subsequent operations will simply affect 0 rows.

  -- 1) Projects: move canonical company_id for all KeyFarm projects.
  IF to_regclass('projects.projects') IS NOT NULL THEN
    UPDATE projects.projects
    SET company_id = v_kept_company_id
    WHERE company_id = v_old_company_id;
  END IF;

  -- 2) Season challenges: move + hard-repair company_id drift when project exists.
  IF to_regclass('public.season_challenges') IS NOT NULL THEN
    SELECT c.data_type
    INTO v_sc_company_id_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'season_challenges'
      AND c.column_name = 'company_id';

    -- 2a) Move duplicate-company season challenges to canonical company_id.
    IF v_sc_company_id_type = 'uuid' OR v_sc_company_id_type IS NULL THEN
      UPDATE public.season_challenges
      SET company_id = v_kept_company_id
      WHERE company_id = v_old_company_id;
    ELSE
      UPDATE public.season_challenges
      SET company_id = v_kept_company_id::text
      WHERE company_id = v_old_company_id::text;
    END IF;

    -- 2b) Repair mismatches: if project_id exists, sc.company_id must match p.company_id.
    -- Keep orphaned rows as-is (including stage_name/status/date_identified nullability).
    IF v_sc_company_id_type = 'uuid' OR v_sc_company_id_type IS NULL THEN
      UPDATE public.season_challenges sc
      SET company_id = p.company_id
      FROM projects.projects p
      WHERE p.id = sc.project_id
        AND sc.project_id IS NOT NULL
        AND sc.company_id IS DISTINCT FROM p.company_id;
    ELSE
      UPDATE public.season_challenges sc
      SET company_id = p.company_id::text
      FROM projects.projects p
      WHERE p.id = sc.project_id
        AND sc.project_id IS NOT NULL
        AND sc.company_id::uuid IS DISTINCT FROM p.company_id;
    END IF;
  END IF;

  -- 3) Memberships: collision-safe merge for core.company_members.
  IF to_regclass('core.company_members') IS NOT NULL THEN
    -- Delete memberships that would collide after moving company_id.
    DELETE FROM core.company_members cm_old
    USING core.company_members cm_kept
    WHERE cm_old.company_id = v_old_company_id
      AND cm_kept.company_id = v_kept_company_id
      AND cm_old.clerk_user_id = cm_kept.clerk_user_id;

    UPDATE core.company_members
    SET company_id = v_kept_company_id
    WHERE company_id = v_old_company_id;
  END IF;

  -- 4) Move company_id for the rest of FarmVault tables with a best-effort generic updater.
  --    We exclude the tables already handled above (and core.companies).
  FOR r IN
    SELECT c.table_schema,
           c.table_name,
           c.column_name,
           c.data_type
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.column_name = 'company_id'
      AND t.table_type = 'BASE TABLE'
      AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
      AND NOT (c.table_schema = 'core' AND c.table_name IN ('companies', 'company_members'))
      AND NOT (c.table_schema = 'projects' AND c.table_name = 'projects')
      AND NOT (c.table_schema = 'public' AND c.table_name = 'season_challenges')
      AND NOT (c.table_schema = 'public' AND c.table_name = 'company_subscriptions')
  LOOP
    -- Skip if the table clearly can't store UUID/text values.
    IF r.data_type = 'uuid' THEN
      EXECUTE format('UPDATE %I.%I SET company_id = $1 WHERE company_id = $2', r.table_schema, r.table_name)
      USING v_kept_company_id, v_old_company_id;
    ELSIF r.data_type IN ('text', 'character varying', 'character') THEN
      EXECUTE format('UPDATE %I.%I SET company_id = $1 WHERE company_id = $2', r.table_schema, r.table_name)
      USING v_kept_company_id::text, v_old_company_id::text;
    END IF;
  END LOOP;

  -- 5) company_subscriptions: one row per company; merge best-effort by updated_at.
  IF to_regclass('public.company_subscriptions') IS NOT NULL THEN
    -- Column types are historically inconsistent (text vs uuid). Use the string form for comparison where needed.
    -- If both rows exist, copy the newer row into the kept row and delete the duplicate row.
    IF EXISTS (
      SELECT 1 FROM public.company_subscriptions cs
      WHERE cs.company_id::text = v_kept_company_id::text
    ) AND EXISTS (
      SELECT 1 FROM public.company_subscriptions cs
      WHERE cs.company_id::text = v_old_company_id::text
    ) THEN
      -- Prefer the more recently updated row.
      UPDATE public.company_subscriptions cs_kept
      SET plan_id = cs_old.plan_id,
          status = cs_old.status,
          current_period_start = cs_old.current_period_start,
          current_period_end = cs_old.current_period_end,
          trial_started_at = cs_old.trial_started_at,
          trial_ends_at = cs_old.trial_ends_at,
          override = cs_old.override,
          updated_at = cs_old.updated_at
      FROM public.company_subscriptions cs_old
      WHERE cs_old.company_id::text = v_old_company_id::text
        AND cs_kept.company_id::text = v_kept_company_id::text
        AND cs_old.updated_at > cs_kept.updated_at;

      DELETE FROM public.company_subscriptions
      WHERE company_id::text = v_old_company_id::text;
    ELSE
      -- Otherwise just move it.
      -- (If kept doesn't exist, this won't violate company_id PK constraints because we skip when both exist.)
      UPDATE public.company_subscriptions
      SET company_id = v_kept_company_id
      WHERE company_id::text = v_old_company_id::text;
    END IF;
  END IF;

  -- 6) Verification for the critical tables.
  IF to_regclass('projects.projects') IS NOT NULL THEN
    IF (SELECT COUNT(*) FROM projects.projects WHERE company_id = v_old_company_id) <> 0 THEN
      RAISE EXCEPTION 'KeyFarm consolidation verification failed: projects.projects still has old company_id=%',
        v_old_company_id;
    END IF;
  END IF;

  IF to_regclass('public.season_challenges') IS NOT NULL THEN
    IF v_sc_company_id_type = 'uuid' OR v_sc_company_id_type IS NULL THEN
      IF (SELECT COUNT(*) FROM public.season_challenges WHERE company_id = v_old_company_id) <> 0 THEN
        RAISE EXCEPTION 'KeyFarm consolidation verification failed: public.season_challenges still has old company_id=%',
          v_old_company_id;
      END IF;
    ELSE
      IF (SELECT COUNT(*) FROM public.season_challenges WHERE company_id::text = v_old_company_id::text) <> 0 THEN
        RAISE EXCEPTION 'KeyFarm consolidation verification failed: public.season_challenges still has old company_id=%',
          v_old_company_id;
      END IF;
    END IF;
  END IF;

  IF to_regclass('core.company_members') IS NOT NULL THEN
    IF (SELECT COUNT(*) FROM core.company_members WHERE company_id = v_old_company_id) <> 0 THEN
      RAISE EXCEPTION 'KeyFarm consolidation verification failed: core.company_members still has old company_id=%',
        v_old_company_id;
    END IF;
  END IF;

  -- 7) Retire the duplicate company (do not delete).
  IF to_regclass('core.companies') IS NOT NULL THEN
    UPDATE core.companies
    SET status = 'suspended',
        updated_at = now()
    WHERE id = v_old_company_id;
  END IF;

END $$;

-- ================================================================
-- Hardening: prevent future season_challenges company_id drift.
-- ================================================================
DO $$
DECLARE
  v_sc_company_id_type text := NULL;
BEGIN
  SELECT c.data_type
  INTO v_sc_company_id_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'season_challenges'
    AND c.column_name = 'company_id';

  IF v_sc_company_id_type = 'uuid' OR v_sc_company_id_type IS NULL THEN
    EXECUTE $fn$
      create or replace function public.sync_season_challenges_company_id_from_project_uuid()
      returns trigger
      language plpgsql
      stable
    as $$
    declare
      v_company_id uuid;
    begin
      if NEW.project_id is not null then
        select p.company_id into v_company_id
        from projects.projects p
        where p.id = NEW.project_id;

        if v_company_id is not null then
          NEW.company_id := v_company_id;
        end if;
      end if;
      return NEW;
    end;
    $$;
    $fn$;
  ELSE
    EXECUTE $fn$
      create or replace function public.sync_season_challenges_company_id_from_project_text()
      returns trigger
      language plpgsql
      stable
    as $$
    declare
      v_company_id uuid;
    begin
      if NEW.project_id is not null then
        select p.company_id into v_company_id
        from projects.projects p
        where p.id = NEW.project_id;

        if v_company_id is not null then
          NEW.company_id := v_company_id::text;
        end if;
      end if;
      return NEW;
    end;
    $$;
    $fn$;
  END IF;

  -- Replace trigger (idempotent)
  EXECUTE 'DROP TRIGGER IF EXISTS sync_season_challenges_company_id ON public.season_challenges';

  IF v_sc_company_id_type = 'uuid' OR v_sc_company_id_type IS NULL THEN
    EXECUTE $$
      create trigger sync_season_challenges_company_id
      before insert or update
      on public.season_challenges
      for each row
      execute function public.sync_season_challenges_company_id_from_project_uuid();
    $$;
  ELSE
    EXECUTE $$
      create trigger sync_season_challenges_company_id
      before insert or update
      on public.season_challenges
      for each row
      execute function public.sync_season_challenges_company_id_from_project_text();
    $$;
  END IF;
END $$;

-- ================================================================
-- Hardening: prevent duplicate company creation for the same owner context.
-- ================================================================
create or replace function core.create_company_with_admin(_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_user_id    text;
  v_norm_name  text;
  v_company_id uuid;
begin
  v_user_id := core.current_user_id();
  if v_user_id is null then
    raise exception 'create_company_with_admin: unauthenticated' using errcode = '28000';
  end if;

  v_norm_name := lower(trim(_name));
  if v_norm_name is null or v_norm_name = '' then
    raise exception 'create_company_with_admin: empty company name' using errcode = '22023';
  end if;

  -- Reuse existing company for this owner context:
  -- - either the company was created by this user
  -- - or this user already has membership in a company with the same normalized name
  select c.id
  into v_company_id
  from core.companies c
  left join core.company_members m
    on m.company_id = c.id
   and m.clerk_user_id = v_user_id
  where lower(trim(c.name)) = v_norm_name
    and (c.created_by = v_user_id OR m.clerk_user_id is not null)
  order by c.created_at desc
  limit 1;

  -- Ensure profile row exists and active_company_id is set.
  if v_company_id is null then
    insert into core.companies (name, created_by)
    values (_name, v_user_id)
    returning id into v_company_id;
  end if;

  insert into core.profiles (clerk_user_id, active_company_id, created_at, updated_at)
  values (v_user_id, v_company_id, now(), now())
  on conflict (clerk_user_id) do update
    set active_company_id = excluded.active_company_id,
        updated_at = now();

  insert into core.company_members (company_id, clerk_user_id, role)
  values (v_company_id, v_user_id, 'company_admin')
  on conflict (company_id, clerk_user_id) do update
    set role = excluded.role;

  return v_company_id;
end;
$$;

create or replace function core.create_company_and_admin(_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = core, public
as $$
declare
  v_user_id    text;
  v_company_id uuid;
begin
  v_user_id := core.current_user_id();
  if v_user_id is null then
    raise exception 'create_company_and_admin: unauthenticated' using errcode = '28000';
  end if;

  -- Delegate to the canonical helper (keeps behavior identical).
  v_company_id := core.create_company_with_admin(_name);
  return v_company_id;
end;
$$;

commit;

