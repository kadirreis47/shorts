/*
# Add Ultra Premium Features Schema

Adds 22 new tables and new columns on videos for 25 advanced AI features.
The competitor_channels table already existed; this migration ALTERs it to add new columns.
All new tables get RLS with anon,authenticated access (single-tenant, no sign-in).
*/

-- 1. brand_kits
CREATE TABLE IF NOT EXISTS brand_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  primary_color text NOT NULL DEFAULT '#10b981',
  secondary_color text NOT NULL DEFAULT '#1e293b',
  accent_color text NOT NULL DEFAULT '#f59e0b',
  font_family text NOT NULL DEFAULT 'Inter',
  logo_url text,
  watermark_text text,
  watermark_position text DEFAULT 'bottom-right',
  caption_style text DEFAULT 'karaoke',
  caption_text_color text DEFAULT '#ffffff',
  caption_highlight_color text DEFAULT '#10b981',
  intro_video_url text,
  outro_video_url text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE brand_kits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_brand_kits" ON brand_kits;
CREATE POLICY "anon_crud_brand_kits" ON brand_kits FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 2. video_templates
CREATE TABLE IF NOT EXISTS video_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  description text,
  thumbnail_url text,
  scene_count integer DEFAULT 5,
  default_duration integer DEFAULT 60,
  caption_style text DEFAULT 'karaoke',
  transition_style text DEFAULT 'crossfade',
  motion_style text DEFAULT 'kenburns',
  color_scheme jsonb DEFAULT '{}',
  hook_template text,
  cta_template text,
  is_premium boolean DEFAULT false,
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE video_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_video_templates" ON video_templates;
CREATE POLICY "anon_crud_video_templates" ON video_templates FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 3. ab_tests
CREATE TABLE IF NOT EXISTS ab_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  test_type text NOT NULL CHECK (test_type IN ('thumbnail', 'title', 'hook')),
  variants jsonb NOT NULL,
  winner_variant_index integer,
  metrics jsonb DEFAULT '{}',
  status text DEFAULT 'running',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_ab_tests" ON ab_tests;
CREATE POLICY "anon_crud_ab_tests" ON ab_tests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 4. competitor_channels (ALTER existing table)
DO $$ BEGIN
  ALTER TABLE competitor_channels ADD COLUMN IF NOT EXISTS channel_url text;
  ALTER TABLE competitor_channels ADD COLUMN IF NOT EXISTS youtube_channel_id text;
  ALTER TABLE competitor_channels ADD COLUMN IF NOT EXISTS top_hook_formulas jsonb DEFAULT '[]';
  ALTER TABLE competitor_channels ADD COLUMN IF NOT EXISTS thumbnail_styles jsonb DEFAULT '[]';
  ALTER TABLE competitor_channels ADD COLUMN IF NOT EXISTS topic_clusters jsonb DEFAULT '[]';
  ALTER TABLE competitor_channels ADD COLUMN IF NOT EXISTS content_gaps jsonb DEFAULT '[]';
  ALTER TABLE competitor_channels ADD COLUMN IF NOT EXISTS last_analyzed timestamptz;
END $$;

-- 5. content_series
CREATE TABLE IF NOT EXISTS content_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  niche text,
  total_episodes integer DEFAULT 10,
  published_episodes integer DEFAULT 0,
  schedule_cron text,
  brand_kit_id uuid REFERENCES brand_kits(id) ON DELETE SET NULL,
  template_id uuid REFERENCES video_templates(id) ON DELETE SET NULL,
  auto_pilot boolean DEFAULT false,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE content_series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_content_series" ON content_series;
