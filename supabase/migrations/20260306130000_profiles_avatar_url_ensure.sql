-- FarmVault: Ensure avatar_url exists on profiles for custom avatar uploads.
-- Priority in app: profile.avatar_url > Clerk/Google imageUrl > initials.
-- Safe to run idempotently; use with or without 20260306120000_profiles_avatar_url_and_storage.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- core.profiles may be a table (from 20260305000020) or a view (from 20260305000016).
DO $$
DECLARE
  v_kind text;
BEGIN
  SELECT c.relkind::text INTO v_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'core' AND c.relname = 'profiles';

  IF v_kind = 'r' THEN
    ALTER TABLE core.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
  END IF;
END $$;
