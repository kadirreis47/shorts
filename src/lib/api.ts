import { aiManager } from '@/lib/ai';
import type { GeneratedSEOResult } from '@/lib/ai';
import { apiClient } from '@/lib/api/client';
import { supabase } from '@/lib/supabase';
import { assertCurrentOwnerMediaIdentity, uploadPrivateMedia, type PrivateMediaClass, type PrivateMediaUpload } from '@/lib/mediaStorage';
import { normalizeNarrationCharacterAlignment, type NarrationCharacterAlignment } from '@/shared/voiceoverAlignment';
import {
  normalizeVisualIntelligencePlanningState,
  type VisualIntelligencePlanningState,
} from '@/core/visual-intelligence';
import { normalizeOpaqueMediaReferenceRequest, normalizeOpaqueMediaReferenceResponse, normalizeSemanticImageAnalysisRequest, normalizeSemanticImageAnalysisResponse, type OpaqueMediaReferenceResponse, type SemanticImageAnalysisRequest, type SemanticImageAnalysisResponse } from '@/core/visual-intelligence';
import type { VisualQueryPlannerRequest } from '../../supabase/functions/_shared/visual-query-planner';

import type {
  Scene,
  Voice,
  PexelsImage,
  PexelsVideo,
  ProviderMediaProvenance,
  BulkJob,
  TrendTopic,
  Thumbnail,
  VisualMode,
  HookVariation,
  ScriptAnalysis,
  MediaStorageObject,
  PredictiveScore,
  AutoClipJob,
  ViralFormula,
  ContentGap,
  AvatarPreset,
  VoiceClone,
  BrollSuggestion,
  DubJob,
  SilenceRemovalJob,
  MusicMatchSuggestion,
  VideoChapter,
  ABTest,
  ThumbnailHeatmap,
  AutoReply,
  OptimalTime,
  TrendAlert,
  RetentionReplay,
  CrossPlatformPost,
  FacelessProject,
  TeamMember,
  WorkflowAutomation,
  RevenueForecast,
  PromptTemplate,
  HashtagStrategy,
  RepurposingJob,
  AudiencePersona,
  ScriptTemplateLib,
  IntroOutroDesign,
  CollaborationNote,
  BulkThumbnailJob,
  NicheTrend,
  SubscriberGrowth,
  TitleOptimization,
  CommentSentiment,
  ContentPillar,
  HookTest,
  CrossPlatformSchedule,
  Storyboard,
} from '@/lib/types';

export interface ProviderStatus {
  openai: { configured: boolean };
  elevenlabs: { configured: boolean };
  pexels: { configured: boolean };
}

export interface GeneratedScript {
  title: string;
  hook: string;
  script: string;
  cta: string;
  scenes: Scene[];
}

interface VoiceoverResponse {
  media: MediaStorageObject;
  durationMs: number;
  playbackUrl?: string;
  alignment?: unknown;
}

interface VoiceListResponse {
  voices?: Voice[];
}

interface YouTubeAuthResponse {
  authUrl: string;
}

interface YouTubePublishResponse {
  youtubeVideoId: string;
}

interface ImageSearchResponse {
  images?: PexelsImage[];
}

interface VideoSearchResponse {
  videos?: PexelsVideo[];
}

interface PexelsImageIngestResponse {
  media?: unknown;
  previewUrl?: unknown;
  provenance?: unknown;
}

interface PexelsVideoIngestResponse {
  quarantineId?: unknown;
  quarantineUrl?: unknown;
  provenance?: unknown;
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
  return aiManager.generateScript(params);
}

