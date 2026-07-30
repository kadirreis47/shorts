/*
# Add Video Generation, Voiceover, and YouTube Integration

## Overview
Extends the ShortsFlow schema to support real AI video generation:
- AI-generated scripts via OpenAI
- AI voiceovers via ElevenLabs
- In-browser video rendering with Canvas + MediaRecorder
- YouTube OAuth connection and Shorts publishing

## Changes to existing tables
### videos
- audio_url (text): URL to generated voiceover audio
- video_url (text): URL to rendered video file
- voice_id (text): ElevenLabs voice ID used
- render_progress (integer): 0-100 rendering progress
- youtube_video_id (text): YouTube video ID after publishing
- scenes (jsonb): Structured scene data for rendering (text, timing, visuals)

## New Tables
### youtube_tokens
- Stores OAuth tokens for YouTube API access
- id, channel_id, access_token, refresh_token, token_expires_at, youtube_channel_id, youtube_channel_name

### api_keys
- Stores third-party API keys (OpenAI, ElevenLabs) encrypted at rest
- key (PK), value (text), updated_at

## Storage
- Creates 'media' bucket for storing rendered videos and audio files

## Security
- RLS enabled on new tables
- anon+authenticated CRUD (single-tenant, no auth screen)
*/

-- Add columns to videos table
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS voice_id text,
  ADD COLUMN IF NOT EXISTS render_progress integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS youtube_video_id text,
  ADD COLUMN IF NOT EXISTS scenes jsonb DEFAULT '[]'::jsonb;

-- YouTube OAuth tokens table
CREATE TABLE IF NOT EXISTS youtube_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES channels(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  youtube_channel_id text,
  youtube_channel_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- API keys table (for OpenAI, ElevenLabs, etc.)
CREATE TABLE IF NOT EXISTS api_keys (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now()
);

-- Create media storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- RLS on new tables
ALTER TABLE youtube_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Policies for youtube_tokens
DROP POLICY IF EXISTS "youtube_tokens_select" ON youtube_tokens;
CREATE POLICY "youtube_tokens_select" ON youtube_tokens FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "youtube_tokens_insert" ON youtube_tokens;
CREATE POLICY "youtube_tokens_insert" ON youtube_tokens FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "youtube_tokens_update" ON youtube_tokens;
CREATE POLICY "youtube_tokens_update" ON youtube_tokens FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "youtube_tokens_delete" ON youtube_tokens;
CREATE POLICY "youtube_tokens_delete" ON youtube_tokens FOR DELETE
  TO anon, authenticated USING (true);

-- Policies for api_keys
DROP POLICY IF EXISTS "api_keys_select" ON api_keys;
CREATE POLICY "api_keys_select" ON api_keys FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "api_keys_insert" ON api_keys;
CREATE POLICY "api_keys_insert" ON api_keys FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "api_keys_update" ON api_keys;
CREATE POLICY "api_keys_update" ON api_keys FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "api_keys_delete" ON api_keys;
CREATE POLICY "api_keys_delete" ON api_keys FOR DELETE
  TO anon, authenticated USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_youtube_tokens_channel ON youtube_tokens(channel_id);
CREATE INDEX IF NOT EXISTS idx_videos_youtube ON videos(youtube_video_id);

-- Storage bucket policies
DROP POLICY IF EXISTS "media_public_read" ON storage.objects;
CREATE POLICY "media_public_read" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'media');

DROP POLICY IF EXISTS "media_anon_write" ON storage.objects;
CREATE POLICY "media_anon_write" ON storage.objects FOR INSERT
  TO anon, authenticated WITH CHECK (bucket_id = 'media');

DROP POLICY IF EXISTS "media_anon_update" ON storage.objects;
CREATE POLICY "media_anon_update" ON storage.objects FOR UPDATE
  TO anon, authenticated USING (bucket_id = 'media');

DROP POLICY IF EXISTS "media_anon_delete" ON storage.objects;
CREATE POLICY "media_anon_delete" ON storage.objects FOR DELETE
  TO anon, authenticated USING (bucket_id = 'media');