import { supabase } from '@/lib/supabase';
import type {
  Scene, Voice, PexelsImage, PexelsVideo, BulkJob, TrendTopic, Thumbnail, VisualMode,
  HookVariation, ScriptAnalysis,
  PredictiveScore, AutoClipJob, ViralFormula, ContentGap,
  AvatarPreset, VoiceClone, BrollSuggestion, DubJob, SilenceRemovalJob,
  MusicMatchSuggestion, VideoChapter, ABTest, ThumbnailHeatmap,
  AutoReply, OptimalTime, TrendAlert, RetentionReplay, CrossPlatformPost,
  FacelessProject, TeamMember, WorkflowAutomation, RevenueForecast,
  PromptTemplate, HashtagStrategy, RepurposingJob, AudiencePersona,
  ScriptTemplateLib, IntroOutroDesign, CollaborationNote, BulkThumbnailJob,
  NicheTrend, SubscriberGrowth, TitleOptimization, CommentSentiment,
  ContentPillar, HookTest, CrossPlatformSchedule, Storyboard,
} from '@/lib/types';

const FUNCTION_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const HEADERS = {
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

export interface GeneratedScript {
  title: string;
  hook: string;
  script: string;
  cta: string;
  scenes: Scene[];
}

export async function generateScript(params: {
  topic: string;
  niche?: string;
  tone?: string;
  duration?: number;
  hookFormula?: string;
  bodyStructure?: string;
  cta?: string;
}): Promise<GeneratedScript> {
  const response = await fetch(`${FUNCTION_BASE}/generate-script`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `Failed to generate script (${response.status})`);
  }
  return response.json();
}

export async function generateVoiceover(text: string, voiceId?: string): Promise<Blob> {
  const response = await fetch(`${FUNCTION_BASE}/generate-voiceover`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ text, voiceId }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `Failed to generate voiceover (${response.status})`);
  }
  const data = await response.json();
  const audioBytes = atob(data.audio);
  const arrayBuffer = new Uint8Array(audioBytes.length);
  for (let i = 0; i < audioBytes.length; i++) {
    arrayBuffer[i] = audioBytes.charCodeAt(i);
  }
  return new Blob([arrayBuffer], { type: 'audio/mpeg' });
}

export async function listVoices(): Promise<Voice[]> {
  const response = await fetch(`${FUNCTION_BASE}/list-voices`, {
    headers: HEADERS,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `Failed to list voices (${response.status})`);
  }
  const data = await response.json();
  return data.voices ?? [];
}

export async function getYouTubeAuthUrl(channelId: string): Promise<string> {
  const response = await fetch(`${FUNCTION_BASE}/youtube-auth?state=${channelId}`, {
    headers: HEADERS,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `Failed to get auth URL (${response.status})`);
  }
  const data = await response.json();
  return data.authUrl;
}

export async function publishToYouTube(channelId: string, videoId: string): Promise<string> {
  const response = await fetch(`${FUNCTION_BASE}/youtube-publish`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ channelId, videoId }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `Failed to publish (${response.status})`);
  }
  const data = await response.json();
  return data.youtubeVideoId;
}