export async function generateVoiceover(
  text: string,
  voiceId?: string,
): Promise<{ media: MediaStorageObject; durationMs: number; playbackUrl?: string; alignment?: NarrationCharacterAlignment }> {
  const data = await apiClient.post<VoiceoverResponse>(
    'generate-voiceover',
    {
      text,
      voiceId,
    },
    {
      retryCount: 0,
      timeoutMs: 90_000,
    },
  );

  if (!data.media) throw new Error('Voice audio was not returned by the server.');
  if (!Number.isSafeInteger(data.durationMs) || data.durationMs <= 0) throw new Error('Voice audio duration was invalid.');
  assertCurrentOwnerMediaIdentity(data.media);
  const alignment = data.alignment === undefined ? undefined : normalizeNarrationCharacterAlignment(data.alignment, data.durationMs);
  // Optional provider timing is never accepted without bounded validation.
  return { media: data.media, durationMs: data.durationMs, playbackUrl: data.playbackUrl, ...(alignment ? { alignment } : {}) };

}

export async function listVoices(): Promise<Voice[]> {
  const data = await apiClient.get<VoiceListResponse>(
    'list-voices',
    {
      retryCount: 2,
    },
  );

  return data.voices ?? [];
}

export async function getYouTubeAuthUrl(
  channelId: string,
): Promise<string> {
  const state = encodeURIComponent(channelId);

  const data = await apiClient.get<YouTubeAuthResponse>(
    `youtube-auth?state=${state}`,
    {
      retryCount: 1,
    },
  );

  if (!data.authUrl) {
    throw new Error('YouTube yetkilendirme adresi alınamadı.');
  }

  return data.authUrl;
}

export async function publishToYouTube(
  channelId: string,
  videoId: string,
): Promise<string> {
  const data = await apiClient.post<YouTubePublishResponse>(
    'youtube-publish',
    {
      channelId,
      videoId,
    },
    {
      retryCount: 0,
      timeoutMs: 120_000,
    },
  );

  if (!data.youtubeVideoId) {
    throw new Error('YouTube video kimliği alınamadı.');
  }

  return data.youtubeVideoId;
}

export async function uploadMedia(
  file: Blob,
  mediaClass: PrivateMediaClass,
): Promise<PrivateMediaUpload> {
  return uploadPrivateMedia(file, mediaClass);
}

export async function getProviderStatus(): Promise<ProviderStatus> {
  return apiClient.get<ProviderStatus>('provider-status', { retryCount: 0, timeoutMs: 10_000 });
}

export async function searchImages(
  query: string,
  perPage = 3,
  retryCount = 2,
): Promise<PexelsImage[]> {
  const data = await apiClient.post<ImageSearchResponse>(
    'search-images',
    {
      query,
      perPage,
    },
    {
      retryCount,
    },
  );

  return data.images ?? [];
}

