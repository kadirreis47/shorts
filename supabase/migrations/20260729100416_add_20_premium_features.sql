/*
# Add 20 Premium Feature Tables

This migration creates 20 new tables for premium features in the ShortsFlow platform.

## New Tables

1. **faceless_projects** - Faceless Video Studio projects (no-filming video creation)
2. **team_members** - Team workspace members with roles and approval workflows
3. **workflow_automations** - Visual drag-and-drop automation pipeline builder
4. **revenue_forecasts** - Revenue forecasting with projection data
5. **prompt_templates** - AI prompt generator for short video scripts, visuals, thumbnails
6. **hashtag_strategies** - Smart hashtag engine with trending tracking
7. **repurposing_jobs** - Long-form content to multi-Short conversion
8. **audience_personas** - AI-driven audience persona profiles
9. **script_template_library** - Niche-specific proven script templates
10. **intro_outro_designs** - Animated video intro/outro designs
11. **collaboration_notes** - Timestamped team feedback notes on videos
12. **bulk_thumbnail_jobs** - Mass thumbnail generation jobs
13. **niche_trends** - Deep niche trend analysis with opportunity scoring
14. **subscriber_growth** - Subscriber growth tracking with predictive analytics
15. **title_optimizations** - AI title optimization with CTR prediction
16. **comment_sentiment** - Cross-channel comment sentiment analysis
17. **content_pillars** - Strategic content pillar planning with topic clusters
18. **hook_tests** - Hook A/B testing experiments
19. **cross_platform_schedules** - Multi-platform scheduling (YouTube/TikTok/Instagram)
20. **storyboards** - AI-generated visual storyboards from scripts

## Security
- All tables use single-tenant (no auth) RLS with `TO anon, authenticated` policies
- All tables allow full CRUD for anon + authenticated since the app has no sign-in screen
*/

-- 1. Faceless Video Studio
CREATE TABLE IF NOT EXISTS faceless_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  title text NOT NULL,
  niche text,
  topic text NOT NULL,
  status text DEFAULT 'draft',
  script jsonb,
  voiceover_id text,
  footage_queries text[],
  selected_footage jsonb,
  caption_style text DEFAULT 'karaoke',
  music_mood text,
  music_track text,
  render_url text,
  thumbnail_url text,
  settings jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE faceless_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_crud_faceless_projects" ON faceless_projects;
CREATE POLICY "anon_crud_faceless_projects" ON faceless_projects FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_faceless_projects" ON faceless_projects FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_faceless_projects" ON faceless_projects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_faceless_projects" ON faceless_projects FOR DELETE TO anon, authenticated USING (true);

-- 2. Team Workspaces
CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  role text DEFAULT 'editor',
  avatar_color text DEFAULT '#6366f1',
  permissions jsonb DEFAULT '["read","write"]',
  status text DEFAULT 'active',
  last_active timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_team_members" ON team_members;
CREATE POLICY "anon_select_team_members" ON team_members FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_team_members" ON team_members FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_team_members" ON team_members FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_team_members" ON team_members FOR DELETE TO anon, authenticated USING (true);

-- 3. Workflow Automation Builder
CREATE TABLE IF NOT EXISTS workflow_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  trigger jsonb NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]',
  status text DEFAULT 'draft',
  last_run timestamptz,
  run_count integer DEFAULT 0,
  success_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE workflow_automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_workflow_automations" ON workflow_automations;
CREATE POLICY "anon_select_workflow_automations" ON workflow_automations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_workflow_automations" ON workflow_automations FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_workflow_automations" ON workflow_automations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_workflow_automations" ON workflow_automations FOR DELETE TO anon, authenticated USING (true);

-- 4. Revenue Forecasting
CREATE TABLE IF NOT EXISTS revenue_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  forecast_period text DEFAULT '30d',
  current_rpm numeric DEFAULT 0,
  projected_rpm numeric DEFAULT 0,
  current_monthly_views bigint DEFAULT 0,
  projected_monthly_views bigint DEFAULT 0,
  projected_revenue numeric DEFAULT 0,
  growth_rate numeric DEFAULT 0,
  confidence_score numeric DEFAULT 0,
  revenue_breakdown jsonb DEFAULT '[]',
  growth_factors jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE revenue_forecasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_revenue_forecasts" ON revenue_forecasts;