export async function uploadMedia(file: Blob, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('media').upload(path, file, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
}

export async function saveApiKey(key: string, value: string): Promise<void> {
  const { error } = await supabase.from('api_keys').upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function getApiKey(key: string): Promise<string | null> {
  const { data } = await supabase.from('api_keys').select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}

export async function getApiKeyKeys(): Promise<Record<string, boolean>> {
  const { data } = await supabase.from('api_keys').select('key');
  const result: Record<string, boolean> = {};
  data?.forEach((row: { key: string }) => { result[row.key] = true; });
  return result;
}

export async function searchImages(query: string, perPage = 3): Promise<PexelsImage[]> {
  const response = await fetch(`${FUNCTION_BASE}/search-images`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ query, perPage }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Failed to search images' }));
    throw new Error(err.error || 'Failed to search images');
  }
  const data = await response.json();
  return data.images ?? [];
}

export async function searchVideos(query: string, perPage = 5): Promise<PexelsVideo[]> {
  const response = await fetch(`${FUNCTION_BASE}/search-videos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ query, perPage }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Failed to search videos' }));
    throw new Error(err.error || 'Failed to search videos');
  }
  const data = await response.json();
  return data.videos ?? [];
}

// ============================================================
// BULK GENERATION
// ============================================================

export async function createBulkJob(params: {
  channelId: string;
  name: string;
  topics: string[];
  settings?: Record<string, unknown>;
}): Promise<BulkJob> {
  const { data, error } = await supabase.from('bulk_jobs').insert({
    channel_id: params.channelId,
    name: params.name,
    topics: params.topics,
    total: params.topics.length,
    settings: params.settings ?? {},
    status: 'pending',
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchTrendTopics(source: string, region?: string): Promise<TrendTopic[]> {
  const response = await fetch(`${FUNCTION_BASE}/trend-research`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ source, region: region ?? 'global' }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Failed to fetch trends' }));
    throw new Error(err.error || 'Failed to fetch trends');
  }
  const data = await response.json();
  return data.topics ?? [];
}

export async function generateThumbnail(params: {
  videoId: string;
  template: string;
  headline: string;
  bgColor: string;
  textColor: string;
  accentColor: string;
  imageUrl?: string;
}): Promise<Thumbnail> {
  const { data, error } = await supabase.from('thumbnails').insert({
    video_id: params.videoId,
    template: params.template,
    headline_text: params.headline,
    bg_color: params.bgColor,
    text_color: params.textColor,
    accent_color: params.accentColor,
    image_url: params.imageUrl ?? null,
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// ============================================================
// AI IMAGE GENERATION
// ============================================================

export async function generateAIImage(params: {
  prompt: string;
  mode: VisualMode;
  characterDesc?: string;
  sceneContext?: string;
}): Promise<{ imageUrl: string; revisedPrompt?: string }> {
  const response = await fetch(`${FUNCTION_BASE}/generate-image`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Failed to generate image' }));
    throw new Error(err.error || 'Failed to generate image');
  }
  return response.json();
}

// ============================================================
// FOOTAGE RESEARCH (real images/videos for documentaries)
// ============================================================

export async function researchFootage(params: {
  topic: string;
  scenes: Scene[];
  mode?: string;
}): Promise<Array<{ sceneIndex: number; imageUrl?: string; videoUrl?: string; query: string }>> {
  const response = await fetch(`${FUNCTION_BASE}/research-footage`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Failed to research footage' }));
    throw new Error(err.error || 'Failed to research footage');
  }
  const data = await response.json();
  return data.results ?? [];
}

// ============================================================
// SEO METADATA GENERATION
// ============================================================

export async function generateSEO(params: {
  title: string;
  script: string;
  hook?: string;
  niche?: string;
  topic?: string;
}): Promise<{
  optimizedTitle: string;
  optimizedDescription: string;
  tags: string[];
  hashtags: string[];
  thumbnailText: string;
}> {
  const response = await fetch(`${FUNCTION_BASE}/generate-seo`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Failed to generate SEO' }));
    throw new Error(err.error || 'Failed to generate SEO');
  }
  return response.json();
}

// ============================================================
// SRT SUBTITLE GENERATION
// ============================================================

export function generateSRT(scenes: Scene[], totalDuration?: number): string {  let srt = '';
  let index = 1;
  let currentTime = 0;

  for (const scene of scenes) {
    const duration = scene.duration || 5;
    const startTime = currentTime;
    const endTime = currentTime + duration;

    srt += `${index}\n`;
    srt += `${formatSRTTime(startTime)} --> ${formatSRTTime(endTime)}\n`;
    srt += `${scene.text}\n\n`;

    index++;
    currentTime = endTime;
  }

  return srt;
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

// ============================================================
// AI HOOK GENERATOR
// ============================================================

export async function generateHooks(params: {
  topic: string;
  niche?: string;
  tone?: string;
}): Promise<HookVariation[]> {
  const response = await fetch(`${FUNCTION_BASE}/generate-hooks`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Failed to generate hooks' }));
    throw new Error(err.error || 'Failed to generate hooks');
  }
  const data = await response.json();
  return data.hooks ?? [];
}

// ============================================================
// AI SCRIPT ANALYZER
// ============================================================

export async function analyzeScript(params: {
  script: string;
  hook?: string;
  niche?: string;
}): Promise<ScriptAnalysis> {
  const response = await fetch(`${FUNCTION_BASE}/analyze-script`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Failed to analyze script' }));
    throw new Error(err.error || 'Failed to analyze script');
  }
  return response.json();
}

// ============================================================
// AI SUBTITLE TRANSLATION
// ============================================================

export async function translateSubtitles(params: {
  srt: string;
  targetLanguage: string;
}): Promise<{ translatedSrt: string; language: string }> {
  const response = await fetch(`${FUNCTION_BASE}/translate-subtitles`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Failed to translate subtitles' }));
    throw new Error(err.error || 'Failed to translate subtitles');
  }
  return response.json();
}

// ============================================================
// ULTRA PREMIUM API FUNCTIONS
// ============================================================

async function postJSON<T>(fn: string, body: unknown): Promise<T> {
  const response = await fetch(`${FUNCTION_BASE}/${fn}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: `Failed to call ${fn}` }));
    throw new Error(err.error || `Failed to call ${fn}`);
  }
  return response.json();
}