export async function searchVideos(
  query: string,
  perPage = 5,
  retryCount = 2,
): Promise<PexelsVideo[]> {
  const data = await apiClient.post<VideoSearchResponse>(
    'search-videos',
    {
      query,
      perPage,
    },
    {
      retryCount,
    },
  );

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
  const { data, error } = await supabase
    .from('bulk_jobs')
    .insert({
      channel_id: params.channelId,
      name: params.name,
      topics: params.topics,
      total: params.topics.length,
      settings: params.settings ?? {},
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function fetchTrendTopics(
  source: string,
  region?: string,
): Promise<TrendTopic[]> {
  const data = await apiClient.post<{ topics?: TrendTopic[] }>(
    'trend-research',
    { source, region: region ?? 'global' },
    { retryCount: 1, timeoutMs: 45_000 },
  );

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
}): Promise<{ imageUrl: string; media: MediaStorageObject; revisedPrompt?: string }> {
  const result = await apiClient.post<{ imageUrl: string; media: unknown; revisedPrompt?: string }>(
    'generate-image',
    params,
    { retryCount: 0, timeoutMs: 90_000 },
  );
  if (typeof result.imageUrl !== 'string' || !result.imageUrl) throw new Error('Generated image returned no private viewing URL.');
  assertCurrentOwnerMediaIdentity(result.media);
  return { ...result, media: result.media };
}

export async function ingestPexelsImage(
  mediaId: number,
  query: string,
): Promise<{ media: MediaStorageObject; previewUrl: string; provenance: ProviderMediaProvenance }> {
  if (!Number.isSafeInteger(mediaId) || mediaId <= 0) throw new Error('Pexels image candidate is invalid.');
  if (!query.trim() || query.length > 500) throw new Error('Pexels image query is invalid.');
  const result = await apiClient.post<PexelsImageIngestResponse>(
    'ingest-pexels-image',
    { mediaId, query },
    { retryCount: 0, timeoutMs: 60_000 },
  );
  assertCurrentOwnerMediaIdentity(result.media);
  if (!isSafePreviewUrl(result.previewUrl)) throw new Error('Pexels image ingestion returned an invalid preview URL.');
  if (!isPexelsImageProvenance(result.provenance, mediaId)) throw new Error('Pexels image ingestion returned invalid provenance.');
  return { media: result.media, previewUrl: result.previewUrl, provenance: result.provenance };
}

export async function ingestPexelsVideo(
  mediaId: number,
  query: string,
): Promise<{ quarantineId: string; quarantineUrl: string; provenance: ProviderMediaProvenance }> {
  if (!Number.isSafeInteger(mediaId) || mediaId <= 0) throw new Error('Pexels video candidate is invalid.');
  if (!query.trim() || query.length > 500) throw new Error('Pexels video query is invalid.');
  const result = await apiClient.post<PexelsVideoIngestResponse>(
    'ingest-pexels-video',
    { mediaId, query },
    { retryCount: 0, timeoutMs: 60_000 },
  );
  if (typeof result.quarantineId !== 'string' || !/^[0-9a-f-]{36}$/i.test(result.quarantineId)) throw new Error('Pexels video ingestion returned an invalid quarantine identity.');
  if (!isSafePreviewUrl(result.quarantineUrl)) throw new Error('Pexels video ingestion returned an invalid private URL.');
  if (!isPexelsVideoProvenance(result.provenance, mediaId)) throw new Error('Pexels video ingestion returned invalid provenance.');
  return { quarantineId: result.quarantineId, quarantineUrl: result.quarantineUrl, provenance: result.provenance };
}

export async function discardPexelsVideoQuarantine(quarantineId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(quarantineId)) return;
  await apiClient.post<{ cleared?: boolean }>('ingest-pexels-video', { quarantineId }, { retryCount: 0, timeoutMs: 15_000 });
}

function isSafePreviewUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4_096) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.hash; } catch { return false; }
}

function isPexelsImageProvenance(value: unknown, mediaId: number): value is ProviderMediaProvenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ProviderMediaProvenance>;
  if (candidate.provider !== 'pexels' || candidate.providerMediaId !== mediaId || !isPexelsCdnUrl(candidate.originalSourceUrl)) return false;
  return isBoundedProviderText(candidate.creator, 500)
    && (candidate.providerPageUrl === undefined || isPexelsPageUrl(candidate.providerPageUrl))
    && (candidate.previewUrl === undefined || isPexelsCdnUrl(candidate.previewUrl))
    && isBoundedProviderText(candidate.query, 500);
}

function isPexelsVideoProvenance(value: unknown, mediaId: number): value is ProviderMediaProvenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ProviderMediaProvenance>;
  if (candidate.provider !== 'pexels' || candidate.providerMediaId !== mediaId || !isPexelsPageUrl(candidate.originalSourceUrl)) return false;
  return isBoundedProviderText(candidate.creator, 500)
    && candidate.providerPageUrl !== undefined && isPexelsPageUrl(candidate.providerPageUrl)
    && isBoundedProviderText(candidate.query, 500);
}

function isBoundedProviderText(value: unknown, max: number): boolean {
  return value === undefined || (typeof value === 'string' && value.length > 0 && value.length <= max && ![...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127));
}

function isPexelsCdnUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2_000) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'images.pexels.com' && !url.username && !url.password && !url.hash; } catch { return false; }
}

function isPexelsPageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2_000) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'www.pexels.com' && !url.username && !url.password && !url.hash; } catch { return false; }
}

// ============================================================
// FOOTAGE RESEARCH (real images/videos for documentaries)
// ============================================================

export interface ResearchFootageResult {
  sceneIndex: number;
  kind: 'image' | 'video';
  mediaId: number;
  query: string;
}

export async function researchFootage(params: {
  topic: string;
  scenes: Scene[];
  mode?: string;
}): Promise<ResearchFootageResult[]> {
  const data = await apiClient.post<{
    results?: unknown;
  }>(
    'research-footage',
    params,
    { retryCount: 1, timeoutMs: 60_000 },
  );

  if (!Array.isArray(data.results)) throw new Error('Footage research returned an invalid result set.');
  const seenSceneIndexes = new Set<number>();
  return data.results.map((value): ResearchFootageResult => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Footage research returned an invalid result.');
    const result = value as Partial<ResearchFootageResult>;
    const sceneIndex = result.sceneIndex;
    const mediaId = result.mediaId;
    const query = result.query;
    if (typeof sceneIndex !== 'number' || !Number.isSafeInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= params.scenes.length
      || (result.kind !== 'image' && result.kind !== 'video')
      || typeof mediaId !== 'number' || !Number.isSafeInteger(mediaId) || mediaId <= 0 || mediaId > 2_147_483_647
      || typeof query !== 'string' || !query.trim() || query.length > 500
      || seenSceneIndexes.has(sceneIndex)) {
      throw new Error('Footage research returned an invalid result.');
    }
    seenSceneIndexes.add(sceneIndex);
    return { sceneIndex, kind: result.kind, mediaId, query };
  });
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
}): Promise<GeneratedSEOResult> {
  return aiManager.generateSEO(params);
}

// ============================================================
// AI HOOK GENERATOR
// ============================================================

export async function generateHooks(params: {
  topic: string;
  niche?: string;
  tone?: string;
}): Promise<HookVariation[]> {
  return aiManager.generateHooks(params);
}

// ============================================================
// AI SCRIPT ANALYZER
// ============================================================

export async function analyzeScript(params: {
  script: string;
  hook?: string;
  niche?: string;
}): Promise<ScriptAnalysis> {
  return aiManager.analyzeScript(params);
}

// ============================================================
// AI SUBTITLE TRANSLATION
// ============================================================

export type SubtitleTranslationUnavailableReason =
  | 'provider-not-configured'
  | 'provider-timeout'
  | 'provider-error'
  | 'malformed-provider-response'
  | 'incomplete-translation'
  | 'unchanged-result';

export type SubtitleTranslationResult =
  | { status: 'translated'; translatedSrt: string; language: string }
  | { status: 'unavailable'; reason: SubtitleTranslationUnavailableReason };

const translationUnavailableReasons = new Set<SubtitleTranslationUnavailableReason>([
  'provider-not-configured',
  'provider-timeout',
  'provider-error',
  'malformed-provider-response',
  'incomplete-translation',
  'unchanged-result',
]);

function parseSubtitleTranslationResult(value: unknown): SubtitleTranslationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Subtitle translation returned an invalid result.');
  }
  const result = value as Record<string, unknown>;
  if (result.status === 'unavailable' && typeof result.reason === 'string'
    && translationUnavailableReasons.has(result.reason as SubtitleTranslationUnavailableReason)) {
    return { status: 'unavailable', reason: result.reason as SubtitleTranslationUnavailableReason };
  }
  if (result.status === 'translated'
    && typeof result.translatedSrt === 'string'
    && result.translatedSrt.trim().length > 0
    && result.translatedSrt.length <= 200_000
    && typeof result.language === 'string'
    && result.language.trim().length > 0
    && result.language.length <= 64) {
    return { status: 'translated', translatedSrt: result.translatedSrt, language: result.language };
  }
  throw new Error('Subtitle translation returned an invalid result.');
}

