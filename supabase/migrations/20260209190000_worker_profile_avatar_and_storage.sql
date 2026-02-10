-- Worker profile: avatar, phone, certifications; avatars storage bucket
-- Profiles: avatar_url and phone for profile page
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- Team members: certifications (JSONB array of strings, employer-set, worker read-only)
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS certifications JSONB DEFAULT '[]'::jsonb;

-- Storage: create bucket "avatars" in Dashboard (public, 2MB limit, MIME image/jpeg, image/png).
-- Path: profiles/{user_id}.jpg or .png. Then these RLS policies apply.

-- RLS on storage.objects (drop if exists to allow re-run)
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;

CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'profiles'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Avatars are publicly readable"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');

CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'profiles'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'profiles'
  AND (storage.foldername(name))[2] = auth.uid()::text
);