// 1. Predictive Virality Engine
export async function predictVirality(params: {
  script: string; hook?: string; title?: string; niche?: string;
  thumbnailText?: string; tags?: string[];
}): Promise<PredictiveScore> {
  return postJSON('predict-virality', params);
}

// 2. Auto-Clip Long-Form to Shorts
export async function autoClip(params: { videoUrl: string; niche?: string }): Promise<{ jobId: string; clips: AutoClipJob['detected_clips'] }> {
  return postJSON('auto-clip', params);
}

// 3. Competitor Radar
export async function analyzeCompetitor(params: { competitorName: string; niche?: string }): Promise<Record<string, unknown>> {
  return postJSON('competitor-radar', params);
}

// 4. Trend Prediction
export async function predictTrends(params: { niche?: string }): Promise<{ trends: Array<{ topic: string; phase: string; growth_rate: number; predicted_peak_date: string; recommended_action: string; urgency: string }> }> {
  return postJSON('trend-prediction', params);
}

// 5. Viral Formula DNA
export async function extractViralDNA(params: { niche?: string }): Promise<{ formulas: ViralFormula[] }> {
  return postJSON('viral-dna', params);
}

// 6. Content Gap Radar
export async function findContentGaps(params: { niche?: string }): Promise<{ gaps: ContentGap[] }> {
  return postJSON('content-gap', params);
}

// 7. AI Talking Avatars
export async function generateAvatar(params: { name: string; style?: string; voiceId?: string }): Promise<{ avatar: AvatarPreset }> {
  return postJSON('generate-avatar', params);
}

// 8. Voice Cloning
export async function cloneVoice(params: { name: string; sampleAudioUrl: string; language?: string }): Promise<{ cloneId: string; status: string; message: string }> {
  return postJSON('clone-voice', params);
}

// 9. Auto B-Roll Generation
export async function autoBroll(params: { scenes: Scene[]; niche?: string; videoId?: string }): Promise<{ suggestions: BrollSuggestion[] }> {
  return postJSON('auto-broll', params);
}

// 10. Multi-Language Dubbing
export async function dubVideo(params: { script: string; targetLanguages: string[]; videoId?: string }): Promise<{ jobId: string; dubs: Record<string, string> }> {
  return postJSON('dub-video', params);
}

// 11. Smart Silence & Filler Removal
export async function removeSilence(params: { script: string; videoId?: string }): Promise<{ jobId: string; originalDuration: number; cleanedDuration: number; removedSegments: SilenceRemovalJob['removed_segments']; fillerWordCount: number; timeSaved: number }> {
  return postJSON('remove-silence', params);
}

// 12. AI Music Matching
export async function matchMusic(params: { script: string; niche?: string; videoId?: string }): Promise<MusicMatchSuggestion> {
  return postJSON('match-music', params);
}

// 13. Auto-Generated Chapters
export async function autoChapters(params: { script: string; scenes: Scene[]; videoId?: string }): Promise<{ chapters: VideoChapter['chapters'] }> {
  return postJSON('auto-chapters', params);
}

// 14. A/B Testing Engine
export async function runABTest(params: { videoId?: string; testType: string; variants: Array<{ content: string; image_url?: string }> }): Promise<{ testId: string; winner_index?: number; metrics?: Record<string, unknown> }> {
  return postJSON('ab-test', params);
}

