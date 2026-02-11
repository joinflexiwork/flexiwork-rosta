-- Organisation logo storage: create bucket "organisation-logos" in Dashboard (public, 2MB, image/jpeg, image/png).
-- Path: orgs/{organisation_id}.jpg or .png. RLS: only org owner can insert/update/delete.

DROP POLICY IF EXISTS "Org owners can upload organisation logo" ON storage.objects;
DROP POLICY IF EXISTS "Organisation logos are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Org owners can update organisation logo" ON storage.objects;
DROP POLICY IF EXISTS "Org owners can delete organisation logo" ON storage.objects;

CREATE POLICY "Org owners can upload organisation logo"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'organisation-logos'
  AND (storage.foldername(name))[1] = 'orgs'
  AND (storage.foldername(name))[2] IN (SELECT id::text FROM public.organisations WHERE owner_id = auth.uid())
);

CREATE POLICY "Organisation logos are publicly readable"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'organisation-logos');

CREATE POLICY "Org owners can update organisation logo"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'organisation-logos'
  AND (storage.foldername(name))[1] = 'orgs'
  AND (storage.foldername(name))[2] IN (SELECT id::text FROM public.organisations WHERE owner_id = auth.uid())
);

CREATE POLICY "Org owners can delete organisation logo"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'organisation-logos'
  AND (storage.foldername(name))[1] = 'orgs'
  AND (storage.foldername(name))[2] IN (SELECT id::text FROM public.organisations WHERE owner_id = auth.uid())
);
