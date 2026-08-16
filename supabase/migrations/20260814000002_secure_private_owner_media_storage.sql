-- Private owner-scoped media storage. Existing objects are preserved in place,
-- but legacy paths are not claimed and do not match the owner-prefix policies.

UPDATE storage.buckets
SET public = false
WHERE id = 'media';

DROP POLICY IF EXISTS "media_public_read" ON storage.objects;
DROP POLICY IF EXISTS "media_anon_write" ON storage.objects;
DROP POLICY IF EXISTS "media_anon_update" ON storage.objects;
DROP POLICY IF EXISTS "media_anon_delete" ON storage.objects;

DROP POLICY IF EXISTS "media_owner_select" ON storage.objects;
CREATE POLICY "media_owner_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'media'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS "media_owner_insert" ON storage.objects;
CREATE POLICY "media_owner_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS "media_owner_update" ON storage.objects;
CREATE POLICY "media_owner_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'media'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
)
WITH CHECK (
  bucket_id = 'media'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS "media_owner_delete" ON storage.objects;
CREATE POLICY "media_owner_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'media'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

-- Stable object identity for V1 records. The checks ensure a renderer cannot
-- bind a row to a foreign owner's object path even if it supplies raw columns.
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS video_storage_bucket text,
  ADD COLUMN IF NOT EXISTS video_storage_path text;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS storage_bucket text,
  ADD COLUMN IF NOT EXISTS storage_path text;

ALTER TABLE public.videos
  DROP CONSTRAINT IF EXISTS videos_private_storage_identity_check,
  ADD CONSTRAINT videos_private_storage_identity_check CHECK (
    (video_storage_bucket IS NULL AND video_storage_path IS NULL)
    OR (
      video_storage_bucket IS NOT NULL
      AND video_storage_path IS NOT NULL
      AND video_storage_bucket = 'media'
      AND user_id IS NOT NULL
      AND split_part(video_storage_path, '/', 1) = user_id::text
    )
  ) NOT VALID;

ALTER TABLE public.assets
  DROP CONSTRAINT IF EXISTS assets_private_storage_identity_check,
  ADD CONSTRAINT assets_private_storage_identity_check CHECK (
    (storage_bucket IS NULL AND storage_path IS NULL)
    OR (
      storage_bucket IS NOT NULL
      AND storage_path IS NOT NULL
      AND storage_bucket = 'media'
      AND user_id IS NOT NULL
      AND split_part(storage_path, '/', 1) = user_id::text
    )
  ) NOT VALID;