// 15. Thumbnail Heatmap Analysis
export async function analyzeThumbnailHeatmap(params: { thumbnailUrl: string; thumbnailId?: string }): Promise<ThumbnailHeatmap> {
  return postJSON('thumbnail-heatmap', params);
}

// 16. Auto-Comment Replies
export async function generateAutoReplies(params: { comments: Array<{ id: string; text: string; author: string }>; videoId?: string; brandVoice?: string }): Promise<{ replies: AutoReply[] }> {
  return postJSON('auto-reply', params);
}

// 17. Optimal Posting Time AI
export async function findOptimalTimes(params: { channelId?: string; historicalData?: unknown }): Promise<{ optimal_slots: OptimalTime[]; timezone: string; summary: string }> {
  return postJSON('optimal-time', params);
}

// 18. Trend Alert System
export async function generateTrendAlerts(params: { niche?: string; trends?: unknown[] }): Promise<{ alerts: TrendAlert[] }> {
  return postJSON('trend-alert', params);
}

// 19. Retention Replay
export async function analyzeRetention(params: { videoId?: string; retentionData?: unknown; scenes?: Scene[] }): Promise<{ analysis: RetentionReplay['ai_analysis'] }> {
  return postJSON('retention-replay', params);
}

// 20. Cross-Platform Auto-Adapt
export async function crossPlatformAdapt(params: { title: string; description?: string; tags?: string[]; niche?: string; videoId?: string }): Promise<{ adaptations: Record<string, CrossPlatformPost> }> {
  return postJSON('cross-platform-adapt', params);
}

// ============================================================
// 20 NEW PREMIUM FEATURES
// ============================================================