CREATE POLICY "anon_crud_content_series" ON content_series FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 6. trend_alerts
CREATE TABLE IF NOT EXISTS trend_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  niche text,
  trend_phase text DEFAULT 'emerging' CHECK (trend_phase IN ('emerging', 'rising', 'peaking', 'declining')),
  growth_rate numeric DEFAULT 0,
  predicted_peak_date date,
  suggested_script text,
  suggested_hook text,
  suggested_tags jsonb DEFAULT '[]',
  template_id uuid REFERENCES video_templates(id) ON DELETE SET NULL,
  urgency text DEFAULT 'medium' CHECK (urgency IN ('low', 'medium', 'high')),
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE trend_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_trend_alerts" ON trend_alerts;
CREATE POLICY "anon_crud_trend_alerts" ON trend_alerts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 7. avatar_presets
CREATE TABLE IF NOT EXISTS avatar_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  face_image_url text NOT NULL,
  voice_id text,
  style text DEFAULT 'professional',
  background_color text DEFAULT '#1e293b',
  position text DEFAULT 'center',
  is_custom boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE avatar_presets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_avatar_presets" ON avatar_presets;
CREATE POLICY "anon_crud_avatar_presets" ON avatar_presets FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 8. voice_clones
CREATE TABLE IF NOT EXISTS voice_clones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sample_audio_url text NOT NULL,
  clone_id text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'training', 'ready', 'failed')),
  language text DEFAULT 'en',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE voice_clones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_voice_clones" ON voice_clones;
CREATE POLICY "anon_crud_voice_clones" ON voice_clones FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 9. viral_formulas
CREATE TABLE IF NOT EXISTS viral_formulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  niche text NOT NULL,
  formula_name text NOT NULL,
  hook_length_seconds numeric,
  scene_count integer,
  pacing_pattern text,
  emotional_arc text,
  cta_placement text,
  avg_retention numeric,
  avg_views integer,
  source_videos jsonb DEFAULT '[]',
  extracted_dna jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE viral_formulas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_viral_formulas" ON viral_formulas;
CREATE POLICY "anon_crud_viral_formulas" ON viral_formulas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 10. content_gaps
CREATE TABLE IF NOT EXISTS content_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  niche text,
  search_volume integer DEFAULT 0,
  competition_score integer DEFAULT 0,
  opportunity_score integer DEFAULT 0,
  suggested_angle text,
  suggested_hook text,
  suggested_tags jsonb DEFAULT '[]',
  reason text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE content_gaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_content_gaps" ON content_gaps;
CREATE POLICY "anon_crud_content_gaps" ON content_gaps FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 11. retention_replays
CREATE TABLE IF NOT EXISTS retention_replays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  retention_curve jsonb NOT NULL DEFAULT '[]',
  drop_off_points jsonb DEFAULT '[]',
  ai_analysis jsonb DEFAULT '{}',
  average_retention numeric,
  best_moment_start numeric,
  best_moment_end numeric,
  worst_moment_start numeric,
  worst_moment_end numeric,
  fetched_at timestamptz DEFAULT now()
);
ALTER TABLE retention_replays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_retention_replays" ON retention_replays;
CREATE POLICY "anon_crud_retention_replays" ON retention_replays FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 12. auto_clip_jobs
CREATE TABLE IF NOT EXISTS auto_clip_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,
  source_title text,
  detected_clips jsonb DEFAULT '[]',
  selected_clips jsonb DEFAULT '[]',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'analyzing', 'extracting', 'ready', 'failed')),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE auto_clip_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_auto_clip_jobs" ON auto_clip_jobs;
CREATE POLICY "anon_crud_auto_clip_jobs" ON auto_clip_jobs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 13. dub_jobs
CREATE TABLE IF NOT EXISTS dub_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  source_language text DEFAULT 'en',
  target_languages jsonb NOT NULL DEFAULT '[]',
  completed_languages jsonb DEFAULT '[]',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'dubbing', 'ready', 'failed')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE dub_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_dub_jobs" ON dub_jobs;
CREATE POLICY "anon_crud_dub_jobs" ON dub_jobs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 14. cross_platform_posts
CREATE TABLE IF NOT EXISTS cross_platform_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('youtube_shorts', 'tiktok', 'instagram_reels', 'facebook')),
  adapted_title text,
  adapted_description text,
  adapted_hashtags jsonb DEFAULT '[]',
  adapted_caption_style text,
  render_url text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'adapting', 'ready', 'published', 'failed')),
  published_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE cross_platform_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_cross_platform_posts" ON cross_platform_posts;
