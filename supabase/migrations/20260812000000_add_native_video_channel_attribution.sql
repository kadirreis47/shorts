ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS publishing_platform text,
  ADD COLUMN IF NOT EXISTS publishing_account_id text,
  ADD COLUMN IF NOT EXISTS publishing_channel_ref text;

DO $$
DECLARE
  invalid_attribution_count bigint;
BEGIN
  SELECT COUNT(*)
    INTO invalid_attribution_count
    FROM videos
   WHERE ((
     channel_id IS NOT NULL
     AND publishing_platform IS NULL
     AND publishing_account_id IS NULL
     AND publishing_channel_ref IS NULL
   ) OR (
     channel_id IS NULL
     AND publishing_platform IS NOT NULL
     AND publishing_platform = 'youtube'
     AND NULLIF(BTRIM(publishing_account_id), '') IS NOT NULL
     AND NULLIF(BTRIM(publishing_channel_ref), '') IS NOT NULL
   )) IS NOT TRUE;

  IF invalid_attribution_count > 0 THEN
    RAISE EXCEPTION
      'Cannot enforce video channel attribution: % existing row(s) have missing, partial, or mixed attribution. Repair those rows before applying this migration.',
      invalid_attribution_count;
  END IF;
END;
$$;

ALTER TABLE videos
  DROP CONSTRAINT IF EXISTS videos_native_channel_attribution_consistent;

ALTER TABLE videos
  ADD CONSTRAINT videos_native_channel_attribution_consistent
  CHECK (
    ((
      channel_id IS NOT NULL
      AND publishing_platform IS NULL
      AND publishing_account_id IS NULL
      AND publishing_channel_ref IS NULL
    ) OR (
      channel_id IS NULL
      AND publishing_platform IS NOT NULL
      AND publishing_platform = 'youtube'
      AND NULLIF(BTRIM(publishing_account_id), '') IS NOT NULL
      AND NULLIF(BTRIM(publishing_channel_ref), '') IS NOT NULL
    )) IS TRUE
  );

CREATE INDEX IF NOT EXISTS idx_videos_native_channel_attribution
  ON videos (publishing_platform, publishing_channel_ref);