CREATE POLICY "anon_select_revenue_forecasts" ON revenue_forecasts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_revenue_forecasts" ON revenue_forecasts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_revenue_forecasts" ON revenue_forecasts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_revenue_forecasts" ON revenue_forecasts FOR DELETE TO anon, authenticated USING (true);

-- 5. Prompt Generator
CREATE TABLE IF NOT EXISTS prompt_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  prompt_type text NOT NULL,
  template text NOT NULL,
  variables jsonb DEFAULT '[]',
  niche text,
  is_favorite boolean DEFAULT false,
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_prompt_templates" ON prompt_templates;
CREATE POLICY "anon_select_prompt_templates" ON prompt_templates FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_prompt_templates" ON prompt_templates FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_prompt_templates" ON prompt_templates FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_prompt_templates" ON prompt_templates FOR DELETE TO anon, authenticated USING (true);

-- 6. Smart Hashtag Engine
CREATE TABLE IF NOT EXISTS hashtag_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  niche text,
  video_title text,
  suggested_hashtags text[] DEFAULT '{}',
  trending_hashtags text[] DEFAULT '{}',
  niche_hashtags text[] DEFAULT '{}',
  banned_hashtags text[] DEFAULT '{}',
  hashtag_scores jsonb DEFAULT '[]',
  optimal_count integer DEFAULT 15,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE hashtag_strategies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_hashtag_strategies" ON hashtag_strategies;
CREATE POLICY "anon_select_hashtag_strategies" ON hashtag_strategies FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_hashtag_strategies" ON hashtag_strategies FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_hashtag_strategies" ON hashtag_strategies FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_hashtag_strategies" ON hashtag_strategies FOR DELETE TO anon, authenticated USING (true);

-- 7. Video Repurposing Engine
CREATE TABLE IF NOT EXISTS repurposing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  source_url text NOT NULL,
  source_title text,
  source_duration numeric,
  detected_clips jsonb DEFAULT '[]',
  selected_clips jsonb DEFAULT '[]',
  adapted_scripts jsonb DEFAULT '[]',
  status text DEFAULT 'pending',
  total_clips integer DEFAULT 0,
  completed_clips integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE repurposing_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_repurposing_jobs" ON repurposing_jobs;
CREATE POLICY "anon_select_repurposing_jobs" ON repurposing_jobs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_repurposing_jobs" ON repurposing_jobs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_repurposing_jobs" ON repurposing_jobs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_repurposing_jobs" ON repurposing_jobs FOR DELETE TO anon, authenticated USING (true);

-- 8. Audience Persona Builder
CREATE TABLE IF NOT EXISTS audience_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  name text NOT NULL,
  age_range text,
  gender text,
  interests text[] DEFAULT '{}',
  pain_points text[] DEFAULT '{}',
  content_preferences text[] DEFAULT '{}',
  peak_activity_hours text,
  preferred_video_length text,
  engagement_style text,
  demographics jsonb DEFAULT '{}',
  psychographics jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE audience_personas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_audience_personas" ON audience_personas;
CREATE POLICY "anon_select_audience_personas" ON audience_personas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_audience_personas" ON audience_personas FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_audience_personas" ON audience_personas FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_audience_personas" ON audience_personas FOR DELETE TO anon, authenticated USING (true);

-- 9. Script Template Library
CREATE TABLE IF NOT EXISTS script_template_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  niche text NOT NULL,
  hook_formula text,
  body_structure text,
  cta_template text,
  scene_count integer DEFAULT 5,
  duration_seconds integer DEFAULT 30,
  tone text,
  proven_views bigint DEFAULT 0,
  retention_rate numeric DEFAULT 0,
  template_text text,
  variables jsonb DEFAULT '[]',
  is_premium boolean DEFAULT false,
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE script_template_library ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_script_template_library" ON script_template_library;
CREATE POLICY "anon_select_script_template_library" ON script_template_library FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_script_template_library" ON script_template_library FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_script_template_library" ON script_template_library FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_script_template_library" ON script_template_library FOR DELETE TO anon, authenticated USING (true);

