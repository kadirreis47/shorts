ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS narration_mode text;

ALTER TABLE videos
  DROP CONSTRAINT IF EXISTS videos_narration_mode_valid;

ALTER TABLE videos
  ADD CONSTRAINT videos_narration_mode_valid
  CHECK (narration_mode IS NULL OR narration_mode IN ('required', 'silent'));
