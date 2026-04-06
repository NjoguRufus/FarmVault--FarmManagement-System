-- =============================================================================
-- Fix: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- core.create_company_with_admin uses:
--   ON CONFLICT (clerk_user_id) on core.profiles
--   ON CONFLICT (company_id, clerk_user_id) on core.company_members
--
-- Requires UNIQUE or PRIMARY KEY on exactly those columns. Missing after CASCADE
-- or legacy tables with PK on id only.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- core.profiles: dedupe + UNIQUE (clerk_user_id) if no PK/UQ on that column alone
-- ---------------------------------------------------------------------------
DELETE FROM core.profiles d
WHERE d.clerk_user_id IS NOT NULL
  AND d.ctid NOT IN (
    SELECT MIN(x.ctid)
    FROM core.profiles x
    WHERE x.clerk_user_id IS NOT NULL
    GROUP BY x.clerk_user_id
  );

DO $$
DECLARE
  v_ok BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'core.profiles'::regclass
      AND c.contype IN ('p', 'u')
      AND array_length(c.conkey, 1) = 1
      AND (
        SELECT a.attname
        FROM pg_attribute a
        WHERE a.attrelid = c.conrelid
          AND a.attnum = c.conkey[1]
          AND NOT a.attisdropped
      ) = 'clerk_user_id'
  )
  INTO v_ok;

  IF NOT v_ok THEN
    ALTER TABLE core.profiles
      ADD CONSTRAINT uq_core_profiles_clerk_user_id_upsert UNIQUE (clerk_user_id);
    RAISE NOTICE '[upsert fix] Added UNIQUE (clerk_user_id) on core.profiles';
  ELSE
    RAISE NOTICE '[upsert fix] core.profiles already has PK/UQ on clerk_user_id';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE '[upsert fix] UNIQUE (clerk_user_id) on core.profiles already exists';
  WHEN unique_violation THEN
    RAISE EXCEPTION '[upsert fix] core.profiles: duplicate clerk_user_id remains after dedupe';
END $$;


-- ---------------------------------------------------------------------------
-- core.company_members: dedupe + UNIQUE (company_id, clerk_user_id)
-- ---------------------------------------------------------------------------
DELETE FROM core.company_members d
WHERE d.ctid NOT IN (
  SELECT MIN(x.ctid)
  FROM core.company_members x
  GROUP BY x.company_id, x.clerk_user_id
);

DO $$
DECLARE
  v_ok BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'core.company_members'::regclass
      AND c.contype IN ('p', 'u')
      AND array_length(c.conkey, 1) = 2
      AND (
        SELECT ARRAY_AGG(a.attname ORDER BY a.attname)
        FROM unnest(c.conkey) AS ck(attnum)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ck.attnum
      ) = ARRAY['clerk_user_id', 'company_id']::name[]
  )
  INTO v_ok;

  IF NOT v_ok THEN
    BEGIN
      ALTER TABLE core.company_members
        ADD CONSTRAINT uq_core_company_members_company_clerk_upsert
        UNIQUE (company_id, clerk_user_id);
      RAISE NOTICE '[upsert fix] Added UNIQUE (company_id, clerk_user_id) on core.company_members';
    EXCEPTION
      WHEN duplicate_object THEN
        RAISE NOTICE '[upsert fix] UNIQUE (company_id, clerk_user_id) already exists (constraint name differs)';
    END;
  ELSE
    RAISE NOTICE '[upsert fix] core.company_members already has UNIQUE (company_id, clerk_user_id)';
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION '[upsert fix] core.company_members: duplicate (company_id, clerk_user_id) after dedupe';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