-- 10. Video Intro/Outro Designer
CREATE TABLE IF NOT EXISTS intro_outro_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  duration_seconds numeric DEFAULT 3,
  animation_style text,
  background_color text DEFAULT '#0f172a',
  text_color text DEFAULT '#ffffff',
  accent_color text DEFAULT '#10b981',
  logo_url text,
  text_content text,
  music_url text,
  preview_url text,
  render_url text,
  settings jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE intro_outro_designs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_intro_outro_designs" ON intro_outro_designs;
CREATE POLICY "anon_select_intro_outro_designs" ON intro_outro_designs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_intro_outro_designs" ON intro_outro_designs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_intro_outro_designs" ON intro_outro_designs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_intro_outro_designs" ON intro_outro_designs FOR DELETE TO anon, authenticated USING (true);

-- 11. Collaboration Notes
CREATE TABLE IF NOT EXISTS collaboration_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  author_role text DEFAULT 'editor',
  timestamp_seconds numeric,
  note_text text NOT NULL,
  type text DEFAULT 'comment',
  resolved boolean DEFAULT false,
  priority text DEFAULT 'normal',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE collaboration_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_collaboration_notes" ON collaboration_notes;
CREATE POLICY "anon_select_collaboration_notes" ON collaboration_notes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_collaboration_notes" ON collaboration_notes FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_collaboration_notes" ON collaboration_notes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_collaboration_notes" ON collaboration_notes FOR DELETE TO anon, authenticated USING (true);

-- 12. Bulk Thumbnail Generator
CREATE TABLE IF NOT EXISTS bulk_thumbnail_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  name text NOT NULL,
  video_ids text[] DEFAULT '{}',
  template text DEFAULT 'bold',
  style_settings jsonb DEFAULT '{}',
  thumbnails jsonb DEFAULT '[]',
  status text DEFAULT 'pending',
  total integer DEFAULT 0,
  completed integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE bulk_thumbnail_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_bulk_thumbnail_jobs" ON bulk_thumbnail_jobs;
CREATE POLICY "anon_select_bulk_thumbnail_jobs" ON bulk_thumbnail_jobs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_bulk_thumbnail_jobs" ON bulk_thumbnail_jobs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_bulk_thumbnail_jobs" ON bulk_thumbnail_jobs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_bulk_thumbnail_jobs" ON bulk_thumbnail_jobs FOR DELETE TO anon, authenticated USING (true);

-- 13. Niche Trend Explorer
CREATE TABLE IF NOT EXISTS niche_trends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  niche text NOT NULL,
  topic text,
  trend_phase text,
  growth_rate numeric DEFAULT 0,
  search_volume bigint DEFAULT 0,
  competition_score numeric DEFAULT 0,
  opportunity_score numeric DEFAULT 0,
  related_topics jsonb DEFAULT '[]',
  top_channels jsonb DEFAULT '[]',
  recommended_actions jsonb DEFAULT '[]',
  data_points jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE niche_trends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_niche_trends" ON niche_trends;
CREATE POLICY "anon_select_niche_trends" ON niche_trends FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_niche_trends" ON niche_trends FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_niche_trends" ON niche_trends FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_niche_trends" ON niche_trends FOR DELETE TO anon, authenticated USING (true);

-- 14. Subscriber Growth Tracker
CREATE TABLE IF NOT EXISTS subscriber_growth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  subscriber_count bigint DEFAULT 0,
  new_subscribers integer DEFAULT 0,
  unsubscribers integer DEFAULT 0,
  net_growth integer DEFAULT 0,
  growth_rate numeric DEFAULT 0,
  projected_30d bigint DEFAULT 0,
  projected_90d bigint DEFAULT 0,
  milestone_target bigint,
  milestone_eta date,
  growth_factors jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE subscriber_growth ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_subscriber_growth" ON subscriber_growth;
CREATE POLICY "anon_select_subscriber_growth" ON subscriber_growth FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_subscriber_growth" ON subscriber_growth FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_subscriber_growth" ON subscriber_growth FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_subscriber_growth" ON subscriber_growth FOR DELETE TO anon, authenticated USING (true);

-- 15. AI Title Optimizer
CREATE TABLE IF NOT EXISTS title_optimizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  original_title text NOT NULL,
  optimized_title text,
  alternative_titles jsonb DEFAULT '[]',
  ctr_prediction numeric DEFAULT 0,
  seo_score numeric DEFAULT 0,
  emotional_trigger text,
  power_words text[] DEFAULT '{}',
  character_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE title_optimizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_title_optimizations" ON title_optimizations;
