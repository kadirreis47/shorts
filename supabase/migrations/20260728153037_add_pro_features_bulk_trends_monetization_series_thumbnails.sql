/*
# Add Pro Features: Bulk Generation, Trend Research, Monetization, Series, Thumbnails

## Overview
Adds six major features to support professional-level Shorts production and monetization:
1. Bulk video generation pipeline (batch of topics -> auto-generated scripts -> queued for rendering/publishing)
2. Trend research (trending topics, hashtags, competitor tracking)
3. Monetization dashboard (revenue tracking, RPM, profitability per video/channel)
4. AI thumbnail generator (auto-generate thumbnails from video frames with text overlays)
5. Series/Playlists (group related videos into themed series for watch-time optimization)
6. Comment-to-content loop (scan comments for questions/requests, convert to video topics)

## New Tables

### bulk_jobs
- Stores bulk generation jobs (batch of topics -> multiple videos)
- id, channel_id, name, topics (jsonb array), status, total, completed, failed, settings (jsonb), created_at, updated_at

### trend_topics
- Cached trending topics from YouTube/TikTok/etc
- id, source (youtube/tiktok/google/reddit), topic, category, volume, trend_score, related_hashtags (jsonb), region, fetched_at

### competitor_channels
- Tracked competitor channels for research
- id, name, handle, subscriber_count, avg_views, posting_frequency, niche, notes, created_at

### monetization_snapshots
- Revenue tracking per video/channel
- id, video_id, channel_id, date, estimated_revenue, rpm (revenue per mille), cpm, ad_impressions, monetized_playback_count, currency, created_at

### series
- Video series / playlists for grouping related content
- id, channel_id, name, description, theme, target_episodes, status, total_views, total_videos, created_at, updated_at

### series_videos
- Junction table linking videos to series with episode numbers
- id, series_id, video_id, episode_number, created_at

### thumbnails
- AI-generated thumbnail metadata and settings
- id, video_id, template (bold/minimal/emoji), headline_text, bg_color, text_color, font_size, image_url, generated_url, created_at

### content_ideas
- Ideas generated from comments, trends, or manual entry
- id, source (comment/trend/manual/bulk), source_id, channel_id, topic, angle, priority, status (pending/used/archived), score, created_at

## Modified Tables
### videos
- Added series_id (nullable FK to series)
- Added estimated_revenue (numeric, for monetization tracking)
- Added thumbnail_id (nullable FK to thumbnails)

## Security
- RLS enabled on all new tables
- anon+authenticated CRUD (single-tenant, no auth screen)
*/

-- ============================================================
-- 1. BULK JOBS
-- ============================================================
CREATE TABLE IF NOT EXISTS bulk_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  name text NOT NULL,
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  total integer NOT NULL DEFAULT 0,
  completed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bulk_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bulk_jobs_select" ON bulk_jobs;
CREATE POLICY "bulk_jobs_select" ON bulk_jobs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "bulk_jobs_insert" ON bulk_jobs;
CREATE POLICY "bulk_jobs_insert" ON bulk_jobs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "bulk_jobs_update" ON bulk_jobs;
CREATE POLICY "bulk_jobs_update" ON bulk_jobs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "bulk_jobs_delete" ON bulk_jobs;
CREATE POLICY "bulk_jobs_delete" ON bulk_jobs FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 2. TREND TOPICS
-- ============================================================
CREATE TABLE IF NOT EXISTS trend_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'youtube',
  topic text NOT NULL,
  category text,
  volume integer DEFAULT 0,
  trend_score numeric DEFAULT 0,
  related_hashtags jsonb DEFAULT '[]'::jsonb,
  region text DEFAULT 'global',
  fetched_at timestamptz DEFAULT now()
);

ALTER TABLE trend_topics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trend_topics_select" ON trend_topics;
CREATE POLICY "trend_topics_select" ON trend_topics FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "trend_topics_insert" ON trend_topics;
CREATE POLICY "trend_topics_insert" ON trend_topics FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "trend_topics_update" ON trend_topics;
CREATE POLICY "trend_topics_update" ON trend_topics FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "trend_topics_delete" ON trend_topics;
CREATE POLICY "trend_topics_delete" ON trend_topics FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 3. COMPETITOR CHANNELS
-- ============================================================
CREATE TABLE IF NOT EXISTS competitor_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  handle text,
  subscriber_count integer DEFAULT 0,
  avg_views integer DEFAULT 0,
  posting_frequency text,
  niche text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE competitor_channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "competitor_channels_select" ON competitor_channels;
CREATE POLICY "competitor_channels_select" ON competitor_channels FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "competitor_channels_insert" ON competitor_channels;
CREATE POLICY "competitor_channels_insert" ON competitor_channels FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "competitor_channels_update" ON competitor_channels;
CREATE POLICY "competitor_channels_update" ON competitor_channels FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "competitor_channels_delete" ON competitor_channels;
CREATE POLICY "competitor_channels_delete" ON competitor_channels FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 4. MONETIZATION SNAPSHOTS
-- ============================================================
CREATE TABLE IF NOT EXISTS monetization_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  estimated_revenue numeric NOT NULL DEFAULT 0,
  rpm numeric DEFAULT 0,
  cpm numeric DEFAULT 0,
  ad_impressions integer DEFAULT 0,
  monetized_playback_count integer DEFAULT 0,
  currency text DEFAULT 'USD',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE monetization_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "monetization_snapshots_select" ON monetization_snapshots;