CREATE POLICY "anon_crud_cross_platform_posts" ON cross_platform_posts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 15. silence_removal_jobs
CREATE TABLE IF NOT EXISTS silence_removal_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  original_duration numeric,
  cleaned_duration numeric,
  removed_segments jsonb DEFAULT '[]',
  filler_word_count integer DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE silence_removal_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_silence_removal_jobs" ON silence_removal_jobs;
CREATE POLICY "anon_crud_silence_removal_jobs" ON silence_removal_jobs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 16. music_match_suggestions
CREATE TABLE IF NOT EXISTS music_match_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  detected_mood text,
  suggested_tracks jsonb DEFAULT '[]',
  selected_track_id text,
  beat_markers jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE music_match_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_music_match_suggestions" ON music_match_suggestions;
CREATE POLICY "anon_crud_music_match_suggestions" ON music_match_suggestions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 17. video_chapters
CREATE TABLE IF NOT EXISTS video_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  chapters jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE video_chapters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_video_chapters" ON video_chapters;
CREATE POLICY "anon_crud_video_chapters" ON video_chapters FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 18. thumbnail_heatmaps
CREATE TABLE IF NOT EXISTS thumbnail_heatmaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thumbnail_id uuid REFERENCES thumbnails(id) ON DELETE CASCADE,
  heatmap_data jsonb NOT NULL DEFAULT '{}',
  attention_score numeric,
  focus_points jsonb DEFAULT '[]',
  suggestions jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE thumbnail_heatmaps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_thumbnail_heatmaps" ON thumbnail_heatmaps;
CREATE POLICY "anon_crud_thumbnail_heatmaps" ON thumbnail_heatmaps FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 19. auto_replies
CREATE TABLE IF NOT EXISTS auto_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  comment_id text NOT NULL,
  comment_text text NOT NULL,
  comment_author text NOT NULL,
  drafted_reply text NOT NULL,
  sentiment text DEFAULT 'neutral' CHECK (sentiment IN ('positive', 'neutral', 'negative', 'question')),
  is_approved boolean DEFAULT false,
  is_posted boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE auto_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_auto_replies" ON auto_replies;
CREATE POLICY "anon_crud_auto_replies" ON auto_replies FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 20. optimal_times
CREATE TABLE IF NOT EXISTS optimal_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  optimal_hour integer NOT NULL CHECK (optimal_hour >= 0 AND optimal_hour <= 23),
  timezone text DEFAULT 'UTC',
  confidence_score numeric DEFAULT 0,
  audience_activity jsonb DEFAULT '{}',
  historical_performance jsonb DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE optimal_times ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_optimal_times" ON optimal_times;
CREATE POLICY "anon_crud_optimal_times" ON optimal_times FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 21. predictive_scores
CREATE TABLE IF NOT EXISTS predictive_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  virality_confidence numeric DEFAULT 0,
  predicted_views integer DEFAULT 0,
  predicted_engagement_rate numeric DEFAULT 0,
  simulated_retention_curve jsonb DEFAULT '[]',
  drop_off_risks jsonb DEFAULT '[]',
  improvement_suggestions jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE predictive_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_predictive_scores" ON predictive_scores;
CREATE POLICY "anon_crud_predictive_scores" ON predictive_scores FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 22. broll_suggestions
CREATE TABLE IF NOT EXISTS broll_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  scene_index integer NOT NULL,
  narration_text text,
  suggested_images jsonb DEFAULT '[]',
  suggested_videos jsonb DEFAULT '[]',
  ai_generated_prompt text,
  selected_url text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE broll_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_broll_suggestions" ON broll_suggestions;
