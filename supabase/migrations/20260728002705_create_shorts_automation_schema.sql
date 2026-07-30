/*
# YouTube Shorts Automation System - Core Schema

## Overview
Creates the complete data model for a YouTube Shorts automation platform.
Single-tenant app (no sign-in) so all policies use anon+authenticated.

## New Tables
- channels: YouTube channels managed by the system
- videos: Individual Shorts videos with full lifecycle tracking
- assets: Media assets (images, audio, b-roll, overlays)
- templates: Reusable content/script templates
- automation_rules: Rules for auto-generating videos
- analytics_snapshots: Daily per-video analytics snapshots
- schedule_queue: Items waiting to be published
- app_settings: Key-value global config store
- activity_log: Audit trail of actions
- comments: YouTube comments for inbox/reply management

## Security
- RLS enabled on every table.
- All tables allow anon+authenticated CRUD (single-tenant, no auth screen).
*/

-- Templates (created first, referenced by automation_rules)
CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text DEFAULT 'script',
  category text,
  hook_formula text,
  body_structure text,
  cta text,
  tags text[] DEFAULT '{}',
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Channels
CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  handle text,
  niche text,
  subscriber_count integer DEFAULT 0,
  total_views bigint DEFAULT 0,
  video_count integer DEFAULT 0,
  avatar_color text DEFAULT '#6366f1',
  description text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Videos
CREATE TABLE IF NOT EXISTS videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text DEFAULT 'idea',
  thumbnail_url text,
  duration_seconds integer DEFAULT 30,
  script text,
  hook text,
  cta text,
  tags text[] DEFAULT '{}',
  scheduled_at timestamptz,
  published_at timestamptz,
  views integer DEFAULT 0,
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  watch_time_seconds numeric DEFAULT 0,
  retention_rate numeric DEFAULT 0,
  source text,
  automation_rule_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Assets
CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  url text,
  duration_seconds numeric,
  tags text[] DEFAULT '{}',
  size_bytes bigint DEFAULT 0,
  channel_id uuid REFERENCES channels(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Automation Rules
CREATE TABLE IF NOT EXISTS automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  niche text,
  source_type text DEFAULT 'trending',
  source_query text,
  template_id uuid REFERENCES templates(id) ON DELETE SET NULL,
  cadence text DEFAULT 'daily',
  posts_per_day integer DEFAULT 1,
  auto_publish boolean DEFAULT true,
  auto_thumbnail boolean DEFAULT true,
  auto_hashtags boolean DEFAULT true,
  voice_id text,
  status text DEFAULT 'active',
  last_run_at timestamptz,
  next_run_at timestamptz,
  total_generated integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Analytics Snapshots
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  views integer DEFAULT 0,
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  watch_time_seconds numeric DEFAULT 0,
  retention_rate numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(video_id, snapshot_date)
);

-- Schedule Queue
CREATE TABLE IF NOT EXISTS schedule_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  scheduled_at timestamptz NOT NULL,
  status text DEFAULT 'pending',
  platform text DEFAULT 'youtube',
  created_at timestamptz DEFAULT now()
);

-- App Settings
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Activity Log
CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  message text NOT NULL,
  channel_id uuid REFERENCES channels(id) ON DELETE SET NULL,
  video_id uuid REFERENCES videos(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid REFERENCES videos(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  author text NOT NULL,
  text text NOT NULL,
  likes integer DEFAULT 0,
  is_reply boolean DEFAULT false,
  replied boolean DEFAULT false,
  sentiment text DEFAULT 'neutral',
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_scheduled ON videos(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);
CREATE INDEX IF NOT EXISTS idx_analytics_video ON analytics_snapshots(video_id);
CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_schedule_scheduled ON schedule_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_comments_video ON comments(video_id);

-- RLS
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['channels','videos','assets','automation_rules','templates','analytics_snapshots','schedule_queue','app_settings','activity_log','comments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO anon, authenticated USING (true);', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO anon, authenticated WITH CHECK (true);', t||'_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);', t||'_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO anon, authenticated USING (true);', t||'_delete', t);
  END LOOP;
END $$;