CREATE POLICY "monetization_snapshots_select" ON monetization_snapshots FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "monetization_snapshots_insert" ON monetization_snapshots;
CREATE POLICY "monetization_snapshots_insert" ON monetization_snapshots FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "monetization_snapshots_update" ON monetization_snapshots;
CREATE POLICY "monetization_snapshots_update" ON monetization_snapshots FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "monetization_snapshots_delete" ON monetization_snapshots;
CREATE POLICY "monetization_snapshots_delete" ON monetization_snapshots FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 5. SERIES
-- ============================================================
CREATE TABLE IF NOT EXISTS series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  theme text,
  target_episodes integer DEFAULT 10,
  status text NOT NULL DEFAULT 'active',
  total_views bigint DEFAULT 0,
  total_videos integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "series_select" ON series;
CREATE POLICY "series_select" ON series FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "series_insert" ON series;
CREATE POLICY "series_insert" ON series FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "series_update" ON series;
CREATE POLICY "series_update" ON series FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "series_delete" ON series;
CREATE POLICY "series_delete" ON series FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 6. SERIES_VIDEOS (junction)
-- ============================================================
CREATE TABLE IF NOT EXISTS series_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid REFERENCES series(id) ON DELETE CASCADE,
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  episode_number integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  UNIQUE(series_id, video_id)
);

ALTER TABLE series_videos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "series_videos_select" ON series_videos;
CREATE POLICY "series_videos_select" ON series_videos FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "series_videos_insert" ON series_videos;
CREATE POLICY "series_videos_insert" ON series_videos FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "series_videos_update" ON series_videos;
CREATE POLICY "series_videos_update" ON series_videos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "series_videos_delete" ON series_videos;
CREATE POLICY "series_videos_delete" ON series_videos FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 7. THUMBNAILS
-- ============================================================
CREATE TABLE IF NOT EXISTS thumbnails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  template text NOT NULL DEFAULT 'bold',
  headline_text text,
  bg_color text DEFAULT '#0f172a',
  text_color text DEFAULT '#ffffff',
  accent_color text DEFAULT '#fbbf24',
  font_size integer DEFAULT 48,
  image_url text,
  generated_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE thumbnails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "thumbnails_select" ON thumbnails;
CREATE POLICY "thumbnails_select" ON thumbnails FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "thumbnails_insert" ON thumbnails;
CREATE POLICY "thumbnails_insert" ON thumbnails FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "thumbnails_update" ON thumbnails;
CREATE POLICY "thumbnails_update" ON thumbnails FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "thumbnails_delete" ON thumbnails;
CREATE POLICY "thumbnails_delete" ON thumbnails FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 8. CONTENT IDEAS
-- ============================================================
CREATE TABLE IF NOT EXISTS content_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'manual',
  source_id text,
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  topic text NOT NULL,
  angle text,
  priority integer DEFAULT 5,
  status text NOT NULL DEFAULT 'pending',
  score numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE content_ideas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "content_ideas_select" ON content_ideas;
CREATE POLICY "content_ideas_select" ON content_ideas FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "content_ideas_insert" ON content_ideas;
CREATE POLICY "content_ideas_insert" ON content_ideas FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "content_ideas_update" ON content_ideas;
CREATE POLICY "content_ideas_update" ON content_ideas FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "content_ideas_delete" ON content_ideas;
CREATE POLICY "content_ideas_delete" ON content_ideas FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- 9. ADD COLUMNS TO VIDEOS
-- ============================================================
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS series_id uuid REFERENCES series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estimated_revenue numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS thumbnail_id uuid REFERENCES thumbnails(id) ON DELETE SET NULL;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bulk_jobs_channel ON bulk_jobs(channel_id);
CREATE INDEX IF NOT EXISTS idx_trend_topics_source ON trend_topics(source);
CREATE INDEX IF NOT EXISTS idx_monetization_video ON monetization_snapshots(video_id);
CREATE INDEX IF NOT EXISTS idx_monetization_channel ON monetization_snapshots(channel_id);
CREATE INDEX IF NOT EXISTS idx_series_channel ON series(channel_id);
CREATE INDEX IF NOT EXISTS idx_series_videos_series ON series_videos(series_id);
CREATE INDEX IF NOT EXISTS idx_thumbnails_video ON thumbnails(video_id);
CREATE INDEX IF NOT EXISTS idx_content_ideas_channel ON content_ideas(channel_id);
CREATE INDEX IF NOT EXISTS idx_content_ideas_status ON content_ideas(status);
CREATE INDEX IF NOT EXISTS idx_videos_series ON videos(series_id);
