/*
# Add subtitle toggle, custom caption colors, beat sync, and translation support

1. Modified Tables
- `videos` table:
  - `show_subtitles` (boolean, default true) — controls whether subtitles appear in the rendered video
  - `caption_text_color` (text, nullable) — custom color for caption text (hex)
  - `caption_highlight_color` (text, nullable) — custom color for the active word highlight
  - `beat_sync` (boolean, default false) — sync scene transitions to music beats
  - `silence_removed` (boolean, default false) — whether silence has been trimmed from audio
  - `target_language` (text, nullable) — target language for translated subtitles
  - `translated_srt` (text, nullable) — SRT subtitles in the target language

2. New Tables
- `script_analyses` — stores AI analysis results for scripts
  - `id` (uuid, primary key)
  - `video_id` (uuid, FK→videos, nullable)
  - `script` (text) — the analyzed script
  - `retention_score` (integer, 0-100) — predicted viewer retention
  - `pacing_score` (integer, 0-100) — pacing quality
  - `emotion_score` (integer, 0-100) — emotional engagement
  - `hook_strength` (integer, 0-100) — hook effectiveness
  - `suggestions` (jsonb) — array of improvement suggestions with type, text, and severity
  - `strengths` (jsonb) — array of positive observations
  - `created_at` (timestamp)

3. Security
- RLS enabled on `script_analyses` with anon+authenticated full CRUD (single-tenant, no auth)
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'show_subtitles') THEN
    ALTER TABLE videos ADD COLUMN show_subtitles boolean NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'caption_text_color') THEN
    ALTER TABLE videos ADD COLUMN caption_text_color text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'caption_highlight_color') THEN
    ALTER TABLE videos ADD COLUMN caption_highlight_color text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'beat_sync') THEN
    ALTER TABLE videos ADD COLUMN beat_sync boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'silence_removed') THEN
    ALTER TABLE videos ADD COLUMN silence_removed boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'target_language') THEN
    ALTER TABLE videos ADD COLUMN target_language text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'translated_srt') THEN
    ALTER TABLE videos ADD COLUMN translated_srt text;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS script_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  script text NOT NULL,
  retention_score integer NOT NULL DEFAULT 0,
  pacing_score integer NOT NULL DEFAULT 0,
  emotion_score integer NOT NULL DEFAULT 0,
  hook_strength integer NOT NULL DEFAULT 0,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE script_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_script_analyses" ON script_analyses;
CREATE POLICY "anon_select_script_analyses" ON script_analyses
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_script_analyses" ON script_analyses;
CREATE POLICY "anon_insert_script_analyses" ON script_analyses
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_script_analyses" ON script_analyses;
CREATE POLICY "anon_update_script_analyses" ON script_analyses
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_script_analyses" ON script_analyses;
CREATE POLICY "anon_delete_script_analyses" ON script_analyses
  FOR DELETE TO anon, authenticated USING (true);