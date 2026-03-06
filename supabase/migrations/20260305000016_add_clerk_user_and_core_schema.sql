-- Add clerk_user_id to profiles and create core schema views.

-- 1) Ensure a stable Clerk user id column exists on profiles (text, not PK).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;

-- Backfill existing rows so existing users continue to work.
UPDATE public.profiles
SET clerk_user_id = id
WHERE clerk_user_id IS NULL;

-- Enforce uniqueness on clerk_user_id used by the app.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_clerk_user_id_key'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_clerk_user_id_key UNIQUE (clerk_user_id);
  END IF;
END $$;

-- 2) Create core schema and views that mirror public tables used by the app.
CREATE SCHEMA IF NOT EXISTS core;

-- core.profiles: view over public.profiles keyed by Clerk user id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    WHERE c.relnamespace = 'core'::regnamespace
      AND c.relname = 'profiles'
  ) THEN
    EXECUTE $v$
      CREATE VIEW core.profiles AS
      SELECT
        clerk_user_id AS id,
        email,
        full_name,
        avatar,
        active_company_id,
        created_at
      FROM public.profiles
    $v$;
  END IF;
END $$;

-- Only create views if a relation named "companies" / "company_members" does not already
-- exist in the core schema (it might already be a table in some environments).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    WHERE c.relnamespace = 'core'::regnamespace
      AND c.relname = 'companies'
  ) THEN
    EXECUTE $v$
      CREATE VIEW core.companies AS
      SELECT *
      FROM public.companies
    $v$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    WHERE c.relnamespace = 'core'::regnamespace
      AND c.relname = 'company_members'
  ) THEN
    EXECUTE $v$
      CREATE VIEW core.company_members AS
      SELECT *
      FROM public.company_members
    $v$;
  END IF;
END $$;