CREATE POLICY "anon_select_title_optimizations" ON title_optimizations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_title_optimizations" ON title_optimizations FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_title_optimizations" ON title_optimizations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_title_optimizations" ON title_optimizations FOR DELETE TO anon, authenticated USING (true);

-- 16. Comment Sentiment Dashboard
CREATE TABLE IF NOT EXISTS comment_sentiment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  total_comments integer DEFAULT 0,
  positive_count integer DEFAULT 0,
  neutral_count integer DEFAULT 0,
  negative_count integer DEFAULT 0,
  question_count integer DEFAULT 0,
  sentiment_score numeric DEFAULT 0,
  top_themes jsonb DEFAULT '[]',
  sentiment_trend jsonb DEFAULT '[]',
  actionable_insights jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE comment_sentiment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_comment_sentiment" ON comment_sentiment;
CREATE POLICY "anon_select_comment_sentiment" ON comment_sentiment FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_comment_sentiment" ON comment_sentiment FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_comment_sentiment" ON comment_sentiment FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_comment_sentiment" ON comment_sentiment FOR DELETE TO anon, authenticated USING (true);

-- 17. Content Pillar Planner
CREATE TABLE IF NOT EXISTS content_pillars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  pillar_type text,
  target_percentage numeric DEFAULT 25,
  topics jsonb DEFAULT '[]',
  video_count integer DEFAULT 0,
  total_views bigint DEFAULT 0,
  avg_engagement numeric DEFAULT 0,
  status text DEFAULT 'active',
  color text DEFAULT '#10b981',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE content_pillars ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_content_pillars" ON content_pillars;
CREATE POLICY "anon_select_content_pillars" ON content_pillars FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_content_pillars" ON content_pillars FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_content_pillars" ON content_pillars FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_content_pillars" ON content_pillars FOR DELETE TO anon, authenticated USING (true);

-- 18. Hook Tester
CREATE TABLE IF NOT EXISTS hook_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  topic text NOT NULL,
  niche text,
  hook_variants jsonb NOT NULL DEFAULT '[]',
  scores jsonb DEFAULT '[]',
  winner_index integer,
  test_status text DEFAULT 'pending',
  predicted_ctr numeric DEFAULT 0,
  emotional_impact_scores jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE hook_tests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_hook_tests" ON hook_tests;
CREATE POLICY "anon_select_hook_tests" ON hook_tests FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_hook_tests" ON hook_tests FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_hook_tests" ON hook_tests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_hook_tests" ON hook_tests FOR DELETE TO anon, authenticated USING (true);

-- 19. Cross-Platform Scheduler
CREATE TABLE IF NOT EXISTS cross_platform_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  platform text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  adapted_title text,
  adapted_description text,
  adapted_hashtags text[] DEFAULT '{}',
  adapted_caption text,
  status text DEFAULT 'scheduled',
  published_at timestamptz,
  platform_video_id text,
  performance_metrics jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE cross_platform_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_cross_platform_schedules" ON cross_platform_schedules;
CREATE POLICY "anon_select_cross_platform_schedules" ON cross_platform_schedules FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_cross_platform_schedules" ON cross_platform_schedules FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_cross_platform_schedules" ON cross_platform_schedules FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_cross_platform_schedules" ON cross_platform_schedules FOR DELETE TO anon, authenticated USING (true);

-- 20. AI Storyboard Generator
CREATE TABLE IF NOT EXISTS storyboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  script text NOT NULL,
  scenes jsonb NOT NULL DEFAULT '[]',
  visual_style text,
  shot_types jsonb DEFAULT '[]',
  camera_angles jsonb DEFAULT '[]',
  transitions jsonb DEFAULT '[]',
  estimated_duration numeric DEFAULT 30,
  thumbnail_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE storyboards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_storyboards" ON storyboards;
CREATE POLICY "anon_select_storyboards" ON storyboards FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_storyboards" ON storyboards FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_storyboards" ON storyboards FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_storyboards" ON storyboards FOR DELETE TO anon, authenticated USING (true);