CREATE POLICY "anon_crud_broll_suggestions" ON broll_suggestions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 23. multi_aspect_renders
CREATE TABLE IF NOT EXISTS multi_aspect_renders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  aspect_ratios jsonb NOT NULL DEFAULT '["9:16","1:1","4:5"]',
  renders jsonb DEFAULT '{}',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'rendering', 'ready', 'failed')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE multi_aspect_renders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_multi_aspect_renders" ON multi_aspect_renders;
CREATE POLICY "anon_crud_multi_aspect_renders" ON multi_aspect_renders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Add new columns to videos table
DO $$ BEGIN
  ALTER TABLE videos ADD COLUMN IF NOT EXISTS brand_kit_id uuid REFERENCES brand_kits(id) ON DELETE SET NULL;
  ALTER TABLE videos ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES video_templates(id) ON DELETE SET NULL;
  ALTER TABLE videos ADD COLUMN IF NOT EXISTS avatar_preset_id uuid REFERENCES avatar_presets(id) ON DELETE SET NULL;
  ALTER TABLE videos ADD COLUMN IF NOT EXISTS voice_clone_id uuid REFERENCES voice_clones(id) ON DELETE SET NULL;
  ALTER TABLE videos ADD COLUMN IF NOT EXISTS predicted_virality_score numeric;
  ALTER TABLE videos ADD COLUMN IF NOT EXISTS auto_clip_job_id uuid REFERENCES auto_clip_jobs(id) ON DELETE SET NULL;
  ALTER TABLE videos ADD COLUMN IF NOT EXISTS dub_job_id uuid REFERENCES dub_jobs(id) ON DELETE SET NULL;
  ALTER TABLE videos ADD COLUMN IF NOT EXISTS multi_aspect_render_id uuid REFERENCES multi_aspect_renders(id) ON DELETE SET NULL;
  ALTER TABLE videos ADD COLUMN IF NOT EXISTS silence_removed boolean DEFAULT false;
  ALTER TABLE videos ADD COLUMN IF NOT EXISTS intro_outro_enabled boolean DEFAULT false;
  ALTER TABLE videos ADD COLUMN IF NOT EXISTS cross_platform_adapted boolean DEFAULT false;
  ALTER TABLE videos ADD COLUMN IF NOT EXISTS music_matched boolean DEFAULT false;
  ALTER TABLE videos ADD COLUMN IF NOT EXISTS auto_chapters jsonb DEFAULT '[]';
  ALTER TABLE videos ADD COLUMN IF NOT EXISTS broll_auto_generated boolean DEFAULT false;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ab_tests_video_id ON ab_tests(video_id);
CREATE INDEX IF NOT EXISTS idx_content_series_status ON content_series(status);
CREATE INDEX IF NOT EXISTS idx_trend_alerts_niche ON trend_alerts(niche);
CREATE INDEX IF NOT EXISTS idx_trend_alerts_is_read ON trend_alerts(is_read);
CREATE INDEX IF NOT EXISTS idx_retention_replays_video_id ON retention_replays(video_id);
CREATE INDEX IF NOT EXISTS idx_auto_clip_jobs_status ON auto_clip_jobs(status);
CREATE INDEX IF NOT EXISTS idx_content_gaps_niche ON content_gaps(niche);
CREATE INDEX IF NOT EXISTS idx_content_gaps_opportunity ON content_gaps(opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_auto_replies_video_id ON auto_replies(video_id);
CREATE INDEX IF NOT EXISTS idx_auto_replies_is_approved ON auto_replies(is_approved);
CREATE INDEX IF NOT EXISTS idx_optimal_times_channel_id ON optimal_times(channel_id);
CREATE INDEX IF NOT EXISTS idx_predictive_scores_video_id ON predictive_scores(video_id);
CREATE INDEX IF NOT EXISTS idx_broll_suggestions_video_id ON broll_suggestions(video_id);
CREATE INDEX IF NOT EXISTS idx_cross_platform_posts_video_id ON cross_platform_posts(video_id);
CREATE INDEX IF NOT EXISTS idx_viral_formulas_niche ON viral_formulas(niche);
