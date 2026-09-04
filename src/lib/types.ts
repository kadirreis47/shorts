import type { ImageDisplayGeometryV1, TrustedImageDisplayGeometryV1 } from '@/core/media/imageDisplayGeometry';

export type VideoStatus = 'idea' | 'script_ready' | 'rendering' | 'rendered' | 'scheduled' | 'published' | 'failed';

export type VisualMode = 'auto' | 'ai_cartoon' | 'ai_realistic' | 'ai_anime' | 'ai_horror' | 'real_footage' | 'mixed';

/** Optional, renderer-safe per-scene overrides. Absence means inherit the project composition default. */
export type SceneCompositionMotion = 'kenburns' | 'pan' | 'zoom_in' | 'zoom_out' | 'static';
export type SceneCompositionTransition = 'crossfade' | 'none';
export interface SceneCompositionOverride {
  motion?: SceneCompositionMotion;
  /** Owns the incoming boundary from the preceding scene; the first scene has no boundary. */
  transition?: SceneCompositionTransition;
}

export interface MediaStorageObject {
  bucket: 'media';
  objectPath: string;
}

/** Informational provider record. It is never a render source. */
export interface ProviderMediaProvenance {
  provider: 'pexels';
  providerMediaId: number;
  originalSourceUrl: string;
  creator?: string;
  providerPageUrl?: string;
  previewUrl?: string;
  query?: string;
}

export interface Scene {
  /** Durable opaque project-scene identity. It is not authorization or executable-output identity. */
  sceneId: string;
  text: string;
  duration: number;
  visual: string;
  keywords?: string[];
  imageUrl?: string;
  videoUrl?: string;
  imageStorage?: MediaStorageObject;
  /** Server-derived technical geometry, valid only for the bound imageStorage object. */
  imageDisplayGeometry?: ImageDisplayGeometryV1 | TrustedImageDisplayGeometryV1;
  videoStorage?: MediaStorageObject;
  /** Applies only to imageStorage and is excluded from render identity. */
  imageProvenance?: ProviderMediaProvenance;
  /** Applies only to videoStorage and is excluded from render identity. */
  videoProvenance?: ProviderMediaProvenance;
  imagePrompt?: string;
  visualMode?: VisualMode;
  overlayText?: string;
  emphasis?: boolean;
  characterRef?: string;
  /** Canonical pixel-affecting composition intent. It is not advisory state. */
  compositionOverride?: SceneCompositionOverride;
}

export interface PexelsImage {
  id: number;
  url: string;
  original: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
}

export interface PexelsVideo {
  id: number;
  url: string;
  fileUrl: string;
  preview: string;
  duration: number;
  width: number;
  height: number;
  photographer: string;
}

export interface VideoRenderOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  fontFamily?: string;
}

export interface Voice {
  voice_id: string;
  name: string;
  category?: string;
  description?: string;
  preview_url?: string;
}

