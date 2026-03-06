-- Convert profiles.id from UUID to TEXT so Clerk user ids (e.g. user_xxx) can be stored.
-- Fixes: invalid input syntax for type uuid: "user_3AVlZLyOqbV6ekKflIVIqjFjdjX"
-- Existing rows get id cast to text (e.g. "550e8400-e29b-..."); new Clerk signups use id = "user_xxx".
-- Must drop FK constraints that reference profiles(id), and RLS policies, before altering type.
-- Ensure current_clerk_id() exists (may be missing if 0008/0009 were only repaired, not run).

CREATE OR REPLACE FUNCTION public.current_clerk_id()
RETURNS TEXT AS $$
  SELECT NULLIF(TRIM(auth.jwt() ->> 'sub'), '')::text;
$$ LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public;

DO $$
DECLARE
  pol RECORD;
  fk RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'id'
    AND data_type = 'uuid'
  ) THEN
    -- Drop FK constraints on profiles that involve the id column (e.g. profiles.id -> auth.users.id)
    FOR fk IN
      SELECT c.conname AS constraint_name
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey) AND NOT a.attisdropped
      WHERE c.conrelid = 'public.profiles'::regclass AND c.contype = 'f' AND a.attname = 'id'
    LOOP
      EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS %I', fk.constraint_name);
    END LOOP;

    -- Drop FK constraints on other tables that reference public.profiles(id)
    FOR fk IN
      SELECT c.conname AS constraint_name, c.conrelid::regclass AS table_name
      FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      JOIN pg_namespace n ON t.relnamespace = n.oid
      WHERE c.confrelid = 'public.profiles'::regclass
        AND c.contype = 'f'
        AND n.nspname = 'public'
    LOOP
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', fk.table_name, fk.constraint_name);
    END LOOP;

    -- Drop all policies on profiles (names may vary: profiles_select, profiles_select_own, etc.)
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'profiles'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
    END LOOP;

    ALTER TABLE public.profiles ALTER COLUMN id TYPE TEXT USING id::text;

    -- Recreate standard policies (id = current_clerk_id(); requires current_clerk_id() from 0008)
    CREATE POLICY profiles_select ON public.profiles FOR SELECT
      USING (id = current_clerk_id());
    CREATE POLICY profiles_insert ON public.profiles FOR INSERT
      WITH CHECK (id = current_clerk_id());
    CREATE POLICY profiles_update ON public.profiles FOR UPDATE
      USING (id = current_clerk_id());
    CREATE POLICY profiles_delete ON public.profiles FOR DELETE
      USING (id = current_clerk_id());
  END IF;
END $$;