// 1. Faceless Video Studio
export async function createFacelessProject(params: { channelId?: string; title: string; niche?: string; topic: string }): Promise<FacelessProject> {
  const { data, error } = await supabase.from('faceless_projects').insert({
    channel_id: params.channelId ?? null,
    title: params.title,
    niche: params.niche ?? null,
    topic: params.topic,
    status: 'draft',
    settings: {},
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// 2. Team Workspaces
export async function addTeamMember(params: { name: string; email?: string; role?: string }): Promise<TeamMember> {
  const { data, error } = await supabase.from('team_members').insert({
    name: params.name,
    email: params.email ?? null,
    role: params.role ?? 'editor',
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// 3. Workflow Automation Builder
export async function saveWorkflowAutomation(params: { channelId?: string; name: string; trigger: Record<string, unknown>; steps: Array<Record<string, unknown>> }): Promise<WorkflowAutomation> {
  const { data, error } = await supabase.from('workflow_automations').insert({
    channel_id: params.channelId ?? null,
    name: params.name,
    trigger: params.trigger,
    steps: params.steps,
    status: 'active',
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// 4. Revenue Forecasting
export async function generateRevenueForecast(params: { channelId?: string; niche?: string; currentRpm?: number; monthlyViews?: number }): Promise<RevenueForecast> {
  return postJSON('revenue-forecast', params);
}

// 5. Prompt Generator
export async function generatePrompt(params: { promptType: string; niche?: string; topic?: string; tone?: string; variables?: Record<string, string> }): Promise<{ prompts: string[]; optimizedPrompt: string }> {
  return postJSON('generate-prompt', params);
}

export async function savePromptTemplate(params: { name: string; category: string; prompt_type: string; template: string; niche?: string }): Promise<PromptTemplate> {
  const { data, error } = await supabase.from('prompt_templates').insert({
    name: params.name,
    category: params.category,
    prompt_type: params.prompt_type,
    template: params.template,
    niche: params.niche ?? null,
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// 6. Smart Hashtag Engine
export async function generateHashtagStrategy(params: { niche?: string; videoTitle?: string; channelId?: string }): Promise<HashtagStrategy> {
  return postJSON('hashtag-strategy', params);
}

// 7. Video Repurposing Engine
export async function startRepurposingJob(params: { sourceUrl: string; channelId?: string; maxClips?: number }): Promise<RepurposingJob> {
  return postJSON('repurpose-video', params);
}

// 8. Audience Persona Builder
export async function generateAudiencePersona(params: { channelId?: string; niche?: string }): Promise<AudiencePersona> {
  return postJSON('audience-persona', params);
}

// 9. Script Template Library
export async function getScriptTemplates(niche?: string): Promise<ScriptTemplateLib[]> {
  let query = supabase.from('script_template_library').select('*').order('proven_views', { ascending: false });
  if (niche) query = query.eq('niche', niche);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

// 10. Video Intro/Outro Designer
export async function createIntroOutro(params: { channelId?: string; name: string; type: string; animationStyle?: string; textContent?: string; backgroundColor?: string; accentColor?: string }): Promise<IntroOutroDesign> {
  const { data, error } = await supabase.from('intro_outro_designs').insert({
    channel_id: params.channelId ?? null,
    name: params.name,
    type: params.type,
    animation_style: params.animationStyle ?? null,
    text_content: params.textContent ?? null,
    background_color: params.backgroundColor ?? '#0f172a',
    accent_color: params.accentColor ?? '#10b981',
    settings: {},
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// 11. Collaboration Notes
export async function addCollaborationNote(params: { videoId: string; authorName: string; authorRole?: string; noteText: string; timestampSeconds?: number; priority?: string }): Promise<CollaborationNote> {
  const { data, error } = await supabase.from('collaboration_notes').insert({
    video_id: params.videoId,
    author_name: params.authorName,
    author_role: params.authorRole ?? 'editor',
    note_text: params.noteText,
    timestamp_seconds: params.timestampSeconds ?? null,
    priority: params.priority ?? 'normal',
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// 12. Bulk Thumbnail Generator
export async function createBulkThumbnailJob(params: { channelId?: string; name: string; videoIds: string[]; template?: string; styleSettings?: Record<string, unknown> }): Promise<BulkThumbnailJob> {
  const { data, error } = await supabase.from('bulk_thumbnail_jobs').insert({
    channel_id: params.channelId ?? null,
    name: params.name,
    video_ids: params.videoIds,
    template: params.template ?? 'bold',
    style_settings: params.styleSettings ?? {},
    total: params.videoIds.length,
    status: 'pending',
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// 13. Niche Trend Explorer
export async function exploreNicheTrend(params: { niche: string }): Promise<NicheTrend> {
  return postJSON('niche-trend', params);
}

// 14. Subscriber Growth Tracker
export async function trackSubscriberGrowth(params: { channelId?: string; niche?: string }): Promise<SubscriberGrowth> {
  return postJSON('subscriber-growth', params);
}

// 15. AI Title Optimizer
export async function optimizeTitle(params: { videoId?: string; originalTitle: string; niche?: string }): Promise<TitleOptimization> {
  return postJSON('optimize-title', params);
}

// 16. Comment Sentiment Dashboard
export async function analyzeCommentSentiment(params: { channelId?: string; videoId?: string }): Promise<CommentSentiment> {
  return postJSON('comment-sentiment', params);
}

// 17. Content Pillar Planner
export async function createContentPillar(params: { channelId?: string; name: string; description?: string; pillarType?: string; targetPercentage?: number; color?: string }): Promise<ContentPillar> {
  const { data, error } = await supabase.from('content_pillars').insert({
    channel_id: params.channelId ?? null,
    name: params.name,
    description: params.description ?? null,
    pillar_type: params.pillarType ?? 'educational',
    target_percentage: params.targetPercentage ?? 25,
    color: params.color ?? '#10b981',
    topics: [],
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// 18. Hook Tester
export async function testHooks(params: { topic: string; niche?: string; videoId?: string }): Promise<HookTest> {
  return postJSON('test-hooks', params);
}

// 19. Cross-Platform Scheduler
export async function scheduleCrossPlatform(params: { videoId: string; channelId?: string; platforms: string[]; scheduledAt: string }): Promise<CrossPlatformSchedule[]> {
  const inserts = params.platforms.map((platform) => ({
    video_id: params.videoId,
    channel_id: params.channelId ?? null,
    platform,
    scheduled_at: params.scheduledAt,
    status: 'scheduled',
  }));
  const { data, error } = await supabase.from('cross_platform_schedules').insert(inserts).select();
  if (error) throw new Error(error.message);
  return data ?? [];
}

// 20. AI Storyboard Generator
export async function generateStoryboard(params: { script: string; visualStyle?: string; channelId?: string; videoId?: string }): Promise<Storyboard> {
  return postJSON('generate-storyboard', params);
}