export interface Channel {
  id: string;
  user_id?: string | null;
  name: string;
  handle: string | null;
  niche: string | null;
  subscriber_count: number;
  total_views: number;
  video_count: number;
  avatar_color: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Video {
  id: string;
  user_id?: string | null;
  channel_id: string | null;
  /** Null is a legacy row; its established interpretation is required narration. */
  narration_mode?: 'required' | 'silent' | null;
  publishing_platform?: 'youtube' | null;
  publishing_account_id?: string | null;
  publishing_channel_ref?: string | null;
  title: string;
  description: string | null;
  status: string;
  thumbnail_url: string | null;
  duration_seconds: number;
  script: string | null;
  hook: string | null;
  cta: string | null;
  tags: string[];
  scheduled_at: string | null;
  published_at: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watch_time_seconds: number;
  retention_rate: number;
  source: string | null;
  automation_rule_id: string | null;
  audio_url: string | null;
  video_url: string | null;
  video_storage_bucket?: 'media' | null;
  video_storage_path?: string | null;
  voice_id: string | null;
  render_progress: number;
  youtube_video_id: string | null;
  scenes: Scene[];
  watermark_text: string | null;
  watermark_position: string | null;
  subtitle_srt: string | null;
  visual_mode: string | null;
  visual_style_id: string | null;
  character_profile_id: string | null;
  series_id: string | null;
  estimated_revenue: number;
  thumbnail_id: string | null;
  show_subtitles: boolean;
  caption_text_color: string | null;
  caption_highlight_color: string | null;
  beat_sync: boolean;
  silence_removed: boolean;
  target_language: string | null;
  translated_srt: string | null;
  brand_kit_id: string | null;
  template_id: string | null;
  avatar_preset_id: string | null;
  voice_clone_id: string | null;
  predicted_virality_score: number | null;
  auto_clip_job_id: string | null;
  dub_job_id: string | null;
  multi_aspect_render_id: string | null;
  intro_outro_enabled: boolean;
  cross_platform_adapted: boolean;
  music_matched: boolean;
  auto_chapters: Array<{ title: string; start_time: number; end_time: number; summary: string }>;
  broll_auto_generated: boolean;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  user_id?: string | null;
  name: string;
  type: string;
  url: string | null;
  storage_bucket?: 'media' | null;
  storage_path?: string | null;
  duration_seconds: number | null;
  tags: string[];
  size_bytes: number;
  channel_id: string | null;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  type: string;
  category: string | null;
  hook_formula: string | null;
  body_structure: string | null;
  cta: string | null;
  tags: string[];
  usage_count: number;
  created_at: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  channel_id: string;
  niche: string | null;
  source_type: string;
  source_query: string | null;
  template_id: string | null;
  cadence: string;
  posts_per_day: number;
  auto_publish: boolean;
  auto_thumbnail: boolean;
  auto_hashtags: boolean;
  voice_id: string | null;
  status: string;
  last_run_at: string | null;
  next_run_at: string | null;
  total_generated: number;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsSnapshot {
  id: string;
  video_id: string;
  snapshot_date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watch_time_seconds: number;
  retention_rate: number;
  created_at: string;
}

export interface ScheduleItem {
  id: string;
  video_id: string;
  channel_id: string;
  scheduled_at: string;
  status: string;
  platform: string;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id?: string | null;
  type: string;
  message: string;
  channel_id: string | null;
  video_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Comment {
  id: string;
  video_id: string;
  channel_id: string;
  author: string;
  text: string;
  likes: number;
  is_reply: boolean;
  replied: boolean;
  sentiment: string;
  created_at: string;
}

export interface AppSetting {
  id?: string;
  user_id?: string | null;
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
}

export interface YoutubeToken {
  id: string;
  channel_id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  youtube_channel_id: string | null;
  youtube_channel_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface BulkJob {
  id: string;
  channel_id: string;
  name: string;
  topics: string[];
  status: string;
  total: number;
  completed: number;
  failed: number;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TrendTopic {
  id: string;
  source: string;
  topic: string;
  category: string | null;
  volume: number;
  trend_score: number;
  related_hashtags: string[];
  region: string;
  fetched_at: string;
}

export interface CompetitorChannel {
  id: string;
  name: string;
  handle: string | null;
  subscriber_count: number;
  avg_views: number;
  posting_frequency: string | null;
  niche: string | null;
  notes: string | null;
  created_at: string;
}

export interface MonetizationSnapshot {
  id: string;
  video_id: string;
  channel_id: string;
  date: string;
  estimated_revenue: number;
  rpm: number;
  cpm: number;
  ad_impressions: number;
  monetized_playback_count: number;
  currency: string;
  created_at: string;
}

export interface Series {
  id: string;
  channel_id: string;
  name: string;
  description: string | null;
  theme: string | null;
  target_episodes: number;
  status: string;
  total_views: number;
  total_videos: number;
  created_at: string;
  updated_at: string;
}

export interface SeriesVideo {
  id: string;
  series_id: string;
  video_id: string;
  episode_number: number;
  created_at: string;
}

export interface Thumbnail {
  id: string;
  video_id: string;
  template: string;
  headline_text: string | null;
  bg_color: string;
  text_color: string;
  accent_color: string;
  font_size: number;
  image_url: string | null;
  generated_url: string | null;
  created_at: string;
}

export interface ContentIdea {
  id: string;
  source: string;
  source_id: string | null;
  channel_id: string | null;
  topic: string;
  angle: string | null;
  priority: number;
  status: string;
  score: number;
  created_at: string;
}

export interface VisualStyle {
  id: string;
  name: string;
  mode: string;
  description: string | null;
  style_params: Record<string, unknown>;
  created_at: string;
}

export interface CharacterProfile {
  id: string;
  /** Nullable only for quarantined legacy rows during the ownership transition. */
  user_id: string | null;
  name: string;
  description: string | null;
  appearance: string | null;
  art_style: string;
  reference_url: string | null;
  created_at: string;
}

export interface VideoSEO {
  id: string;
  video_id: string;
  optimized_title: string | null;
  optimized_description: string | null;
  tags: string[];
  hashtags: string[];
  thumbnail_text: string | null;
  created_at: string;
}

export interface ScriptAnalysis {
  id: string;
  video_id: string | null;
  script: string;
  retention_score: number;
  pacing_score: number;
  emotion_score: number;
  hook_strength: number;
  suggestions: Array<{ type: string; text: string; severity: 'low' | 'medium' | 'high' }>;
  strengths: string[];
  created_at: string;
}

export interface HookVariation {
  text: string;
  formula: string;
  predictedScore: number;
}

// ===== Ultra Premium Feature Types =====

export interface BrandKit {
  id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  font_family: string;
  logo_url: string | null;
  watermark_text: string | null;
  watermark_position: string;
  caption_style: string;
  caption_text_color: string;
  caption_highlight_color: string;
  intro_video_url: string | null;
  outro_video_url: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface VideoTemplate {
  id: string;
  name: string;
  category: string;
  description: string | null;
  thumbnail_url: string | null;
  scene_count: number;
  default_duration: number;
  caption_style: string;
  transition_style: string;
  motion_style: string;
  color_scheme: Record<string, string>;
  hook_template: string | null;
  cta_template: string | null;
  is_premium: boolean;
  usage_count: number;
  created_at: string;
}

export interface ABTest {
  id: string;
  video_id: string;
  test_type: 'thumbnail' | 'title' | 'hook';
  variants: Array<{ content: string; image_url?: string }>;
  winner_variant_index: number | null;
  metrics: Record<string, unknown>;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export interface TrendAlert {
  id: string;
  topic: string;
  niche: string | null;
  trend_phase: 'emerging' | 'rising' | 'peaking' | 'declining';
  growth_rate: number;
  predicted_peak_date: string | null;
  suggested_script: string | null;
  suggested_hook: string | null;
  suggested_tags: string[];
  urgency: 'low' | 'medium' | 'high';
  is_read: boolean;
  created_at: string;
}

export interface AvatarPreset {
  id: string;
  name: string;
  face_image_url: string;
  voice_id: string | null;
  style: string;
  background_color: string;
  position: string;
  is_custom: boolean;
  created_at: string;
}

export interface VoiceClone {
  id: string;
  name: string;
  sample_audio_url: string;
  clone_id: string | null;
  status: 'pending' | 'training' | 'ready' | 'failed';
  language: string;
  created_at: string;
}

export interface ViralFormula {
  id: string;
  niche: string;
  formula_name: string;
  hook_length_seconds: number | null;
  scene_count: number | null;
  pacing_pattern: string | null;
  emotional_arc: string | null;
  cta_placement: string | null;
  avg_retention: number | null;
  avg_views: number | null;
  source_videos: Array<Record<string, unknown>>;
  extracted_dna: Record<string, unknown>;
  created_at: string;
}

export interface ContentGap {
  id: string;
  topic: string;
  niche: string | null;
  search_volume: number;
  competition_score: number;
  opportunity_score: number;
  suggested_angle: string | null;
  suggested_hook: string | null;
  suggested_tags: string[];
  reason: string | null;
  created_at: string;
}

export interface RetentionReplay {
  id: string;
  video_id: string;
  retention_curve: Array<{ second: number; retention_percent: number }>;
  drop_off_points: Array<Record<string, unknown>>;
  ai_analysis: Record<string, unknown>;
  average_retention: number | null;
  best_moment_start: number | null;
  best_moment_end: number | null;
  worst_moment_start: number | null;
  worst_moment_end: number | null;
  fetched_at: string;
}

export interface AutoClipJob {
  id: string;
  source_url: string;
  source_title: string | null;
  detected_clips: Array<{ start_time: number; end_time: number; title: string; hook: string; estimated_virality: number; reason: string }>;
  selected_clips: Array<Record<string, unknown>>;
  status: 'pending' | 'analyzing' | 'extracting' | 'ready' | 'failed';
  created_at: string;
  completed_at: string | null;
}

export interface DubJob {
  id: string;
  video_id: string;
  source_language: string;
  target_languages: string[];
  completed_languages: string[];
  status: 'pending' | 'dubbing' | 'ready' | 'failed';
  created_at: string;
}

export interface CrossPlatformPost {
  id: string;
  video_id: string;
  platform: 'youtube_shorts' | 'tiktok' | 'instagram_reels' | 'facebook';
  adapted_title: string | null;
  adapted_description: string | null;
  adapted_hashtags: string[];
  adapted_caption_style: string | null;
  render_url: string | null;
  status: string;
  published_at: string | null;
  created_at: string;
}

export interface SilenceRemovalJob {
  id: string;
  video_id: string;
  original_duration: number | null;
  cleaned_duration: number | null;
  removed_segments: Array<{ start: number; end: number; type: string; text: string }>;
  filler_word_count: number;
  status: string;
  created_at: string;
}

export interface MusicMatchSuggestion {
  id: string;
  video_id: string;
  detected_mood: string | null;
  suggested_tracks: Array<{ title: string; mood: string; bpm: number; energy_level: number; genre: string; suggested_for: string; beat_markers: number[] }>;
  selected_track_id: string | null;
  beat_markers: number[];
  created_at: string;
}

export interface VideoChapter {
  id: string;
  video_id: string;
  chapters: Array<{ title: string; start_time: number; end_time: number; summary: string }>;
  created_at: string;
}

export interface ThumbnailHeatmap {
  id: string;
  thumbnail_id: string;
  heatmap_data: Record<string, unknown>;
  attention_score: number | null;
  focus_points: Array<{ x: number; y: number; strength: number; label: string }>;
  suggestions: Array<{ issue: string; fix: string; impact: string }>;
  created_at: string;
}

export interface AutoReply {
  id: string;
  video_id: string;
  comment_id: string;
  comment_text: string;
  comment_author: string;
  drafted_reply: string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'question';
  is_approved: boolean;
  is_posted: boolean;
  created_at: string;
}

export interface OptimalTime {
  id: string;
  channel_id: string;
  day_of_week: number;
  optimal_hour: number;
  timezone: string;
  confidence_score: number;
  audience_activity: Record<string, unknown>;
  historical_performance: Record<string, unknown>;
  updated_at: string;
}

export interface PredictiveScore {
  id: string;
  video_id: string;
  virality_confidence: number;
  predicted_views: number;
  predicted_engagement_rate: number;
  simulated_retention_curve: Array<{ second: number; retention_percent: number }>;
  drop_off_risks: Array<{ time_range: string; reason: string; severity: string }>;
  improvement_suggestions: Array<{ area: string; suggestion: string; impact: string }>;
  created_at: string;
}

export interface BrollSuggestion {
  id: string;
  video_id: string;
  scene_index: number;
  narration_text: string | null;
  suggested_images: string[];
  suggested_videos: string[];
  ai_generated_prompt: string | null;
  selected_url: string | null;
  created_at: string;
}

export interface MultiAspectRender {
  id: string;
  video_id: string;
  aspect_ratios: string[];
  renders: Record<string, string>;
  status: string;
  created_at: string;
}

// ===== 20 New Premium Feature Types =====

export interface FacelessProject {
  id: string;
  channel_id: string | null;
  title: string;
  niche: string | null;
  topic: string;
  status: string;
  script: Record<string, unknown> | null;
  voiceover_id: string | null;
  footage_queries: string[];
  selected_footage: Record<string, unknown> | null;
  caption_style: string;
  music_mood: string | null;
  music_track: string | null;
  render_url: string | null;
  thumbnail_url: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  role: string;
  avatar_color: string;
  permissions: string[];
  status: string;
  last_active: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowAutomation {
  id: string;
  channel_id: string | null;
  name: string;
  description: string | null;
  trigger: Record<string, unknown>;
  steps: Array<Record<string, unknown>>;
  status: string;
  last_run: string | null;
  run_count: number;
  success_count: number;
  created_at: string;
  updated_at: string;
}

export interface RevenueForecast {
  id: string;
  channel_id: string | null;
  forecast_period: string;
  current_rpm: number;
  projected_rpm: number;
  current_monthly_views: number;
  projected_monthly_views: number;
  projected_revenue: number;
  growth_rate: number;
  confidence_score: number;
  revenue_breakdown: Array<Record<string, unknown>>;
  growth_factors: Array<Record<string, unknown>>;
  created_at: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  prompt_type: string;
  template: string;
  variables: Array<Record<string, unknown>>;
  niche: string | null;
  is_favorite: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface HashtagStrategy {
  id: string;
  channel_id: string | null;
  niche: string | null;
  video_title: string | null;
  suggested_hashtags: string[];
  trending_hashtags: string[];
  niche_hashtags: string[];
  banned_hashtags: string[];
  hashtag_scores: Array<Record<string, unknown>>;
  optimal_count: number;
  created_at: string;
}

export interface RepurposingJob {
  id: string;
  channel_id: string | null;
  source_url: string;
  source_title: string | null;
  source_duration: number | null;
  detected_clips: Array<Record<string, unknown>>;
  selected_clips: Array<Record<string, unknown>>;
  adapted_scripts: Array<Record<string, unknown>>;
  status: string;
  total_clips: number;
  completed_clips: number;
  created_at: string;
  updated_at: string;
}

export interface AudiencePersona {
  id: string;
  channel_id: string | null;
  name: string;
  age_range: string | null;
  gender: string | null;
  interests: string[];
  pain_points: string[];
  content_preferences: string[];
  peak_activity_hours: string | null;
  preferred_video_length: string | null;
  engagement_style: string | null;
  demographics: Record<string, unknown>;
  psychographics: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ScriptTemplateLib {
  id: string;
  name: string;
  niche: string;
  hook_formula: string | null;
  body_structure: string | null;
  cta_template: string | null;
  scene_count: number;
  duration_seconds: number;
  tone: string | null;
  proven_views: number;
  retention_rate: number;
  template_text: string | null;
  variables: Array<Record<string, unknown>>;
  is_premium: boolean;
  usage_count: number;
  created_at: string;
}

export interface IntroOutroDesign {
  id: string;
  channel_id: string | null;
  name: string;
  type: string;
  duration_seconds: number;
  animation_style: string | null;
  background_color: string;
  text_color: string;
  accent_color: string;
  logo_url: string | null;
  text_content: string | null;
  music_url: string | null;
  preview_url: string | null;
  render_url: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CollaborationNote {
  id: string;
  video_id: string;
  author_name: string;
  author_role: string;
  timestamp_seconds: number | null;
  note_text: string;
  type: string;
  resolved: boolean;
  priority: string;
  created_at: string;
  updated_at: string;
}

export interface BulkThumbnailJob {
  id: string;
  channel_id: string | null;
  name: string;
  video_ids: string[];
  template: string;
  style_settings: Record<string, unknown>;
  thumbnails: Array<Record<string, unknown>>;
  status: string;
  total: number;
  completed: number;
  created_at: string;
  updated_at: string;
}

export interface NicheTrend {
  id: string;
  niche: string;
  topic: string | null;
  trend_phase: string | null;
  growth_rate: number;
  search_volume: number;
  competition_score: number;
  opportunity_score: number;
  related_topics: Array<Record<string, unknown>>;
  top_channels: Array<Record<string, unknown>>;
  recommended_actions: Array<Record<string, unknown>>;
  data_points: Array<Record<string, unknown>>;
  created_at: string;
}

export interface SubscriberGrowth {
  id: string;
  channel_id: string | null;
  snapshot_date: string;
  subscriber_count: number;
  new_subscribers: number;
  unsubscribers: number;
  net_growth: number;
  growth_rate: number;
  projected_30d: number;
  projected_90d: number;
  milestone_target: number | null;
  milestone_eta: string | null;
  growth_factors: Array<Record<string, unknown>>;
  created_at: string;
}

export interface TitleOptimization {
  id: string;
  video_id: string;
  original_title: string;
  optimized_title: string | null;
  alternative_titles: Array<Record<string, unknown>>;
  ctr_prediction: number;
  seo_score: number;
  emotional_trigger: string | null;
  power_words: string[];
  character_count: number;
  created_at: string;
}

export interface CommentSentiment {
  id: string;
  channel_id: string | null;
  video_id: string;
  total_comments: number;
  positive_count: number;
  neutral_count: number;
  negative_count: number;
  question_count: number;
  sentiment_score: number;
  top_themes: Array<Record<string, unknown>>;
  sentiment_trend: Array<Record<string, unknown>>;
  actionable_insights: Array<Record<string, unknown>>;
  created_at: string;
}

export interface ContentPillar {
  id: string;
  channel_id: string | null;
  name: string;
  description: string | null;
  pillar_type: string | null;
  target_percentage: number;
  topics: Array<Record<string, unknown>>;
  video_count: number;
  total_views: number;
  avg_engagement: number;
  status: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface HookTest {
  id: string;
  video_id: string | null;
  topic: string;
  niche: string | null;
  hook_variants: Array<Record<string, unknown>>;
  scores: Array<Record<string, unknown>>;
  winner_index: number | null;
  test_status: string;
  predicted_ctr: number;
  emotional_impact_scores: Array<Record<string, unknown>>;
  created_at: string;
  completed_at: string | null;
}

export interface CrossPlatformSchedule {
  id: string;
  video_id: string;
  channel_id: string | null;
  platform: string;
  scheduled_at: string;
  adapted_title: string | null;
  adapted_description: string | null;
  adapted_hashtags: string[];
  adapted_caption: string | null;
  status: string;
  published_at: string | null;
  platform_video_id: string | null;
  performance_metrics: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Storyboard {
  id: string;
  video_id: string | null;
  channel_id: string | null;
  script: string;
  scenes: Array<Record<string, unknown>>;
  visual_style: string | null;
  shot_types: Array<Record<string, unknown>>;
  camera_angles: Array<Record<string, unknown>>;
  transitions: Array<Record<string, unknown>>;
  estimated_duration: number;
  thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}
