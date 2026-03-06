-- FarmVault: Add avatar_url to profiles for custom avatar uploads.
-- Priority in app: profile.avatar_url > Clerk/Google imageUrl > initials.

-- 1) public.profiles: add avatar_url (custom upload URL from storage)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2) core.profiles: add avatar_url
-- If it's a table (from 20260305000020), add column. If it's a view (from 20260305000016), recreate with avatar_url.
DO $$
DECLARE
  v_kind text;
BEGIN
  SELECT c.relkind::text INTO v_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'core' AND c.relname = 'profiles';

  IF v_kind = 'v' THEN
    DROP VIEW IF EXISTS core.profiles;
    CREATE VIEW core.profiles AS
    SELECT
      clerk_user_id,
      email,
      full_name,
      avatar,
      avatar_url,
      active_company_id,
      created_at
    FROM public.profiles;
  ELSIF v_kind = 'r' THEN
    ALTER TABLE core.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
  END IF;
END $$;

-- 3) Storage bucket 'avatars' and RLS
-- Path convention: avatars/{company_id}/{clerk_user_id}.jpg
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS: users can read any avatar (public bucket), upload/update only their own path
-- Path: avatars/{company_id}/{clerk_user_id}.jpg => name = company_id/clerk_user_id.jpg
DROP POLICY IF EXISTS "avatars_select" ON storage.objects;
CREATE POLICY "avatars_select" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[2] LIKE (auth.jwt() ->> 'sub') || '.%'
  );

DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own" ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[2] LIKE (auth.jwt() ->> 'sub') || '.%'
  );

DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[2] LIKE (auth.jwt() ->> 'sub') || '.%'
  );