export async function translateSubtitles(params: {
  srt: string;
  targetLanguage: string;
}): Promise<SubtitleTranslationResult> {
  const result = await apiClient.post<unknown>(
    'translate-subtitles',
    params,
    { retryCount: 0, timeoutMs: 60_000 },
  );
  return parseSubtitleTranslationResult(result);
}

export interface VisualQueryPlannerResult {
  readonly status: 'planned';
  readonly planning: VisualIntelligencePlanningState;
}

function parseVisualQueryPlannerResult(value: unknown, expectedSceneCount: number): VisualQueryPlannerResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Visual query planner returned an invalid result.');
  const result = value as Record<string, unknown>;
  if (result.status !== 'planned' || Object.keys(result).some((key) => key !== 'status' && key !== 'planning')) {
    throw new Error('Visual query planner returned an invalid result.');
  }
  let planning: VisualIntelligencePlanningState | undefined;
  try {
    planning = normalizeVisualIntelligencePlanningState(result.planning);
  } catch {
    throw new Error('Visual query planner returned an invalid result.');
  }
  if (!planning || planning.briefs.length !== expectedSceneCount || planning.queryPlans.length !== expectedSceneCount) {
    throw new Error('Visual query planner returned an invalid result.');
  }
  return { status: 'planned', planning };
}

export async function planVisualQueries(params: VisualQueryPlannerRequest): Promise<VisualQueryPlannerResult> {
  const result = await apiClient.post<unknown>('visual-query-planner', params, { retryCount: 0, timeoutMs: 40_000 });
  const parsed = parseVisualQueryPlannerResult(result, params.scenes.length);
  const expected = new Set(params.scenes.map((scene) => bindingKey(scene.sceneBinding)));
  if (parsed.planning.briefs.some((brief) => !expected.has(bindingKey(brief.sceneBinding)))
    || parsed.planning.queryPlans.some((plan) => !expected.has(bindingKey(plan.sceneBinding)))) {
    throw new Error('Visual query planner returned an invalid result.');
  }
  return parsed;
}

/** Requests a short-lived analysis capability for one existing private image identity; it never returns a URL. */
export async function issueOpaqueMediaAnalysisReference(media: MediaStorageObject): Promise<OpaqueMediaReferenceResponse> {
  const request = normalizeOpaqueMediaReferenceRequest({ media });
  const result = await apiClient.post<unknown>('media-analysis-reference', request, { retryCount: 0, timeoutMs: 15_000 });
  return normalizeOpaqueMediaReferenceResponse(result);
}

/** Server-only pixel analysis of a Slice 8 reference. The renderer never sends a URL, path, bytes, or provider credential. */
export async function analyzeVisualSemantics(request: SemanticImageAnalysisRequest): Promise<SemanticImageAnalysisResponse> {
  const normalized = normalizeSemanticImageAnalysisRequest(request);
  const result = await apiClient.post<unknown>('analyze-visual-semantics', normalized, { retryCount: 0, timeoutMs: 45_000 });
  const response = normalizeSemanticImageAnalysisResponse(result);
  if (response.status === 'evaluated' && (response.observations.length !== normalized.intent.dimensions.length || response.observations.some((observation) => !normalized.intent.dimensions.includes(observation.dimension)) || new Set(response.observations.map((observation) => observation.dimension)).size !== normalized.intent.dimensions.length)) {
    throw new Error('Visual semantic analysis returned an invalid result.');
  }
  return response;
}

function bindingKey(binding: { sceneId: string; sceneIndex: number; sceneTextFingerprint: string }): string {
  return binding.sceneId + '|' + binding.sceneIndex + '|' + binding.sceneTextFingerprint;
}

// ============================================================
// ULTRA PREMIUM API FUNCTIONS
// ============================================================

async function postJSON<T>(fn: string, body: unknown): Promise<T> {
  return apiClient.post<T>(
    fn,
    body,
    { retryCount: 0, timeoutMs: 60_000 },
  );
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
