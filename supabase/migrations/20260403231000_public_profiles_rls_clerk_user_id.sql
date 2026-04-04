-- Allow authenticated users to read/insert their public.profiles row when keyed by clerk_user_id
-- (in addition to legacy policies using id = current_clerk_id()). Aligns with core.current_user_id() / JWT sub.

DO $$
DECLARE
  relkind "char";
BEGIN
  SELECT c.relkind INTO relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'profiles';

  IF relkind <> 'r' THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'clerk_user_id'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'profiles'
        AND policyname = 'profiles_select_self_clerk_user_id'
    ) THEN
      CREATE POLICY profiles_select_self_clerk_user_id
        ON public.profiles
        FOR SELECT
        TO authenticated
        USING (
          clerk_user_id IS NOT NULL
          AND clerk_user_id = core.current_user_id()
        );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'profiles'
        AND policyname = 'profiles_insert_self_clerk_user_id'
    ) THEN
      CREATE POLICY profiles_insert_self_clerk_user_id
        ON public.profiles
        FOR INSERT
        TO authenticated
        WITH CHECK (
          clerk_user_id IS NOT NULL
          AND clerk_user_id = core.current_user_id()
          AND (id IS NULL OR id = core.current_user_id())
        );
    END IF;
  END IF;
END $$;
