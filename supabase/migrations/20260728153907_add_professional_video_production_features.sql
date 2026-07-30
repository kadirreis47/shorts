/*
# Add Professional Video Production Features

## Overview
Adds 10+ professional-grade features for Shorts video creation:
1. Visual mode system (AI-generated cartoon/realistic/anime images, real footage, mixed)
2. Character profiles for fictional character consistency across scenes
3. Enhanced scene data (image prompts, character refs, overlay text, emphasis)
4. Video SEO metadata (auto-generated titles, descriptions, tags, hashtags)
5. Subtitle/SRT export support
6. Watermark system for branding
7. New transition styles (glitch, shake, whip-pan)
8. Visual style presets (cinematic, documentary, cartoon, anime, horror)
9. Scene-level visual overrides
10. Auto-hashtag generation from script content

## New Tables

### visual_styles
- Stores reusable visual style presets
- id, name, mode (ai_cartoon/ai_realistic/ai_anime/ai_horror/real_footage/mixed), 
  description, style_params (jsonb), created_at

### character_profiles
- Stores fictional character definitions for consistency across scenes
- id, name, description, appearance, art_style, reference_url, created_at

### video_seo
- Stores SEO metadata for each video
- id, video_id, optimized_title, optimized_description, tags (jsonb), hashtags (jsonb), 
  thumbnail_text, created_at

## Modified Tables
### videos
- Added watermark_text, watermark_position, subtitle_srt, 
  visual_mode, visual_style_id, character_profile_id
*/
CREATE TABLE IF NOT EXISTS visual_styles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mode text NOT NULL DEFAULT 'ai_realistic',
  description text,
  style_params jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE visual_styles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "visual_styles_select" ON visual_styles;
CREATE POLICY "visual_styles_select" ON visual_styles FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "visual_styles_insert" ON visual_styles;
CREATE POLICY "visual_styles_insert" ON visual_styles FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "visual_styles_update" ON visual_styles;
CREATE POLICY "visual_styles_update" ON visual_styles FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "visual_styles_delete" ON visual_styles;
CREATE POLICY "visual_styles_delete" ON visual_styles FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS character_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  appearance text,
  art_style text DEFAULT 'realistic',
  reference_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE character_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "character_profiles_select" ON character_profiles;
CREATE POLICY "character_profiles_select" ON character_profiles FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "character_profiles_insert" ON character_profiles;
CREATE POLICY "character_profiles_insert" ON character_profiles FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "character_profiles_update" ON character_profiles;
CREATE POLICY "character_profiles_update" ON character_profiles FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "character_profiles_delete" ON character_profiles;
CREATE POLICY "character_profiles_delete" ON character_profiles FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS video_seo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  optimized_title text,
  optimized_description text,
  tags jsonb DEFAULT '[]'::jsonb,
  hashtags jsonb DEFAULT '[]'::jsonb,
  thumbnail_text text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE video_seo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "video_seo_select" ON video_seo;
CREATE POLICY "video_seo_select" ON video_seo FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "video_seo_insert" ON video_seo;
CREATE POLICY "video_seo_insert" ON video_seo FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "video_seo_update" ON video_seo;
CREATE POLICY "video_seo_update" ON video_seo FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "video_seo_delete" ON video_seo;
CREATE POLICY "video_seo_delete" ON video_seo FOR DELETE TO anon, authenticated USING (true);

ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS watermark_text text,
  ADD COLUMN IF NOT EXISTS watermark_position text DEFAULT 'bottom-right',
  ADD COLUMN IF NOT EXISTS subtitle_srt text,
  ADD COLUMN IF NOT EXISTS visual_mode text DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS visual_style_id uuid REFERENCES visual_styles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS character_profile_id uuid REFERENCES character_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_visual_styles_mode ON visual_styles(mode);
CREATE INDEX IF NOT EXISTS idx_character_profiles ON character_profiles(name);
CREATE INDEX IF NOT EXISTS idx_video_seo_video ON video_seo(video_id);

-- Seed default visual styles
INSERT INTO visual_styles (name, mode, description, style_params) VALUES
('Cinematic Documentary', 'real_footage', 'Real footage with cinematic color grading and dramatic pacing', '{"colorGrade":"cinematic","pacing":"dramatic","textOverlay":"bottom-bar"}'),
('Cartoon Story', 'ai_cartoon', 'AI-generated cartoon-style illustrations for storytelling', '{"artStyle":"cartoon","colorPalette":"vibrant","lineStyle":"bold"}'),
('Anime Style', 'ai_anime', 'Anime-inspired AI visuals with dramatic lighting', '{"artStyle":"anime","lighting":"dramatic","colorPalette":"vibrant"}'),
('Horror Illustrated', 'ai_horror', 'Dark, atmospheric AI illustrations for horror content', '{"artStyle":"dark-illustration","lighting":"low-key","colorPalette":"desaturated"}'),
('Realistic AI', 'ai_realistic', 'Photorealistic AI-generated images', '{"artStyle":"photorealistic","lighting":"natural","colorPalette":"natural"}'),
('Mixed Media', 'mixed', 'Combines real footage with AI-generated images', '{"strategy":"real-first-ai-fallback"}')
ON CONFLICT DO NOTHING;
