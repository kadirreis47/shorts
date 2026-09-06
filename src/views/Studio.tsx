import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SetStateAction } from 'react';
import { flushSync } from 'react-dom';
import {
  Sparkles, Mic, Film, Youtube, ArrowRight, ArrowLeft, Check, Loader2,
  Wand2, RefreshCw, AlertCircle, Volume2, X, Palette, Music, Video,
  ImagePlus, Headphones, Type, Zap, Move, User, Search, Download, Tag, Globe,
  Activity, Languages, Eye, EyeOff, ZoomIn, ZoomOut, Save, RotateCcw, FolderOpen, ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { isApiError } from '@/lib/api/client';
import type { MediaStorageObject, ProviderMediaProvenance, Scene, Voice, PexelsVideo, VisualMode, VisualStyle, CharacterProfile } from '@/lib/types';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';
import {
  generateVoiceover, getProviderStatus, listVoices, uploadMedia,
  searchImages, searchVideos, ingestPexelsImage, ingestPexelsVideo, discardPexelsVideoQuarantine,
  generateAIImage, researchFootage, translateSubtitles, planVisualQueries, issueOpaqueMediaAnalysisReference, issueOpaqueSpatialMediaAnalysisReference, analyzeVisualSemantics, analyzeDiscoveryCandidateSemantics, analyzeVisualSpatial, analyzeDiscoveryCandidateSpatial, resolveOwnedImageDisplayGeometry, type SubtitleTranslationUnavailableReason,
} from '@/lib/api';
import type { HookVariation, ScriptAnalysis } from '@/lib/types';
import {
  renderVideo, type CaptionStyle, type TransitionStyle, type MotionStyle,
} from '@/lib/videoRenderer';
import { Card, Button } from '@/components/ui';
import { AIPipelineMonitor } from '@/components/AIPipelineMonitor';
import { classNames } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { clearStudioDraft, loadStudioDraft, resolveStudioAudioNarrationMode, saveStudioDraft, type BrowserTtsFinalIntent, type StudioDraft, type StudioStep, type StudioVoiceoverMode } from '@/lib/studioDraft';
import { canonicalStudioCompositionOutput, canonicalStudioOutputScenes, isStudioOutputRevisionCurrent } from '@/lib/studioOutputIdentity';
import { applyCinematographyApplicationProposal, assessCinematography, createCinematographyApplicationProposal, createImageFramingApplicationProposal, createSceneVisualBinding, createSpatialContinuityEvidenceReport, createSpatialContinuityFramingRecommendations, createVisualRhythmEvidenceReport, createVisualSemanticRequestRegistry, createVisualSpatialEvidenceRecord, createVisualSpatialRequestRegistry, createVisualStoryPlan, discoverVisualCandidates, interpretVisualSemanticAnalysis, isImageFramingApplicationProposalCurrent, isSceneVisualBindingCurrent, isSpatialContinuityFramingRecommendationCurrent, isVisualQueryPlanCurrent, isVisualSpatialEvidenceRecordBoundTo, isVisualSpatialEvidenceRecordCurrent, semanticRankingAdjustment, unavailableVisualSpatialAnalysis, visualBriefFingerprint, visualSpatialEvidenceSourceEqual, visualSpatialEvidenceSourceFromTrustedGeometry, VISUAL_SEMANTIC_ANALYSIS_DIMENSIONS, type CinematographyApplicationProposal, type ImageFramingApplicationProposalV1, type SpatialContinuityFramingRecommendationV1, type VisualDiscoveryShortlist, type VisualIntelligencePlanningState, type VisualSemanticAssessment, type VisualSpatialEvidenceBinding, type VisualSpatialEvidenceRecord, type VisualStoryMediaContext } from '@/core/visual-intelligence';
import { assignNewCanonicalSceneIds, createCanonicalSceneId } from '@/lib/sceneIdentity';
import { createPexelsVisualDiscoveryProvider } from '@/services/pexelsVisualDiscoveryProvider';
import { mergeVisualIntelligencePlanning } from '@/services/visualQueryPlannerController';
import { getStudioWorkflow } from '@/lib/studioWorkflow';
import { applicationContainer, dependencyTokens } from '@/core/di';
import { assessNarrationAlignment, canonicalizeStudioRecipeTransition, compileStudioProductionRecipeV1, isStudioRecipeCanonicalTransition, normalizeStudioProductionRecipeV1, resolveEffectiveSceneComposition, resolveSubtitleTimingScenes, serializeCanonicalSubtitleSrt } from '@/core/media';
import { DirectorAnalysisAction } from '@/components/DirectorAnalysisAction';
import { activateStudioProject, createStudioProjectIdentity, resolveStudioProjectId, startNewStudioProject } from '@/services/studioProjectIdentity';
import { enqueueActiveExport, loadExportCapabilities, planActiveExport, waitForActiveExport } from '@/services/exportIntelligenceController';
import { isVerifiedExportJob, type ExportJob } from '@/core/export-intelligence';
import { useMediaStore, useProjectStore, usePublishingStore, useUIStore } from '@/store';
import { createStudioProjectDraft, resolveRestoredStudioChannelId, resolveStudioDraftRestore } from '@/services/studioDraftRestore';
import { createVideoChannelAttribution, toSafePublishingTarget } from '@/services/videoChannelAttribution';
import { reconcileCharacterProfileSelection } from '@/services/characterProfileSelection';
import {
  assertCurrentMediaOwnerContext,
  captureValidatedMediaOwnerContext,
  createPrivateMediaSignedUrl,
  resolvePrivateSceneMedia,
  toDurableScenes,
  type ValidatedMediaOwnerContext,
} from '@/lib/mediaStorage';
import { isCurrentValidatedOwnerContext } from '@/auth/identity';
import { commitImageGeometryHydration, hydrateTrustedImageGeometry } from '@/lib/imageGeometryHydration';
import { isApprovedCatalogMusicUrl, isValidCatalogMusicBlob, isValidCatalogMusicResponse, MUSIC_TRACKS } from '@/lib/catalogMusic';
import {
  isManualSceneImageImportError,
  requireOneManualSceneImage,
  validateManualSceneImage,
} from '@/lib/manualSceneImageImport';
import {
  ManualSceneVideoImportError,
  isManualSceneVideoImportError,
  requireOneManualSceneVideo,
  validateManualSceneVideo,
} from '@/lib/manualSceneVideoImport';
import { useAuthSessionStore } from '@/auth/session';
import { normalizeTrustedImageDisplayGeometry } from '@/core/media/imageDisplayGeometry';
import {
  imageFramingBindingEqual,
  imageFramingBindingFromHistoricalGeometry,
  imageFramingBindingFromTrustedGeometry,
  imageFramingBindingMatchesTrustedGeometry,
  imageFramingEqual,
  normalizeImageFraming,
  normalizeImageFramingBinding,
  type ImageFramingBindingV1,
  type ImageFramingV1,
} from '@/core/media/imageFraming';
import { ImageFramingPreview } from '@/components/studio/ImageFramingPreview';

interface StudioProps {
  channels: CanonicalChannelIdentity[];
  onNavigateDirector: () => void;
  onNavigatePlatform?: () => void;
}

type Step = StudioStep;

interface ManualImageFramingSession {
  readonly sceneId: string;
  readonly mediaObjectPath: string;
  readonly contentDigest: string;
  readonly orientation: string;
  readonly displayWidth: number;
  readonly displayHeight: number;
  readonly initial?: ImageFramingV1;
  readonly initialBinding?: ImageFramingBindingV1;
  readonly approvalBinding: ImageFramingBindingV1;
  readonly pending?: ImageFramingV1;
}

const STUDIO_IMAGE_FRAMING_OUTPUT = Object.freeze({ width: 1080, height: 1920 });
const MAX_BROWSER_TIMEOUT_MS = 2_147_483_647;

function trustedSceneImageGeometry(scene: Scene, now = Date.now()) {
  if (!scene.imageStorage || scene.videoStorage || scene.videoUrl || !scene.imageDisplayGeometry) return null;
  try {
    return normalizeTrustedImageDisplayGeometry(scene.imageDisplayGeometry, `media:${scene.imageStorage.objectPath}`, now);
  } catch {
    return null;
  }
}

function expiredTrustedSceneImageGeometry(scene: Scene, now: number) {
  if (!scene.imageStorage || scene.videoStorage || scene.videoUrl || !scene.imageDisplayGeometry) return null;
  const authority = (scene.imageDisplayGeometry as { readonly executionAuthority?: { readonly expiresAt?: unknown } }).executionAuthority;
  const expiresAt = typeof authority?.expiresAt === 'string' ? Date.parse(authority.expiresAt) : Number.NaN;
  if (!Number.isSafeInteger(expiresAt) || expiresAt > now) return null;
  try {
    return normalizeTrustedImageDisplayGeometry(
      scene.imageDisplayGeometry,
      `media:${scene.imageStorage.objectPath}`,
      expiresAt - 1,
    );
  } catch {
    return null;
  }
}

function isManualImageFramingSessionCurrent(session: ManualImageFramingSession, scenes: readonly Scene[]): boolean {
  const scene = scenes.find((candidate) => candidate.sceneId === session.sceneId);
  const geometry = scene ? trustedSceneImageGeometry(scene) : null;
  try {
    return Boolean(scene?.imageStorage && scene.imageUrl && geometry
      && scene.imageStorage.objectPath === session.mediaObjectPath
      && geometry.contentDigest === session.contentDigest
      && geometry.encodedToDisplay === session.orientation
      && geometry.displayDimensions.width === session.displayWidth
      && geometry.displayDimensions.height === session.displayHeight
      && imageFramingBindingMatchesTrustedGeometry(session.approvalBinding, geometry, `media:${scene.imageStorage.objectPath}`)
      && imageFramingEqual(scene.imageFraming, session.initial)
      && imageFramingBindingEqual(scene.imageFramingBinding, session.initialBinding));
  } catch {
    return false;
  }
}

type CanonicalImageFramingCommitResult = Readonly<{
  status: 'applied' | 'no-op' | 'stale';
  scenes: readonly Scene[];
}>;

type SpatialFramingTransactionLease = Readonly<{
  transactionTimeMs: number;
  transactionGeneration: number;
  projectId: string;
  visualSessionEpoch: number;
  validatedOwnerContext: ValidatedMediaOwnerContext;
  appliedSpatialEvidence: Readonly<Record<string, VisualSpatialEvidenceRecord>>;
  compositionDefaults: Readonly<{
    motion: MotionStyle;
    transition: ReturnType<typeof canonicalizeStudioRecipeTransition>;
  }>;
}>;

type PendingSpatialFramingApplyAttempt = Readonly<{
  phase: 'queued' | 'submitted';
  proposal: ImageFramingApplicationProposalV1;
  continuityRecommendation?: SpatialContinuityFramingRecommendationV1;
  continuityTransaction?: Readonly<{
    transactionGeneration: number;
    expectedProjectId: string;
    expectedVisualSessionEpoch: number;
    expectedAuthenticatedOwnerId: string;
    expectedAuthSession: ReturnType<typeof useAuthSessionStore.getState>['session'];
    expectedValidatedOwnerContext: ValidatedMediaOwnerContext;
  }>;
  submissionGuardRejected?: boolean;
  expectedFraming: ImageFramingV1;
  expectedBinding: ImageFramingBindingV1;
  initiallyEquivalent: boolean;
}>;

/** One Slice 13A commit boundary shared by manual and advisory Spatial Apply. */
function commitCanonicalImageFraming(
  scenes: readonly Scene[],
  input: {
    readonly sceneId: string;
    readonly sceneIndex: number;
    readonly expectedFraming?: ImageFramingV1;
    readonly expectedBinding?: ImageFramingBindingV1;
    readonly proposedFraming?: ImageFramingV1;
    readonly evaluationTimeMs?: number;
  },
): CanonicalImageFramingCommitResult {
  const scene = scenes[input.sceneIndex];
  if (!scene || scene.sceneId !== input.sceneId
    || !imageFramingEqual(scene.imageFraming, input.expectedFraming)
    || !imageFramingBindingEqual(scene.imageFramingBinding, input.expectedBinding)) return { status: 'stale', scenes };
  const geometry = trustedSceneImageGeometry(scene, input.evaluationTimeMs);
  if (!scene.imageStorage || !geometry) return { status: 'stale', scenes };
  let proposedFraming: ImageFramingV1 | undefined;
  try { proposedFraming = input.proposedFraming === undefined ? undefined : normalizeImageFraming(input.proposedFraming); }
  catch { return { status: 'stale', scenes }; }
  if (!proposedFraming) {
    if (scene.imageFraming === undefined && scene.imageFramingBinding === undefined) return { status: 'no-op', scenes };
    const { imageFraming: _framing, imageFramingBinding: _binding, ...centered } = scene;
    const next = [...scenes]; next[input.sceneIndex] = centered;
    return { status: 'applied', scenes: next };
  }
  const mediaIdentity = `media:${scene.imageStorage.objectPath}`;
  let currentBinding: ImageFramingBindingV1;
  try { currentBinding = imageFramingBindingFromTrustedGeometry(geometry, mediaIdentity, input.evaluationTimeMs); }
  catch { return { status: 'stale', scenes }; }
  if (imageFramingEqual(scene.imageFraming, proposedFraming)
    && imageFramingBindingEqual(scene.imageFramingBinding, currentBinding)) return { status: 'no-op', scenes };
  const next = [...scenes];
  next[input.sceneIndex] = { ...scene, imageFraming: proposedFraming, imageFramingBinding: currentBinding };
  return { status: 'applied', scenes: next };
}

function spatialFramingAttemptReachedCanonicalResult(
  attempt: PendingSpatialFramingApplyAttempt,
  projectId: string,
  scenes: readonly Scene[],
): boolean {
  const { proposal, expectedFraming } = attempt;
  const scene = scenes[proposal.sceneIndex];
  if (projectId !== proposal.projectId || !scene || scene.sceneId !== proposal.sceneId
    || !scene.imageStorage || !imageFramingEqual(scene.imageFraming, expectedFraming)) return false;
  const mediaIdentity = `media:${scene.imageStorage.objectPath}`;
  return mediaIdentity === proposal.mediaIdentity
    && imageFramingBindingEqual(scene.imageFramingBinding, attempt.expectedBinding);
}

function defaultChannelId(channels: readonly CanonicalChannelIdentity[]) {
  return channels.length === 1 ? channels[0].id : '';
}

function safeSubtitleDownloadName(value: string): string {
  const normalized = [...value.trim()]
    .map((character) => character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '-' : character)
    .join('')
    .replace(/\s+/gu, ' ');
  return normalized.slice(0, 120) || 'video';
}

function providerActionError(action: string, error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/not configured|not available/i.test(message)) return `The provider for ${action} is not configured. Contact an administrator.`;
  return `Unable to complete ${action}. Check your connection and try again.`;
}

class StaleVisualSelectionError extends Error {}

function filterSpatialEvidence(
  current: Record<string, VisualSpatialEvidenceRecord>,
  keep: (record: VisualSpatialEvidenceRecord) => boolean,
): Record<string, VisualSpatialEvidenceRecord> {
  const entries = Object.entries(current).filter(([, record]) => keep(record));
  return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
}

type PremiumVisualDiscoveryDiagnosticCode =
  | 'VISUAL_PLANNER_REQUEST_FAILED'
  | 'VISUAL_PLANNER_RESULT_REJECTED'
  | 'VISUAL_DISCOVERY_PROVIDER_UNAVAILABLE'
  | 'VISUAL_DISCOVERY_UNEXPECTED';

function premiumVisualDiscoveryDiagnostic(code: PremiumVisualDiscoveryDiagnosticCode, detail: { apiCode?: string; failedQueryCount?: number; queryCount?: number } = {}): void {
  // Deliberately bounded: no authored scene data, owner/project identity, URLs, or provider payloads.
  console.info('[premium-visual-discovery]', { code, ...detail });
}

type ResearchClientDiagnosticCode =
  | 'RESEARCH_EMPTY'
  | 'RESEARCH_RESPONSE_INVALID'
  | 'RESEARCH_STALE'
  | 'RESEARCH_IMAGE_INGEST_FAILED'
  | 'RESEARCH_VIDEO_INGEST_FAILED'
  | 'RESEARCH_VIDEO_PREPARED'
  | 'RESEARCH_VIDEO_STALE'
  | 'RESEARCH_VIDEO_ATTACHED'
  | 'RESEARCH_REQUEST_FAILED';

function researchClientDiagnostic(code: ResearchClientDiagnosticCode, detail: { resultCount?: number; sceneIndex?: number } = {}): void {
  console.info('[research-footage]', { code, ...detail });
}

type PexelsVideoPrepareDiagnosticCode =
  | 'PEXELS_VIDEO_EDGE_INGEST_FAILED'
  | 'PEXELS_VIDEO_EDGE_INGEST_SUCCEEDED'
  | 'PEXELS_VIDEO_QUARANTINE_FETCH_FAILED'
  | 'PEXELS_VIDEO_QUARANTINE_FETCH_SUCCEEDED'
  | 'PEXELS_VIDEO_PROBE_FAILED'
  | 'PEXELS_VIDEO_PROBE_SUCCEEDED'
  | 'PEXELS_VIDEO_CANONICAL_PROMOTION_FAILED'
  | 'PEXELS_VIDEO_SIGN_FAILED'
  | 'PEXELS_VIDEO_PREPARE_SUCCEEDED'
  | 'PEXELS_VIDEO_QUARANTINE_CLEANUP_FAILED';

function pexelsVideoPrepareDiagnostic(code: PexelsVideoPrepareDiagnosticCode): void {
  console.info('[pexels-video-prepare]', { code });
}

async function prepareDurablePexelsVideo(
  mediaId: number,
  query: string,
  assertCurrent: () => void,
): Promise<{ storage: MediaStorageObject; previewUrl: string; provenance: ProviderMediaProvenance }> {
  let ingested: Awaited<ReturnType<typeof ingestPexelsVideo>>;
  try {
    ingested = await ingestPexelsVideo(mediaId, query);
    pexelsVideoPrepareDiagnostic('PEXELS_VIDEO_EDGE_INGEST_SUCCEEDED');
  } catch (error) {
    pexelsVideoPrepareDiagnostic('PEXELS_VIDEO_EDGE_INGEST_FAILED');
    throw error;
  }
  const quarantineId = ingested.quarantineId;
  try {
    assertCurrent();
    let bytes: ArrayBuffer;
    try {
      const response = await fetch(ingested.quarantineUrl, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error('Pexels video quarantine could not be opened.');
      bytes = await response.arrayBuffer();
      if (bytes.byteLength === 0 || bytes.byteLength > 50 * 1024 * 1024) throw new Error('Pexels video quarantine is invalid.');
      pexelsVideoPrepareDiagnostic('PEXELS_VIDEO_QUARANTINE_FETCH_SUCCEEDED');
    } catch (error) {
      pexelsVideoPrepareDiagnostic('PEXELS_VIDEO_QUARANTINE_FETCH_FAILED');
      throw error;
    }
    assertCurrent();
    try {
      const bridge = window.electronAPI?.ffmpeg;
      if (!bridge?.probeManualMp4) throw new ManualSceneVideoImportError('probe');
      await bridge.probeManualMp4(bytes);
      pexelsVideoPrepareDiagnostic('PEXELS_VIDEO_PROBE_SUCCEEDED');
    } catch (error) {
      pexelsVideoPrepareDiagnostic('PEXELS_VIDEO_PROBE_FAILED');
      throw error;
    }
    assertCurrent();
    let upload: Awaited<ReturnType<typeof uploadMedia>>;
    try {
      upload = await uploadMedia(new Blob([bytes], { type: 'video/mp4' }), 'videos');
    } catch (error) {
      pexelsVideoPrepareDiagnostic('PEXELS_VIDEO_CANONICAL_PROMOTION_FAILED');
      throw error;
    }
    assertCurrent();
    if (!upload.videoUrl) {
      pexelsVideoPrepareDiagnostic('PEXELS_VIDEO_SIGN_FAILED');
      throw new Error('Pexels video could not be opened after validation.');
    }
    pexelsVideoPrepareDiagnostic('PEXELS_VIDEO_PREPARE_SUCCEEDED');
    return { storage: upload.media, previewUrl: upload.videoUrl, provenance: ingested.provenance };
  } finally {
    if (quarantineId) void Promise.resolve(discardPexelsVideoQuarantine(quarantineId)).catch(() => {
      pexelsVideoPrepareDiagnostic('PEXELS_VIDEO_QUARANTINE_CLEANUP_FAILED');
    });
  }
}

/** Builds session-only continuity context from explicit shortlist selections and safe durable provenance IDs. */
function visualStoryMediaContexts(
  scenes: readonly Scene[],
  shortlists: Readonly<Record<string, VisualDiscoveryShortlist>>,
  selections: Readonly<Record<string, string>>,
): readonly VisualStoryMediaContext[] {
  const contexts: VisualStoryMediaContext[] = [];
  const selectedSceneIds = new Set<string>();
  for (const [sceneId, shortlist] of Object.entries(shortlists)) {
    const selected = shortlist.candidates.find((candidate) => candidate.candidateId === selections[sceneId]);
    if (!selected) continue;
    selectedSceneIds.add(sceneId);
    contexts.push(Object.freeze({ sceneId, mediaType: selected.mediaType, origin: 'selection', provider: selected.provider, providerMediaIdentity: selected.providerMediaIdentity, categories: selected.conceptCategories }));
  }
  for (const scene of scenes) {
    const sceneId = scene.sceneId;
    if (!sceneId || selectedSceneIds.has(sceneId)) continue;
    const provenance = scene.imageStorage ? scene.imageProvenance : scene.videoStorage ? scene.videoProvenance : undefined;
    const mediaType = scene.videoStorage ? 'video' : scene.imageStorage ? 'image' : undefined;
    if (!mediaType) continue;
    contexts.push(Object.freeze({ sceneId, mediaType, origin: 'canonical', ...(provenance ? { provider: provenance.provider, providerMediaIdentity: String(provenance.providerMediaId) } : {}) }));
  }
  return Object.freeze(contexts);
}

function narrationRevision(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `${text.length}-${(hash >>> 0).toString(16)}`;
}

function exportFilename(outputPath: string): string {
  return outputPath.split(/[\\/]/).filter(Boolean).at(-1) || 'export.mp4';
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1_024 * 1_024) return `${Math.max(1, Math.round(sizeBytes / 1_024))} KB`;
  return `${(sizeBytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

class StalePostRenderActionError extends Error {}

function canonicalMediaValidationError(build: {
  project: { scenes: Array<{ id: string }> };
  validation: { issues: Array<{ code: string; sceneId?: string }> };
}): string {
  const blockedSceneIds = new Set(
    build.validation.issues
      .filter((issue) => issue.code === 'SCENE_ASSET_UNRESOLVED' || issue.code === 'SCENE_MEDIA_SOURCE_INVALID')
      .map((issue) => issue.sceneId)
      .filter((sceneId): sceneId is string => Boolean(sceneId)),
  );
  const sceneNumbers = build.project.scenes
    .map((scene, index) => blockedSceneIds.has(scene.id) ? index + 1 : null)
    .filter((index): index is number => index !== null);
  return sceneNumbers.length > 0
    ? `Export requires supported canonical media for scene${sceneNumbers.length === 1 ? '' : 's'} ${sceneNumbers.join(', ')}.`
    : 'Studio content must pass canonical media validation before export.';
}

const CAPTION_STYLES: { key: CaptionStyle; label: string; desc: string }[] = [
  { key: 'karaoke', label: 'Karaoke', desc: 'Timed word reveal with accent color' },
  { key: 'highlight', label: 'Highlight', desc: 'Accent color for emphasized words' },
  { key: 'classic', label: 'Classic', desc: 'Bottom captions with a gentle fade' },
  { key: 'minimal', label: 'Minimal', desc: 'Clean bottom captions with a light outline' },
];

const TRANSITION_STYLES: { key: TransitionStyle; label: string; canonical: boolean }[] = [
  { key: 'crossfade', label: 'Crossfade', canonical: true },
  { key: 'slide', label: 'Slide', canonical: false },
  { key: 'zoom', label: 'Zoom Punch', canonical: false },
  { key: 'fadeblack', label: 'Fade to Black', canonical: false },
  { key: 'glitch', label: 'Glitch', canonical: false },
  { key: 'shake', label: 'Shake', canonical: false },
  { key: 'whippan', label: 'Whip Pan', canonical: false },
  { key: 'none', label: 'None', canonical: true },
];

const MOTION_STYLES: { key: MotionStyle; label: string; icon: typeof Move }[] = [
  { key: 'kenburns', label: 'Ken Burns', icon: Move },
  { key: 'zoom_in', label: 'Zoom In', icon: ZoomIn },
  { key: 'zoom_out', label: 'Zoom Out', icon: ZoomOut },
  { key: 'pan', label: 'Pan', icon: Move },
  { key: 'static', label: 'Static', icon: Film },
];

const VISUAL_MODES: { key: VisualMode; labelKey: string; descKey: string; icon: typeof Sparkles }[] = [
  { key: 'auto', labelKey: 'studio.modeAuto', descKey: 'studio.modeAutoDesc', icon: Zap },
  { key: 'ai_cartoon', labelKey: 'studio.modeAICartoon', descKey: 'studio.modeAICartoonDesc', icon: Palette },
  { key: 'ai_realistic', labelKey: 'studio.modeAIRealistic', descKey: 'studio.modeAIRealisticDesc', icon: Sparkles },
  { key: 'ai_anime', labelKey: 'studio.modeAIAnime', descKey: 'studio.modeAIAnimeDesc', icon: Film },
  { key: 'ai_horror', labelKey: 'studio.modeAIHorror', descKey: 'studio.modeAIHorrorDesc', icon: Wand2 },
  { key: 'real_footage', labelKey: 'studio.modeRealFootage', descKey: 'studio.modeRealFootageDesc', icon: Video },
  { key: 'mixed', labelKey: 'studio.modeMixed', descKey: 'studio.modeMixedDesc', icon: Search },
];

export function Studio({ channels, onNavigateDirector, onNavigatePlatform }: StudioProps) {
  const { t, lang } = useI18n();
  const authenticatedUserId = useAuthSessionStore((state) => state.user?.id ?? null);
  const aiService = useMemo(
    () => applicationContainer.resolve(dependencyTokens.aiApplicationService),
    [],
  );
  const [step, setStep] = useState<Step>('topic');
  const projectIdentity = useRef(createStudioProjectIdentity());
  const [directorProjectId, setDirectorProjectId] = useState(projectIdentity.current.current());
  const currentProject = useProjectStore((state) => state.currentProject);
  const [channelId, setChannelId] = useState(() => defaultChannelId(channels));
  const [topic, setTopic] = useState('');
  const [niche, setNiche] = useState('');
  const [tone, setTone] = useState('engaging');
  const [duration, setDuration] = useState(30);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [hasOpenAI, setHasOpenAI] = useState(false);
  const [hasPexels, setHasPexels] = useState(false);
  const [hasElevenLabs, setHasElevenLabs] = useState(false);
  const [providerStatusError, setProviderStatusError] = useState('');
  const [fetchingImages, setFetchingImages] = useState(false);
  const [ingestingPexelsImages, setIngestingPexelsImages] = useState<Set<string>>(new Set());
  const [fetchingVideos, setFetchingVideos] = useState(false);
  const [ingestingPexelsVideos, setIngestingPexelsVideos] = useState<Set<string>>(new Set());
  const [voiceoverMode, setVoiceoverMode] = useState<StudioVoiceoverMode>('none');
  const [browserTtsFinalIntent, setBrowserTtsFinalIntent] = useState<BrowserTtsFinalIntent | null>(null);

  const [title, setTitle] = useState('');
  const [hook, setHook] = useState('');
  const [script, setScript] = useState('');
  const [cta, setCta] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [manualImageFraming, setManualImageFraming] = useState<ManualImageFramingSession | null>(null);
  const scenesRef = useRef<Scene[]>([]);
  // No UI in Slice 1; preserve advisory plans across draft hydration for later Visual Intelligence slices.
  const [visualIntelligence, setVisualIntelligence] = useState<VisualIntelligencePlanningState | undefined>();
  const [visualShortlists, setVisualShortlists] = useState<Record<string, VisualDiscoveryShortlist>>({});
  const visualShortlistsRef = useRef<Record<string, VisualDiscoveryShortlist>>({});
  const [selectedVisualCandidates, setSelectedVisualCandidates] = useState<Record<string, string>>({});
  const selectedVisualCandidatesRef = useRef<Record<string, string>>({});
  const visualPlanningRef = useRef<VisualIntelligencePlanningState | undefined>();
  const [visualDiscoveryBusy, setVisualDiscoveryBusy] = useState<Set<string>>(new Set());
  const [visualApplyBusy, setVisualApplyBusy] = useState<Set<string>>(new Set());
  const visualProviderRef = useRef(createPexelsVisualDiscoveryProvider());
  const visualDiscoveryGenerations = useRef(new Map<string, number>());
  const visualApplyGenerations = useRef(new Map<string, number>());
  const visualApplyActive = useRef(new Set<string>());
  const visualSemanticGenerations = useRef(new Map<string, number>());
  const visualSemanticRequests = useRef(createVisualSemanticRequestRegistry());
  const [visualSemanticBusy, setVisualSemanticBusy] = useState<Set<string>>(new Set());
  const [visualSemanticAssessments, setVisualSemanticAssessments] = useState<Record<string, { readonly mediaPath: string; readonly briefFingerprint: string; readonly assessment: VisualSemanticAssessment }>>({});
  const [candidateSemanticAssessments, setCandidateSemanticAssessments] = useState<Record<string, { readonly briefFingerprint: string; readonly assessment: VisualSemanticAssessment }>>({});
  const candidateSemanticRequests = useRef(createVisualSemanticRequestRegistry());
  const [candidateSemanticBusy, setCandidateSemanticBusy] = useState<Set<string>>(new Set());
  const visualSpatialGenerations = useRef(new Map<string, number>());
  const visualSpatialRequests = useRef(createVisualSpatialRequestRegistry());
  const candidateSpatialRequests = useRef(createVisualSpatialRequestRegistry());
  const [visualSpatialBusy, setVisualSpatialBusy] = useState<Set<string>>(new Set());
  const [candidateSpatialBusy, setCandidateSpatialBusy] = useState<Set<string>>(new Set());
  const [visualSpatialEvidence, setVisualSpatialEvidence] = useState<Record<string, VisualSpatialEvidenceRecord>>({});
  const [candidateSpatialEvidence, setCandidateSpatialEvidence] = useState<Record<string, VisualSpatialEvidenceRecord>>({});
  const [spatialGeometryTrustEpoch, setSpatialGeometryTrustEpoch] = useState(0);
  const spatialGeometryReauthorizationAttempts = useRef(new Map<string, string>());
  const visualSpatialEvidenceRef = useRef<Record<string, VisualSpatialEvidenceRecord>>({});
  const [imageFramingProposals, setImageFramingProposals] = useState<Record<string, ImageFramingApplicationProposalV1>>({});
  const dismissedImageFramingProposals = useRef<Record<string, VisualSpatialEvidenceRecord>>({});
  const [dismissedContinuityFramingRecommendations, setDismissedContinuityFramingRecommendations] = useState<Record<string, string>>({});
  const [imageFramingProposalOutcome, setImageFramingProposalOutcome] = useState<Record<string, 'stale'>>({});
  const [pendingSpatialFramingApplyAttempt, setPendingSpatialFramingApplyAttempt] = useState<PendingSpatialFramingApplyAttempt | null>(null);
  const pendingSpatialFramingApplyAttemptRef = useRef<PendingSpatialFramingApplyAttempt | null>(null);
  const [cinematographyOutcome, setCinematographyOutcome] = useState<Record<string, string>>({});
  const cinematographyApplyActive = useRef(new Set<string>());
  const cinematographyProposalsRef = useRef<Record<string, CinematographyApplicationProposal>>({});
  const visualSessionEpoch = useRef(0);
  const spatialFramingTransactionGeneration = useRef(0);
  const directorProjectIdRef = useRef(directorProjectId);
  useEffect(() => { scenesRef.current = scenes; }, [scenes]);
  useEffect(() => { selectedVisualCandidatesRef.current = selectedVisualCandidates; }, [selectedVisualCandidates]);
  useEffect(() => { visualShortlistsRef.current = visualShortlists; }, [visualShortlists]);
  useEffect(() => { visualPlanningRef.current = visualIntelligence; }, [visualIntelligence]);
  useLayoutEffect(() => { directorProjectIdRef.current = directorProjectId; }, [directorProjectId]);
  useLayoutEffect(() => { visualSpatialEvidenceRef.current = visualSpatialEvidence; }, [visualSpatialEvidence]);
  useLayoutEffect(() => { pendingSpatialFramingApplyAttemptRef.current = pendingSpatialFramingApplyAttempt; }, [pendingSpatialFramingApplyAttempt]);

  const invalidateSpatialFramingTransactions = useCallback((): void => {
    spatialFramingTransactionGeneration.current += 1;
  }, []);

  const requestDirectorProjectIdChange = useCallback((projectId: string): void => {
    if (directorProjectIdRef.current === projectId) return;
    invalidateSpatialFramingTransactions();
    setDirectorProjectId(projectId);
  }, [invalidateSpatialFramingTransactions]);

  const requestVisualSessionInvalidation = useCallback((): void => {
    invalidateSpatialFramingTransactions();
    visualSessionEpoch.current += 1;
  }, [invalidateSpatialFramingTransactions]);

  const requestVisualSpatialEvidenceChange = useCallback((
    update: SetStateAction<Record<string, VisualSpatialEvidenceRecord>>,
  ): void => {
    invalidateSpatialFramingTransactions();
    setVisualSpatialEvidence(update);
  }, [invalidateSpatialFramingTransactions]);

  useEffect(() => {
    setManualImageFraming((session) => session && isManualImageFramingSessionCurrent(session, scenes) ? session : null);
  }, [scenes]);
  useEffect(() => { setManualImageFraming(null); }, [authenticatedUserId, directorProjectId]);

  // Spatial evidence is session-only and remains visible only while its exact
  // project, scene/order, and media binding is current.
  useEffect(() => {
    const filteredAppliedEvidence = filterSpatialEvidence(visualSpatialEvidenceRef.current, (record) => {
      const scene = scenes[record.binding.sceneIndex];
      return Boolean(scene?.sceneId === record.binding.sceneId && scene.imageStorage && !scene.videoStorage
        && isVisualSpatialEvidenceRecordBoundTo(record, {
          projectId: directorProjectId, sceneId: scene.sceneId, sceneIndex: record.binding.sceneIndex,
          scope: 'applied-image', mediaIdentity: `media:${scene.imageStorage.objectPath}`,
        }));
    });
    if (filteredAppliedEvidence !== visualSpatialEvidenceRef.current) {
      requestVisualSpatialEvidenceChange(filteredAppliedEvidence);
    }
    setCandidateSpatialEvidence((current) => filterSpatialEvidence(current, (record) => {
      const scene = scenes[record.binding.sceneIndex]; const shortlist = scene ? visualShortlists[scene.sceneId] : undefined;
      const selectedId = scene ? selectedVisualCandidates[scene.sceneId] : undefined;
      const candidate = shortlist?.candidates.find((item) => item.candidateId === selectedId);
      return Boolean(scene?.sceneId === record.binding.sceneId && candidate?.mediaType === 'image'
        && isVisualSpatialEvidenceRecordCurrent(record, {
          projectId: directorProjectId, sceneId: scene.sceneId, sceneIndex: record.binding.sceneIndex,
          scope: 'discovery-candidate-image', mediaIdentity: `pexels:image:${candidate.providerMediaIdentity}`,
        }));
    }));
  }, [directorProjectId, requestVisualSpatialEvidenceChange, scenes, selectedVisualCandidates, visualShortlists]);

  useEffect(() => {
    const now = Date.now();
    let earliestExpiry = Number.POSITIVE_INFINITY;
    for (const scene of scenes) {
      const geometry = trustedSceneImageGeometry(scene, now);
      if (!geometry) continue;
      earliestExpiry = Math.min(earliestExpiry, Date.parse(geometry.executionAuthority.expiresAt));
    }
    if (!Number.isFinite(earliestExpiry)) return undefined;
    const delay = Math.max(1, Math.min(MAX_BROWSER_TIMEOUT_MS, earliestExpiry - now));
    const timer = window.setTimeout(() => setSpatialGeometryTrustEpoch((current) => current + 1), delay);
    return () => window.clearTimeout(timer);
  }, [directorProjectId, scenes, spatialGeometryTrustEpoch]);

  useEffect(() => {
    const now = Date.now();
    const projectId = directorProjectId;
    const sessionEpoch = visualSessionEpoch.current;
    let ownerContext: ValidatedMediaOwnerContext;
    try { ownerContext = captureValidatedMediaOwnerContext(); }
    catch { return; }
    const currentSceneIds = new Set(scenes.map((scene) => scene.sceneId));
    for (const sceneId of spatialGeometryReauthorizationAttempts.current.keys()) {
      if (!currentSceneIds.has(sceneId)) spatialGeometryReauthorizationAttempts.current.delete(sceneId);
    }
    const requests = scenes.flatMap((scene, sceneIndex) => {
      const geometry = expiredTrustedSceneImageGeometry(scene, now);
      if (!geometry || !scene.imageStorage) return [];
      const source = imageFramingBindingFromHistoricalGeometry(geometry, geometry.mediaIdentity);
      const requestKey = JSON.stringify({
        projectId,
        sessionEpoch,
        sceneId: scene.sceneId,
        sceneIndex,
        mediaIdentity: source.mediaIdentity,
        contentDigest: source.contentDigest,
        encodedDimensions: source.encodedDimensions,
        displayDimensions: source.displayDimensions,
        encodedToDisplay: source.encodedToDisplay,
        authorityReference: geometry.executionAuthority.reference,
        authorityExpiry: geometry.executionAuthority.expiresAt,
      });
      if (spatialGeometryReauthorizationAttempts.current.get(scene.sceneId) === requestKey) return [];
      spatialGeometryReauthorizationAttempts.current.set(scene.sceneId, requestKey);
      return [{ scene, sceneIndex, source, requestKey, authority: geometry.executionAuthority }];
    });
    if (requests.length === 0) return;

    void hydrateTrustedImageGeometry(requests.map((request) => request.scene), resolveOwnedImageDisplayGeometry, { force: true })
      .then((result) => {
        if (!isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
          || directorProjectIdRef.current !== projectId || visualSessionEpoch.current !== sessionEpoch) return;
        setScenes((current) => {
          let next = current;
          for (const [requestIndex, request] of requests.entries()) {
            if (spatialGeometryReauthorizationAttempts.current.get(request.scene.sceneId) !== request.requestKey) continue;
            const currentScene = current[request.sceneIndex];
            const refreshedScene = result.scenes[requestIndex];
            if (!currentScene || currentScene.sceneId !== request.scene.sceneId
              || currentScene.imageStorage?.objectPath !== request.scene.imageStorage?.objectPath
              || currentScene.videoStorage || !refreshedScene?.imageDisplayGeometry
              || trustedSceneImageGeometry(currentScene, Date.now())) continue;
            const currentExpired = expiredTrustedSceneImageGeometry(currentScene, Date.now());
            if (!currentExpired
              || currentExpired.executionAuthority.reference !== request.authority.reference
              || currentExpired.executionAuthority.expiresAt !== request.authority.expiresAt) continue;
            let currentSource: ImageFramingBindingV1;
            let refreshedSource: ImageFramingBindingV1;
            try {
              currentSource = imageFramingBindingFromHistoricalGeometry(currentExpired, request.source.mediaIdentity);
              const refreshed = normalizeTrustedImageDisplayGeometry(
                refreshedScene.imageDisplayGeometry,
                request.source.mediaIdentity,
              );
              refreshedSource = imageFramingBindingFromHistoricalGeometry(refreshed, request.source.mediaIdentity);
            } catch { continue; }
            if (!imageFramingBindingEqual(currentSource, request.source)
              || !imageFramingBindingEqual(refreshedSource, request.source)) continue;
            if (next === current) next = [...current];
            next[request.sceneIndex] = { ...currentScene, imageDisplayGeometry: refreshedScene.imageDisplayGeometry };
          }
          if (next !== current) scenesRef.current = next;
          return next;
        });
      })
      .catch(() => { /* Expired geometry stays unavailable; a later distinct lifecycle may retry. */ });
  }, [directorProjectId, scenes, spatialGeometryTrustEpoch]);

  function isCurrentSceneOperation(projectId: string, epoch: number, current: readonly Scene[], sceneIndex: number, expected: Scene): boolean {
    return directorProjectIdRef.current === projectId
      && visualSessionEpoch.current === epoch
      && current[sceneIndex]?.sceneId === expected.sceneId
      && current[sceneIndex] === expected;
  }

  function dismissImageFramingProposal(sceneId: string, remember = true): void {
    const evidence = visualSpatialEvidenceRef.current[sceneId];
    if (remember && evidence) dismissedImageFramingProposals.current[sceneId] = evidence;
    setImageFramingProposals((current) => { const { [sceneId]: _ignored, ...rest } = current; return rest; });
    setPendingSpatialFramingApplyAttempt((current) => current?.proposal.sceneId === sceneId ? null : current);
  }

  function clearImageFramingProposalSession(sceneId: string): void {
    setImageFramingProposals((current) => { const { [sceneId]: _ignored, ...rest } = current; return rest; });
    delete dismissedImageFramingProposals.current[sceneId];
    setImageFramingProposalOutcome((current) => { const { [sceneId]: _ignored, ...rest } = current; return rest; });
  }

  function beginManualImageFraming(scene: Scene, pending = scene.imageFraming): void {
    const geometry = trustedSceneImageGeometry(scene);
    if (!scene.imageStorage || !scene.imageUrl || !geometry) return;
    const mediaIdentity = `media:${scene.imageStorage.objectPath}`;
    let initialBinding: ImageFramingBindingV1 | undefined;
    try {
      initialBinding = scene.imageFraming === undefined
        ? undefined
        : normalizeImageFramingBinding(scene.imageFramingBinding, mediaIdentity);
      if (initialBinding && !imageFramingBindingMatchesTrustedGeometry(initialBinding, geometry, mediaIdentity)) return;
    } catch { return; }
    const approvalBinding = imageFramingBindingFromTrustedGeometry(geometry, mediaIdentity);
    setManualImageFraming({
      sceneId: scene.sceneId,
      mediaObjectPath: scene.imageStorage.objectPath,
      contentDigest: geometry.contentDigest,
      orientation: geometry.encodedToDisplay,
      displayWidth: geometry.displayDimensions.width,
      displayHeight: geometry.displayDimensions.height,
      initial: scene.imageFraming,
      initialBinding,
      approvalBinding,
      pending,
    });
    dismissImageFramingProposal(scene.sceneId);
  }

  function updateManualImageFraming(sceneId: string, pending: ImageFramingV1 | undefined): void {
    dismissImageFramingProposal(sceneId);
    setManualImageFraming((current) => current?.sceneId === sceneId ? { ...current, pending } : current);
  }

  const applyCanonicalImageFraming = useCallback((
    resolve: (current: readonly Scene[]) => Parameters<typeof commitCanonicalImageFraming>[1] | null,
  ): void => {
    setScenes((current) => {
      const request = resolve(current);
      if (!request) return current;
      const result = commitCanonicalImageFraming(current, request);
      return result.scenes as Scene[];
    });
  }, []);

  function applyManualImageFraming(): void {
    const session = manualImageFraming;
    if (!session) return;
    applyCanonicalImageFraming((current) => {
      if (!isManualImageFramingSessionCurrent(session, current)) return null;
      const index = current.findIndex((scene) => scene.sceneId === session.sceneId);
      const scene = current[index];
      if (!scene) return null;
      return {
        sceneId: session.sceneId,
        sceneIndex: index,
        expectedFraming: session.initial,
        expectedBinding: session.initialBinding,
        proposedFraming: session.pending,
      };
    });
    setManualImageFraming(null);
    dismissImageFramingProposal(session.sceneId);
  }

  function resetManualImageFraming(sceneId: string): void {
    setScenes((current) => {
      const index = current.findIndex((scene) => scene.sceneId === sceneId);
      const scene = current[index];
      if (!scene || scene.imageFraming === undefined && scene.imageFramingBinding === undefined) return current;
      const { imageFraming: _framing, imageFramingBinding: _binding, ...centered } = scene;
      const next = [...current];
      next[index] = centered;
      return next;
    });
    setManualImageFraming(null);
    dismissImageFramingProposal(sceneId);
  }

  function imageFramingProposalInput(
    currentScenes: readonly Scene[],
    proposal: ImageFramingApplicationProposalV1,
    runtime?: SpatialFramingTransactionLease,
  ) {
    const scene = currentScenes[proposal.sceneIndex];
    const evidence = (runtime?.appliedSpatialEvidence ?? visualSpatialEvidenceRef.current)[proposal.sceneId];
    if (!scene || !evidence) return null;
    const compositionDefaults = runtime?.compositionDefaults ?? {
      motion: motionStyleRef.current,
      transition: canonicalizeStudioRecipeTransition(transitionStyleRef.current),
    } as const;
    return {
      projectId: runtime?.projectId ?? directorProjectIdRef.current,
      scenes: currentScenes,
      sceneIndex: proposal.sceneIndex,
      outputDimensions: STUDIO_IMAGE_FRAMING_OUTPUT,
      effectiveMotion: resolveEffectiveSceneComposition(
        compositionDefaults,
        scene.compositionOverride,
        proposal.sceneIndex,
      ).motion,
      evidence,
      ...(runtime ? { now: runtime.transactionTimeMs } : {}),
    } as const;
  }

  function handleApplySpatialImageFraming(
    proposal: ImageFramingApplicationProposalV1,
    continuityRecommendation?: SpatialContinuityFramingRecommendationV1,
  ): void {
    const preflight = imageFramingProposalInput(scenesRef.current, proposal);
    if (!proposal.proposedFraming || !preflight || !isImageFramingApplicationProposalCurrent(proposal, preflight)) {
      setManualImageFraming(null);
      dismissImageFramingProposal(proposal.sceneId);
      setImageFramingProposalOutcome((current) => ({ ...current, [proposal.sceneId]: 'stale' }));
      return;
    }
    const preflightScene = preflight.scenes[proposal.sceneIndex];
    let expectedBinding: ImageFramingBindingV1;
    try {
      expectedBinding = imageFramingBindingFromHistoricalGeometry(
        preflightScene.imageDisplayGeometry,
        proposal.mediaIdentity,
      );
    } catch {
      setManualImageFraming(null);
      dismissImageFramingProposal(proposal.sceneId);
      setImageFramingProposalOutcome((current) => ({ ...current, [proposal.sceneId]: 'stale' }));
      return;
    }
    let continuityTransaction: PendingSpatialFramingApplyAttempt['continuityTransaction'];
    if (continuityRecommendation) {
      const authState = useAuthSessionStore.getState();
      try {
        const ownerContext = captureValidatedMediaOwnerContext();
        if (authState.status !== 'authenticated' || !authState.user || !authState.session
          || authState.user.id !== ownerContext.ownerId
          || !isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)) throw new Error('Stale owner context.');
        continuityTransaction = Object.freeze({
          transactionGeneration: spatialFramingTransactionGeneration.current,
          expectedProjectId: directorProjectIdRef.current,
          expectedVisualSessionEpoch: visualSessionEpoch.current,
          expectedAuthenticatedOwnerId: authState.user.id,
          expectedAuthSession: authState.session,
          expectedValidatedOwnerContext: ownerContext,
        });
      } catch {
        setManualImageFraming(null);
        dismissImageFramingProposal(proposal.sceneId);
        setImageFramingProposalOutcome((current) => ({ ...current, [proposal.sceneId]: 'stale' }));
        return;
      }
    }
    setManualImageFraming(null);
    setPendingSpatialFramingApplyAttempt({
      phase: 'queued',
      proposal,
      ...(continuityRecommendation ? { continuityRecommendation } : {}),
      ...(continuityTransaction ? { continuityTransaction } : {}),
      expectedFraming: proposal.proposedFraming,
      expectedBinding,
      initiallyEquivalent: imageFramingEqual(
        preflightScene.imageFraming,
        proposal.proposedFraming,
      ) && imageFramingBindingEqual(preflightScene.imageFramingBinding, expectedBinding),
    });
  }

  function handleAdjustSpatialImageFraming(proposal: ImageFramingApplicationProposalV1): void {
    const input = imageFramingProposalInput(scenes, proposal);
    const scene = scenes[proposal.sceneIndex];
    if (!input || !scene || !proposal.proposedFraming || !isImageFramingApplicationProposalCurrent(proposal, input)) {
      clearImageFramingProposalSession(proposal.sceneId);
      setImageFramingProposalOutcome((current) => ({ ...current, [proposal.sceneId]: 'stale' }));
      return;
    }
    clearImageFramingProposalSession(proposal.sceneId);
    beginManualImageFraming(scene, proposal.proposedFraming);
  }

  function currentContinuityFramingInput(
    currentScenes: readonly Scene[],
    runtime?: SpatialFramingTransactionLease,
  ) {
    const evaluationTimeMs = runtime?.transactionTimeMs ?? Date.now();
    const projectId = runtime?.projectId ?? directorProjectIdRef.current;
    const appliedSpatialEvidence = runtime?.appliedSpatialEvidence ?? visualSpatialEvidenceRef.current;
    const compositionDefaults = runtime?.compositionDefaults ?? {
      motion: motionStyleRef.current,
      transition: canonicalizeStudioRecipeTransition(transitionStyleRef.current),
    } as const;
    const continuityInput = {
      projectId,
      scenes: currentScenes,
      appliedSpatialEvidence,
      trustedImageGeometry: Object.fromEntries(currentScenes.map((scene) => [scene.sceneId, scene.imageDisplayGeometry])),
      evaluationTimeMs,
      outputDimensions: STUDIO_IMAGE_FRAMING_OUTPUT,
      compositionDefaults,
    } as const;
    const continuityReport = createSpatialContinuityEvidenceReport(continuityInput);
    const framingProposals = Object.fromEntries(currentScenes.flatMap((scene, sceneIndex) => {
      const evidence = appliedSpatialEvidence[scene.sceneId];
      if (!evidence) return [];
      const effective = resolveEffectiveSceneComposition(compositionDefaults, scene.compositionOverride, sceneIndex);
      return [[scene.sceneId, createImageFramingApplicationProposal({
        projectId,
        scenes: currentScenes,
        sceneIndex,
        outputDimensions: STUDIO_IMAGE_FRAMING_OUTPUT,
        effectiveMotion: effective.motion,
        evidence,
        now: evaluationTimeMs,
      })]];
    }));
    return { continuityReport, continuityInput, framingProposals };
  }

  function handleApplySpatialContinuityFraming(recommendation: SpatialContinuityFramingRecommendationV1): void {
    const input = currentContinuityFramingInput(scenesRef.current);
    if (!isSpatialContinuityFramingRecommendationCurrent(recommendation, input)) {
      setImageFramingProposalOutcome((current) => ({ ...current, [recommendation.target.sceneId]: 'stale' }));
      return;
    }
    const current = createSpatialContinuityFramingRecommendations(input).find((candidate) =>
      candidate.freshnessFingerprint === recommendation.freshnessFingerprint);
    if (!current) {
      setImageFramingProposalOutcome((outcomes) => ({ ...outcomes, [recommendation.target.sceneId]: 'stale' }));
      return;
    }
    handleApplySpatialImageFraming(current.framingProposal, recommendation);
  }

  function handleAdjustSpatialContinuityFraming(recommendation: SpatialContinuityFramingRecommendationV1): void {
    const input = currentContinuityFramingInput(scenesRef.current);
    const current = createSpatialContinuityFramingRecommendations(input).find((candidate) =>
      candidate.freshnessFingerprint === recommendation.freshnessFingerprint);
    if (!current || !isSpatialContinuityFramingRecommendationCurrent(recommendation, input)) {
      setImageFramingProposalOutcome((outcomes) => ({ ...outcomes, [recommendation.target.sceneId]: 'stale' }));
      return;
    }
    setDismissedContinuityFramingRecommendations((dismissed) => ({
      ...dismissed,
      [`${recommendation.boundary.fromSceneId}:${recommendation.boundary.toSceneId}`]: recommendation.freshnessFingerprint,
    }));
    handleAdjustSpatialImageFraming(current.framingProposal);
  }

  useEffect(() => {
    const attempt = pendingSpatialFramingApplyAttempt;
    if (!attempt || attempt.phase !== 'queued') return;
    let cancelled = false;
    const task = window.setTimeout(() => {
      if (cancelled || pendingSpatialFramingApplyAttemptRef.current !== attempt) return;
      const { proposal } = attempt;
      let continuityLease: SpatialFramingTransactionLease | undefined;
      if (attempt.continuityRecommendation) {
        const transaction = attempt.continuityTransaction;
        const authState = useAuthSessionStore.getState();
        let currentOwnerContext: ValidatedMediaOwnerContext | null = null;
        try { currentOwnerContext = captureValidatedMediaOwnerContext(); } catch { /* Rejected below. */ }
        if (!transaction || authState.status !== 'authenticated'
          || authState.user?.id !== transaction.expectedAuthenticatedOwnerId
          || authState.session !== transaction.expectedAuthSession
          || !currentOwnerContext
          || currentOwnerContext.ownerId !== transaction.expectedValidatedOwnerContext.ownerId
          || currentOwnerContext.generation !== transaction.expectedValidatedOwnerContext.generation
          || !isCurrentValidatedOwnerContext(currentOwnerContext.ownerId, currentOwnerContext.generation)
          || directorProjectIdRef.current !== transaction.expectedProjectId
          || visualSessionEpoch.current !== transaction.expectedVisualSessionEpoch
          || spatialFramingTransactionGeneration.current !== transaction.transactionGeneration) {
          setPendingSpatialFramingApplyAttempt((current) => current === attempt
            ? { ...attempt, phase: 'submitted', submissionGuardRejected: true }
            : current);
          return;
        }
        const leaseProjectId = directorProjectIdRef.current;
        const leaseVisualSessionEpoch = visualSessionEpoch.current;
        const leaseAppliedSpatialEvidence = Object.freeze({ ...visualSpatialEvidenceRef.current });
        const leaseCompositionDefaults = Object.freeze({
          motion: motionStyleRef.current,
          transition: canonicalizeStudioRecipeTransition(transitionStyleRef.current),
        });
        const transactionTimeMs = Date.now();
        continuityLease = Object.freeze({
          transactionTimeMs,
          transactionGeneration: transaction.transactionGeneration,
          projectId: leaseProjectId,
          visualSessionEpoch: leaseVisualSessionEpoch,
          validatedOwnerContext: Object.freeze({ ...currentOwnerContext }),
          appliedSpatialEvidence: leaseAppliedSpatialEvidence,
          compositionDefaults: leaseCompositionDefaults,
        });
      }

      flushSync(() => {
        applyCanonicalImageFraming((current) => {
          if (attempt.continuityRecommendation) {
            if (!continuityLease) return null;
            const continuityInput = currentContinuityFramingInput(current, continuityLease);
            const regeneratedRecommendation = createSpatialContinuityFramingRecommendations(continuityInput)
              .find((candidate) => candidate.freshnessFingerprint === attempt.continuityRecommendation?.freshnessFingerprint);
            if (!regeneratedRecommendation
              || !isSpatialContinuityFramingRecommendationCurrent(attempt.continuityRecommendation, continuityInput)
              || regeneratedRecommendation.framingProposal.authority !== proposal.authority) return null;
          }
          const input = imageFramingProposalInput(current, proposal, continuityLease);
          if (!input || !isImageFramingApplicationProposalCurrent(proposal, input)) return null;
          const currentProposal = createImageFramingApplicationProposal(input);
          const scene = current[proposal.sceneIndex];
          if (!scene || currentProposal.status !== 'ready') return null;
          return {
            sceneId: proposal.sceneId,
            sceneIndex: proposal.sceneIndex,
            expectedFraming: scene.imageFraming,
            expectedBinding: scene.imageFramingBinding,
            proposedFraming: currentProposal.proposedFraming,
            ...(continuityLease ? { evaluationTimeMs: continuityLease.transactionTimeMs } : {}),
          };
        });
        setPendingSpatialFramingApplyAttempt((current) => current === attempt
          ? { ...attempt, phase: 'submitted' }
          : current);
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(task);
    };
  }, [applyCanonicalImageFraming, pendingSpatialFramingApplyAttempt]);

  useEffect(() => {
    const attempt = pendingSpatialFramingApplyAttempt;
    if (!attempt || attempt.phase !== 'submitted') return;
    const reachedExpectedResult = spatialFramingAttemptReachedCanonicalResult(attempt, directorProjectId, scenes);
    const transactionOutcome: CanonicalImageFramingCommitResult['status'] = !attempt.submissionGuardRejected && reachedExpectedResult
      ? attempt.initiallyEquivalent ? 'no-op' : 'applied'
      : 'stale';
    setManualImageFraming(null);
    if (transactionOutcome !== 'stale') {
      clearImageFramingProposalSession(attempt.proposal.sceneId);
    } else {
      dismissImageFramingProposal(attempt.proposal.sceneId);
      setImageFramingProposalOutcome((current) => ({ ...current, [attempt.proposal.sceneId]: 'stale' }));
    }
    setPendingSpatialFramingApplyAttempt(null);
  }, [directorProjectId, pendingSpatialFramingApplyAttempt, scenes]);

  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('karaoke');
  const [transitionStyle, setTransitionStyle] = useState<TransitionStyle>('crossfade');
  const [motionStyle, setMotionStyle] = useState<MotionStyle>('kenburns');
  const transitionStyleRef = useRef(transitionStyle);
  const motionStyleRef = useRef(motionStyle);
  useLayoutEffect(() => { transitionStyleRef.current = transitionStyle; }, [transitionStyle]);
  useLayoutEffect(() => { motionStyleRef.current = motionStyle; }, [motionStyle]);

  const requestTransitionStyleChange = useCallback((style: TransitionStyle): void => {
    if (transitionStyleRef.current === style) return;
    invalidateSpatialFramingTransactions();
    setTransitionStyle(style);
  }, [invalidateSpatialFramingTransactions]);

  const requestMotionStyleChange = useCallback((style: MotionStyle): void => {
    if (motionStyleRef.current === style) return;
    invalidateSpatialFramingTransactions();
    setMotionStyle(style);
  }, [invalidateSpatialFramingTransactions]);
  const [useBroll, setUseBroll] = useState(false);
  const [musicId, setMusicId] = useState<string>('');
  const [musicStorage, setMusicStorage] = useState<MediaStorageObject | null>(null);
  const [musicBlob, setMusicBlob] = useState<Blob | null>(null);
  const [musicVolume, setMusicVolume] = useState(0.25);
  const [loadingMusic, setLoadingMusic] = useState(false);
  const musicSelectionGeneration = useRef(0);
  const musicFetchAbort = useRef<AbortController | null>(null);

  // Pro Features state
  const [visualMode, setVisualMode] = useState<VisualMode>('auto');
  const [visualStyles, setVisualStyles] = useState<VisualStyle[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string>('');
  const [characterName, setCharacterName] = useState('');
  const [characterAppearance, setCharacterAppearance] = useState('');
  const [characterArtStyle, setCharacterArtStyle] = useState('realistic');
  const [characterProfileId, setCharacterProfileId] = useState<string>('');
  const [characterProfiles, setCharacterProfiles] = useState<CharacterProfile[]>([]);
  const [generatingVisuals, setGeneratingVisuals] = useState(false);
  const [researchingFootage, setResearchingFootage] = useState(false);
  const [researchingSceneMedia, setResearchingSceneMedia] = useState<ReadonlySet<string>>(() => new Set());
  const [generatingSEOState, setGeneratingSEOState] = useState(false);
  const [seoResult, setSeoResult] = useState<{ optimizedTitle: string; optimizedDescription: string; tags: string[]; hashtags: string[]; thumbnailText: string } | null>(null);
  const [watermarkText, setWatermarkText] = useState('');
  const [watermarkPosition, setWatermarkPosition] = useState('bottom-right');
  const [generatingSceneImage, setGeneratingSceneImage] = useState<string | null>(null);
  const [importingSceneImages, setImportingSceneImages] = useState<ReadonlySet<string>>(() => new Set());
  const [importingSceneVideos, setImportingSceneVideos] = useState<ReadonlySet<string>>(() => new Set());
  const sceneImportGenerations = useRef(new Map<string, number>());
  const pexelsRequestGenerations = useRef({ images: 0, broll: 0, research: 0 });

  // New AI tools & subtitle state
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [captionTextColor, setCaptionTextColor] = useState('');
  const [captionHighlightColor, setCaptionHighlightColor] = useState('');
  const [beatSync, setBeatSync] = useState(false);
  const [hookVariations, setHookVariations] = useState<HookVariation[]>([]);
  const [generatingHooks, setGeneratingHooks] = useState(false);
  const [scriptAnalysis, setScriptAnalysis] = useState<ScriptAnalysis | null>(null);
  const [analyzingScript, setAnalyzingScript] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState('es');

  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [narration, setNarration] = useState<{ storage: MediaStorageObject; durationMs: number; scriptRevision: string; voiceId: string; alignment?: import('@/shared/voiceoverAlignment').NarrationCharacterAlignment } | null>(null);
  const [generatingVoice, setGeneratingVoice] = useState(false);

  const [renderProgress, setRenderProgress] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [studioVideoId, setStudioVideoId] = useState<string | null>(null);
  const [preparingPublish, setPreparingPublish] = useState(false);
  const [completedExport, setCompletedExport] = useState<{ job: ExportJob; revision: string } | null>(null);
  const [postRenderAction, setPostRenderAction] = useState<'open' | 'reveal' | 'save-as' | 'publish' | null>(null);
  const [postRenderNotice, setPostRenderNotice] = useState<string | null>(null);

  const navigate = useUIStore((state) => state.navigate);
  const [draftStatus, setDraftStatus] = useState<'loading' | 'saved' | 'saving' | 'empty'>('loading');
  const [draftSavedAt, setDraftSavedAt] = useState<string>('');
  const [unavailableRestoredChannelId, setUnavailableRestoredChannelId] = useState<string | null>(null);
  const draftHydratedRef = useRef(false);

  const channel = channels.find((c) => c.id === channelId);

  useEffect(() => {
    const candidates: Record<string, ImageFramingApplicationProposalV1> = {};
    for (const [sceneId, evidence] of Object.entries(visualSpatialEvidence)) {
      const sceneIndex = scenes.findIndex((scene) => scene.sceneId === sceneId);
      const scene = scenes[sceneIndex];
      if (!scene) continue;
      const effectiveMotion = resolveEffectiveSceneComposition({
        motion: motionStyle,
        transition: canonicalizeStudioRecipeTransition(transitionStyle),
      }, scene.compositionOverride, sceneIndex).motion;
      const proposal = createImageFramingApplicationProposal({
        projectId: directorProjectId,
        scenes,
        sceneIndex,
        outputDimensions: STUDIO_IMAGE_FRAMING_OUTPUT,
        effectiveMotion,
        evidence,
      });
      if (proposal.status === 'ready' && dismissedImageFramingProposals.current[sceneId] !== evidence) candidates[sceneId] = proposal;
    }
    setImageFramingProposals(candidates);
    dismissedImageFramingProposals.current = Object.fromEntries(Object.entries(dismissedImageFramingProposals.current)
      .filter(([sceneId]) => visualSpatialEvidence[sceneId] && scenes.some((scene) => scene.sceneId === sceneId)));
  }, [directorProjectId, motionStyle, scenes, spatialGeometryTrustEpoch, transitionStyle, visualSpatialEvidence]);

  const spatialGeometryTrustEvaluationTime = Date.now();
  const spatialContinuityInput = useMemo(() => ({
    projectId: directorProjectId,
    scenes,
    appliedSpatialEvidence: visualSpatialEvidence,
    trustedImageGeometry: Object.fromEntries(scenes.map((scene) => [scene.sceneId, scene.imageDisplayGeometry])),
    evaluationTimeMs: spatialGeometryTrustEvaluationTime,
    outputDimensions: STUDIO_IMAGE_FRAMING_OUTPUT,
    compositionDefaults: { motion: motionStyle, transition: canonicalizeStudioRecipeTransition(transitionStyle) },
  } as const), [directorProjectId, motionStyle, scenes, spatialGeometryTrustEvaluationTime, transitionStyle, visualSpatialEvidence]);
  const spatialContinuity = useMemo(() => createSpatialContinuityEvidenceReport(spatialContinuityInput), [spatialContinuityInput]);
  const visualRhythm = useMemo(() => createVisualRhythmEvidenceReport({
    projectId: directorProjectId,
    scenes,
    compositionDefaults: { motion: motionStyle, transition: canonicalizeStudioRecipeTransition(transitionStyle) },
    spatialContinuityReport: spatialContinuity,
  }), [directorProjectId, motionStyle, scenes, spatialContinuity, transitionStyle]);
  const spatialContinuityFramingRecommendations = useMemo(() => createSpatialContinuityFramingRecommendations({
    continuityReport: spatialContinuity,
    continuityInput: spatialContinuityInput,
    framingProposals: imageFramingProposals,
  }), [imageFramingProposals, spatialContinuity, spatialContinuityInput]);
  const visibleSpatialContinuityFramingRecommendations = spatialContinuityFramingRecommendations.filter((recommendation) =>
    dismissedContinuityFramingRecommendations[`${recommendation.boundary.fromSceneId}:${recommendation.boundary.toSceneId}`]
      !== recommendation.freshnessFingerprint);
  const continuityFramingTargetSceneIds = new Set(visibleSpatialContinuityFramingRecommendations.map((recommendation) => recommendation.target.sceneId));

  useEffect(() => {
    const currentBoundaryKeys = new Set(spatialContinuity.boundaries.map((boundary) => `${boundary.fromSceneId}:${boundary.toSceneId}`));
    setDismissedContinuityFramingRecommendations((current) => {
      const entries = Object.entries(current).filter(([key]) => currentBoundaryKeys.has(key));
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });
  }, [spatialContinuity.boundaries]);

  function invalidateNarration(): void {
    setNarration(null);
    setAudioBlob(null);
    setAudioUrl('');
  }

  const hasCanonicalNarration = Boolean(
    narration
    && voiceoverMode === 'elevenlabs'
    && narration.voiceId === selectedVoice
    && narration.scriptRevision === narrationRevision(script),
  );

  const computeCanonicalStudioRevision = useCallback((revisionScenes: readonly Scene[]) => {
    const outputScenes = canonicalStudioOutputScenes(revisionScenes);
    const compositionDefaults = { motion: motionStyle, transition: canonicalizeStudioRecipeTransition(transitionStyle) };
    let canonicalOutput: { scenes: unknown[]; sceneComposition: unknown[]; sceneImageOrientations: unknown[] };
    try {
      canonicalOutput = canonicalStudioCompositionOutput(revisionScenes, compositionDefaults);
    } catch {
      // Malformed hydrated state remains visible for correction and will fail
      // closed at Recipe normalization; it must not crash Studio rendering.
      canonicalOutput = {
        scenes: outputScenes.map(({ compositionOverride: _ignored, ...scene }) => scene),
        sceneComposition: outputScenes.map((scene) => ({ invalidOverride: scene.compositionOverride ?? null })),
        sceneImageOrientations: revisionScenes.map((scene) => ({ invalidGeometry: scene.imageDisplayGeometry ?? null })),
      };
    }
    return JSON.stringify({
      title, hook, script, cta, scenes: canonicalOutput.scenes, sceneComposition: canonicalOutput.sceneComposition, sceneImageOrientations: canonicalOutput.sceneImageOrientations, captionStyle,
      useBroll, musicId, musicStorage, musicVolume, visualMode, selectedStyleId, characterName,
      characterAppearance, characterArtStyle, characterProfileId, watermarkText, watermarkPosition,
      showSubtitles, captionTextColor, captionHighlightColor, voiceoverMode, selectedVoice,
      narration: hasCanonicalNarration && narration ? { storage: narration.storage, durationMs: narration.durationMs, scriptRevision: narration.scriptRevision, voiceId: narration.voiceId, ...(narration.alignment ? { alignment: narration.alignment } : {}) } : null,
    });
  }, [title, hook, script, cta, captionStyle, transitionStyle, motionStyle, useBroll, musicId, musicStorage, musicVolume, visualMode, selectedStyleId, characterName, characterAppearance, characterArtStyle, characterProfileId, watermarkText, watermarkPosition, showSubtitles, captionTextColor, captionHighlightColor, voiceoverMode, selectedVoice, hasCanonicalNarration, narration]);

  const canonicalStudioRevision = useMemo(() => computeCanonicalStudioRevision(scenes), [computeCanonicalStudioRevision, scenes]);

  const currentCompletedExport = completedExport && isStudioOutputRevisionCurrent(completedExport.revision, canonicalStudioRevision) && isVerifiedExportJob(completedExport.job)
    ? completedExport.job
    : null;
  const canonicalStudioRevisionRef = useRef(canonicalStudioRevision);
  canonicalStudioRevisionRef.current = canonicalStudioRevision;

  useEffect(() => {
    invalidateNarration();
    setBrowserTtsFinalIntent(null);
    setCompletedExport(null);
    setPostRenderNotice(null);
    setPostRenderAction(null);
    setPreparingPublish(false);
    setError('');
    // Owner-scoped state must never cross an authenticated owner transition.
    setVisualShortlists({});
    setSelectedVisualCandidates({});
    requestVisualSpatialEvidenceChange({});
    setCandidateSpatialEvidence({});
    setImageFramingProposals({});
    setDismissedContinuityFramingRecommendations({});
    dismissedImageFramingProposals.current = {};
    setImageFramingProposalOutcome({});
    setPendingSpatialFramingApplyAttempt(null);
    setVisualSpatialBusy(new Set());
    setCandidateSpatialBusy(new Set());
    setCinematographyOutcome({});
    cinematographyProposalsRef.current = {};
    requestVisualSessionInvalidation();
    visualApplyActive.current.clear();
    setIngestingPexelsImages(new Set());
    setIngestingPexelsVideos(new Set());
    setResearchingSceneMedia(new Set());
    setGeneratingSceneImage(null);
    setImportingSceneImages(new Set());
    setImportingSceneVideos(new Set());
    setFetchingImages(false);
    setFetchingVideos(false);
    setResearchingFootage(false);
    setGeneratingVisuals(false);
    setGenerating(false);
  }, [authenticatedUserId, requestVisualSessionInvalidation, requestVisualSpatialEvidenceChange]);

  useEffect(() => {
    if (completedExport && !isStudioOutputRevisionCurrent(completedExport.revision, canonicalStudioRevision)) setPostRenderNotice(t('studio.exportOutdated'));
  }, [canonicalStudioRevision, completedExport, t]);

  useEffect(() => {
    let cancelled = false;
    const decision = resolveStudioDraftRestore({
      currentProjectId: currentProject?.id,
      globalDraft: loadStudioDraft(),
      projectDrafts: useProjectStore.getState().drafts,
      fallbackProjectId: projectIdentity.current.current(),
    });
    const { draft } = decision;
    const projectId = resolveStudioProjectId(currentProject?.id, decision.projectId);
    activateStudioProject(projectIdentity.current, projectId);
    requestDirectorProjectIdChange(projectId);
    // Discovery results, selection, and provider previews are intentionally session-only
    // and must never follow a project hydration transition.
    setVisualShortlists({});
    setSelectedVisualCandidates({});
    requestVisualSpatialEvidenceChange({});
    setCandidateSpatialEvidence({});
    setImageFramingProposals({});
    setDismissedContinuityFramingRecommendations({});
    dismissedImageFramingProposals.current = {};
    setImageFramingProposalOutcome({});
    setPendingSpatialFramingApplyAttempt(null);
    setVisualSpatialBusy(new Set());
    setCandidateSpatialBusy(new Set());
    setCinematographyOutcome({});
    cinematographyProposalsRef.current = {};
    requestVisualSessionInvalidation();
    visualApplyActive.current.clear();
    setIngestingPexelsImages(new Set());
    setIngestingPexelsVideos(new Set());
    setResearchingSceneMedia(new Set());
    setGeneratingSceneImage(null);
    setImportingSceneImages(new Set());
    setImportingSceneVideos(new Set());
    setFetchingImages(false);
    setFetchingVideos(false);
    setResearchingFootage(false);
    setGeneratingVisuals(false);
    setGenerating(false);
    if (draft) {
      const restoredChannelId = resolveRestoredStudioChannelId(draft.channelId, channels.map((candidate) => candidate.id));
      const savedChannelUnavailable = Boolean(draft.channelId.trim() && !restoredChannelId);
      setStep(savedChannelUnavailable ? 'topic' : draft.step);
      setChannelId(restoredChannelId);
      setUnavailableRestoredChannelId(savedChannelUnavailable ? draft.channelId : null);
      setTopic(draft.topic);
      setNiche(draft.niche);
      setTone(draft.tone);
      setDuration(draft.duration);
      setTitle(draft.title);
      setHook(draft.hook);
      setScript(draft.script);
      setCta(draft.cta);
      // Persisted technical geometry is never accepted as source authority on
      // restart. Re-derive it from the exact owner-bound bytes below.
      const restoredScenes = toDurableScenes(draft.scenes ?? []).map(({ imageDisplayGeometry: _untrustedPersistedGeometry, ...scene }) => scene);
      const geometryHydrationEpoch = visualSessionEpoch.current;
      setScenes(restoredScenes);
      setVisualIntelligence(draft.visualIntelligence);
      if (restoredScenes.some((scene) => scene.imageStorage || scene.videoStorage)) {
        void resolvePrivateSceneMedia(restoredScenes)
          .then(async (resolvedScenes) => ({
            resolvedScenes,
            geometry: await hydrateTrustedImageGeometry(resolvedScenes, resolveOwnedImageDisplayGeometry),
          }))
          .then(({ resolvedScenes, geometry }) => {
            if (cancelled || directorProjectIdRef.current !== projectId) return;
            setScenes((current) => {
              const merged = commitImageGeometryHydration({
                expectedProjectId: projectId, currentProjectId: directorProjectIdRef.current,
                expectedEpoch: geometryHydrationEpoch, currentEpoch: visualSessionEpoch.current,
                current, requested: restoredScenes, hydrated: geometry.scenes,
              });
              return merged.map((scene) => {
                const resolved = resolvedScenes.find((candidate) => candidate.sceneId === scene.sceneId);
                if (!resolved) return scene;
                if (scene.imageStorage?.objectPath === resolved.imageStorage?.objectPath) return { ...scene, imageUrl: resolved.imageUrl };
                if (scene.videoStorage?.objectPath === resolved.videoStorage?.objectPath) return { ...scene, videoUrl: resolved.videoUrl };
                return scene;
              });
            });
          })
          .catch(() => { /* Stable identity remains available for a later signed-URL retry. */ });
      }
      setCaptionStyle(draft.captionStyle);
      requestTransitionStyleChange(draft.transitionStyle);
      requestMotionStyleChange(draft.motionStyle);
      setUseBroll(draft.useBroll);
      // Legacy drafts only persisted a transient track id/object URL. They
      // cannot be revived as canonical audio until the bounded track is
      // selected again and uploaded under the current owner.
      setMusicId(draft.musicStorage ? draft.musicId : '');
      setMusicStorage(draft.musicStorage ?? null);
      setMusicVolume(draft.musicVolume);
      setVisualMode(draft.visualMode);
      setSelectedStyleId(draft.selectedStyleId);
      setCharacterName(draft.characterName);
      setCharacterAppearance(draft.characterAppearance);
      setCharacterArtStyle(draft.characterArtStyle);
      setCharacterProfileId(draft.characterProfileId);
      setWatermarkText(draft.watermarkText);
      setWatermarkPosition(draft.watermarkPosition);
      setShowSubtitles(draft.showSubtitles);
      setCaptionTextColor(draft.captionTextColor);
      setCaptionHighlightColor(draft.captionHighlightColor);
      setBeatSync(draft.beatSync);
      setVoiceoverMode(draft.voiceoverMode);
      setBrowserTtsFinalIntent(draft.voiceoverMode === 'browser' && draft.browserTtsFinalIntent === 'without-narration'
        ? 'without-narration'
        : null);
      setSelectedVoice(draft.selectedVoice);
      if (draft.narration && Number.isSafeInteger(draft.narration.durationMs) && draft.narration.durationMs > 0) {
        try {
          const storage = draft.narration.storage;
          const ownerContext = captureValidatedMediaOwnerContext();
          setNarration(draft.narration);
          void createPrivateMediaSignedUrl(storage, ownerContext).then((url) => {
            if (!cancelled) setAudioUrl(url);
          }).catch(() => { /* Canonical identity remains recoverable for a later signing attempt. */ });
        } catch { setNarration(null); }
      } else setNarration(null);
      setTargetLanguage(draft.targetLanguage);
      setDraftSavedAt(draft.savedAt);
      setDraftStatus('saved');
    } else {
      setStep('topic');
      setChannelId(defaultChannelId(channels));
      setUnavailableRestoredChannelId(null);
      setTopic('');
      setTitle('');
      setHook('');
      setScript('');
      setCta('');
      setScenes([]);
      setVisualIntelligence(undefined);
      setDraftSavedAt('');
      setDraftStatus('empty');
    }
    draftHydratedRef.current = true;
    return () => { cancelled = true; };
  }, [channels, currentProject?.id, requestDirectorProjectIdChange, requestMotionStyleChange,
    requestTransitionStyleChange, requestVisualSessionInvalidation, requestVisualSpatialEvidenceChange]);

  const draft = useMemo<StudioDraft>(() => ({
    version: 1,
    projectId: directorProjectId,
    savedAt: new Date().toISOString(),
    step,
    channelId: unavailableRestoredChannelId ?? channelId,
    topic,
    niche,
    tone,
    duration,
    title,
    hook,
    script,
    cta,
    scenes: toDurableScenes(scenes),
    visualIntelligence,
    captionStyle,
    transitionStyle,
    motionStyle,
    useBroll,
    musicId,
    musicStorage: musicStorage ?? undefined,
    musicVolume,
    visualMode,
    selectedStyleId,
    characterName,
    characterAppearance,
    characterArtStyle,
    characterProfileId,
    watermarkText,
    watermarkPosition,
    showSubtitles,
    captionTextColor,
    captionHighlightColor,
    beatSync,
    voiceoverMode,
    browserTtsFinalIntent: browserTtsFinalIntent ?? undefined,
    selectedVoice,
    targetLanguage,
    narration: narration ?? undefined,
  }), [directorProjectId, step, channelId, unavailableRestoredChannelId, topic, niche, tone, duration, title, hook, script, cta, scenes,
    captionStyle, transitionStyle, motionStyle, useBroll, musicId, musicStorage, musicVolume, visualMode,
    selectedStyleId, characterName, characterAppearance, characterArtStyle, characterProfileId,
    watermarkText, watermarkPosition, showSubtitles, captionTextColor, captionHighlightColor,
    beatSync, voiceoverMode, browserTtsFinalIntent, selectedVoice, targetLanguage, narration, visualIntelligence]);

  useEffect(() => {
    if (!draftHydratedRef.current) return;
    const hasContent = Boolean(topic.trim() || title.trim() || script.trim() || scenes.length);
    if (!hasContent) {
      setDraftStatus('empty');
      return;
    }
    setDraftStatus('saving');
    const timer = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      const savedDraft = { ...draft, savedAt };
      const normalizedDraft = saveStudioDraft(savedDraft);
      useProjectStore.getState().upsertDraft(createStudioProjectDraft(normalizedDraft));
      setDraftSavedAt(savedAt);
      setDraftStatus('saved');
    }, 650);
    return () => window.clearTimeout(timer);
  }, [draft, topic, title, script, scenes.length]);

  function handleClearDraft() {
    clearStudioDraft();
    const projectId = startNewStudioProject(projectIdentity.current);
    requestDirectorProjectIdChange(projectId);
    setStep('topic');
    setTopic('');
    setTitle('');
    setHook('');
    setScript('');
    setCta('');
    setScenes([]);
    setVisualIntelligence(undefined);
    setVisualShortlists({});
    setSelectedVisualCandidates({});
    requestVisualSpatialEvidenceChange({});
    setCandidateSpatialEvidence({});
    setImageFramingProposals({});
    setDismissedContinuityFramingRecommendations({});
    dismissedImageFramingProposals.current = {};
    setImageFramingProposalOutcome({});
    setPendingSpatialFramingApplyAttempt(null);
    setVisualSpatialBusy(new Set());
    setCandidateSpatialBusy(new Set());
    setCinematographyOutcome({});
    cinematographyProposalsRef.current = {};
    requestVisualSessionInvalidation();
    visualApplyActive.current.clear();
    setIngestingPexelsImages(new Set());
    setIngestingPexelsVideos(new Set());
    setResearchingSceneMedia(new Set());
    setGeneratingSceneImage(null);
    setImportingSceneImages(new Set());
    setImportingSceneVideos(new Set());
    setFetchingImages(false);
    setFetchingVideos(false);
    setResearchingFootage(false);
    setGeneratingVisuals(false);
    setGenerating(false);
    setAudioBlob(null);
    setAudioUrl('');
    setNarration(null);
    setVideoUrl('');
    setStudioVideoId(null);
    setChannelId(defaultChannelId(channels));
    setUnavailableRestoredChannelId(null);
    setMusicBlob(null);
    setMusicId('');
    setMusicStorage(null);
    setDraftSavedAt('');
    setDraftStatus('empty');
  }

  useEffect(() => {
    if (channelId) {
      const ch = channels.find((c) => c.id === channelId);
      setNiche(ch?.niche ?? '');
    }
  }, [channelId, channels]);

  useEffect(() => {
    let active = true;
    const ownerContext = authenticatedUserId ? captureValidatedMediaOwnerContext() : null;

    void (async () => {
      try {
      // Load visual styles
      const { data: styles } = await supabase.from('visual_styles').select('*');
      if (!active) return;
      setVisualStyles(styles ?? []);
      // Load character profiles
      if (ownerContext) {
        const { data: chars, error: profileError } = await supabase
          .from('character_profiles')
          .select('*')
          .eq('user_id', ownerContext.ownerId);
        assertCurrentMediaOwnerContext(ownerContext);
        if (!active) return;
        const profiles = profileError ? [] : chars ?? [];
        setCharacterProfiles(profiles);
        setCharacterProfileId((current) => reconcileCharacterProfileSelection(current, profiles));
      } else {
        setCharacterProfiles([]);
        setCharacterProfileId('');
      }
      try {
        const status = await getProviderStatus();
        if (!active) return;
        setHasOpenAI(status.openai.configured);
        setHasPexels(status.pexels.configured);
        setHasElevenLabs(status.elevenlabs.configured);
        setProviderStatusError('');
      } catch {
        if (!active) return;
        // Fail closed: provider-backed controls remain unavailable until server status is known.
        setHasOpenAI(false);
        setHasPexels(false);
        setHasElevenLabs(false);
        setProviderStatusError('Provider availability could not be checked. Provider-backed tools are unavailable right now.');
      }
      } catch {
        // A stale owner query is deliberately ignored. A current query failure
        // fails closed for the private profile selector without surfacing data.
        if (!active) return;
        if (!ownerContext || isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)) {
          setCharacterProfiles([]);
          setCharacterProfileId('');
        }
      }
    })();
    return () => { active = false; };
  }, [authenticatedUserId]);

  const steps: { key: Step; label: string; icon: typeof Sparkles }[] = [
    { key: 'topic', label: t('studio.topic'), icon: Wand2 },
    { key: 'script', label: t('studio.script'), icon: Sparkles },
    { key: 'style', label: t('studio.style'), icon: Palette },
    { key: 'voice', label: t('studio.voice'), icon: Mic },
    { key: 'render', label: t('studio.render'), icon: Film },
    { key: 'publish', label: t('studio.publish'), icon: Youtube },
  ];
  const workflow = useMemo(() => getStudioWorkflow({
    currentStep: step,
    channelId,
    topic,
    script,
    sceneCount: scenes.length,
    videoUrl,
    published: false,
  }), [step, channelId, topic, script, scenes.length, videoUrl]);

  const currentWorkflowHint = useMemo(() => {
    switch (step) {
      case 'topic': return 'Kanalı ve video konusunu belirle.';
      case 'script': return 'Senaryoyu ve sahneleri gözden geçir.';
      case 'style': return 'Görsel stil, altyazı ve geçişleri ayarla.';
      case 'voice': return 'Seslendirme yöntemini seç ve sesi hazırla.';
      case 'render': return 'Videoyu oluştur ve sonucu kontrol et.';
      case 'publish': return 'Başlık ve yayın ayarlarını tamamla.';
    }
  }, [step]);

  async function handleGenerateScript() {
    setGenerating(true);
    setError('');
    const projectId = directorProjectIdRef.current;
    const sessionEpoch = visualSessionEpoch.current;
    try {
      const result = await aiService.generateScript(
        { topic, niche, tone, duration },
        { metadata: { source: 'studio', action: 'generate-script' } },
      );
      if (directorProjectIdRef.current !== projectId || visualSessionEpoch.current !== sessionEpoch) return;
      setTitle(result.title);
      setHook(result.hook);
      setScript(result.script);
      invalidateNarration();
      setCta(result.cta);
      setScenes(assignNewCanonicalSceneIds((result.scenes ?? []).map(({ imageFraming: _framing, imageFramingBinding: _binding, imageDisplayGeometry: _geometry, ...scene }) => scene)));
      setStep('script');
    } catch (e) {
      if (directorProjectIdRef.current === projectId && visualSessionEpoch.current === sessionEpoch) {
        setError(e instanceof Error ? e.message : 'Failed to generate script');
      }
    } finally {
      if (directorProjectIdRef.current === projectId && visualSessionEpoch.current === sessionEpoch) setGenerating(false);
    }
  }

  function handleManualScript() {
    setTitle(topic);
    setHook('');
    setScript('');
    setCta('');
    setScenes([{ sceneId: createCanonicalSceneId(), text: '', duration: duration, visual: '', keywords: [] }]);
    setStep('script');
  }

  async function handleLoadVoices() {
    if (!hasElevenLabs) return;
    try {
      const v = await listVoices();
      setVoices(v);
      if (v.length > 0 && !selectedVoice) setSelectedVoice(v[0].voice_id);
    } catch (loadError) {
      setError(providerActionError('ElevenLabs voices', loadError));
    }
  }

  // Pro Features handlers
  async function handleGenerateAllVisuals() {
    if (scenes.length === 0) return;
    if (!hasOpenAI) { setError('OpenAI image generation is not configured. Contact an administrator.'); return; }
    setGeneratingVisuals(true);
    setError('');
    const ownerContext = captureValidatedMediaOwnerContext();
    const projectId = directorProjectIdRef.current;
    const sessionEpoch = visualSessionEpoch.current;
    const targetScenes = [...scenes];
    try {
      const charDesc = characterName.trim()
        ? `${characterName.trim()}, ${characterAppearance.trim()}`
        : undefined;
      const updatedScenes = [...targetScenes];
      let succeeded = 0;
      let failed = 0;
      let firstFailure: unknown;
      for (let i = 0; i < updatedScenes.length; i++) {
        assertCurrentMediaOwnerContext(ownerContext);
        const scene = updatedScenes[i];
        const prompt = scene.imagePrompt || scene.visual || scene.text;
        const mode = scene.visualMode || visualMode;
        try {
          const result = await generateAIImage({
            prompt,
            mode: (mode === 'auto' || mode === 'real_footage' || mode === 'mixed') ? 'ai_realistic' : mode,
            characterDesc: charDesc,
            sceneContext: scene.text,
          });
          assertCurrentMediaOwnerContext(ownerContext);
          updatedScenes[i] = {
            ...scene,
            imageUrl: result.imageUrl,
            imageStorage: result.media,
            imageDisplayGeometry: result.imageDisplayGeometry,
            imageFraming: undefined,
            imageFramingBinding: undefined,
            videoUrl: undefined,
            videoStorage: undefined,
            imageProvenance: undefined,
            videoProvenance: undefined,
            imagePrompt: result.revisedPrompt || prompt,
          };
          succeeded += 1;
        } catch (sceneError) {
          assertCurrentMediaOwnerContext(ownerContext);
          failed += 1;
          firstFailure ??= sceneError;
        }
      }
      assertCurrentMediaOwnerContext(ownerContext);
      setScenes((current) => {
        if (directorProjectIdRef.current !== projectId || visualSessionEpoch.current !== sessionEpoch
          || current.length !== targetScenes.length
          || current.some((scene, index) => scene.sceneId !== targetScenes[index].sceneId || scene !== targetScenes[index])) return current;
        return updatedScenes;
      });
      if (failed && directorProjectIdRef.current === projectId && visualSessionEpoch.current === sessionEpoch) {
        setError(succeeded ? `${succeeded} scene visuals were generated; ${failed} could not be generated.` : providerActionError('scene visuals', firstFailure));
      }
    } catch (generationError) {
      if (directorProjectIdRef.current === projectId && visualSessionEpoch.current === sessionEpoch) {
        setError(providerActionError('scene visuals', generationError));
      }
    } finally {
      if (directorProjectIdRef.current === projectId && visualSessionEpoch.current === sessionEpoch) setGeneratingVisuals(false);
    }
  }

  async function handleResearchFootage() {
    if (scenes.length === 0) return;
    if (!hasPexels) { setError('Pexels footage research is not configured. Contact an administrator.'); return; }
    setResearchingFootage(true);
    setError('');
    const ownerContext = captureValidatedMediaOwnerContext();
    const requestGeneration = ++pexelsRequestGenerations.current.research;
    const targetScenes = [...scenes];
    const projectId = directorProjectIdRef.current;
    const sessionEpoch = visualSessionEpoch.current;
    const selectionGenerations = new Map<string, number>();
    for (let index = 0; index < targetScenes.length; index += 1) {
      const sceneId = targetScenes[index].sceneId;
      const generation = (sceneImportGenerations.current.get(sceneId) ?? 0) + 1;
      sceneImportGenerations.current.set(sceneId, generation);
      selectionGenerations.set(sceneId, generation);
    }
    setResearchingSceneMedia(new Set(selectionGenerations.keys()));
    try {
      const results = await researchFootage({ topic: title || script.slice(0, 100), scenes, mode: visualMode });
      assertCurrentMediaOwnerContext(ownerContext);
      if (pexelsRequestGenerations.current.research !== requestGeneration) {
        researchClientDiagnostic('RESEARCH_STALE');
        return;
      }
      if (results.length === 0) researchClientDiagnostic('RESEARCH_EMPTY', { resultCount: 0 });
      let succeeded = 0;
      let failed = 0;
      let firstFailure: unknown;
      for (const result of results) {
        const index = result.sceneIndex;
        const scene = targetScenes[index];
        const sceneId = scene?.sceneId;
        const selectionGeneration = sceneId ? selectionGenerations.get(sceneId) : undefined;
        if (!scene || selectionGeneration === undefined) continue;
        const assertCurrent = () => {
          assertCurrentMediaOwnerContext(ownerContext);
          if (pexelsRequestGenerations.current.research !== requestGeneration
            || sceneImportGenerations.current.get(sceneId) !== selectionGeneration
            || !isCurrentSceneOperation(projectId, sessionEpoch, scenesRef.current, index, scene)) throw new StaleVisualSelectionError();
        };
        try {
          assertCurrent();
          if (result.kind === 'image') {
            const ingested = await ingestPexelsImage(result.mediaId, result.query);
            assertCurrent();
            setScenes((current) => {
              if (!isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
                || sceneImportGenerations.current.get(sceneId) !== selectionGeneration
                || !isCurrentSceneOperation(projectId, sessionEpoch, current, index, scene)) return current;
              const next = [...current];
              next[index] = { ...scene, imageStorage: ingested.media, imageDisplayGeometry: ingested.imageDisplayGeometry, imageFraming: undefined, imageFramingBinding: undefined, imageUrl: ingested.previewUrl, imageProvenance: ingested.provenance, videoStorage: undefined, videoUrl: undefined, videoProvenance: undefined };
              return next;
            });
            succeeded += 1;
          } else {
            const prepared = await prepareDurablePexelsVideo(result.mediaId, result.query, assertCurrent);
            researchClientDiagnostic('RESEARCH_VIDEO_PREPARED', { sceneIndex: index });
            setScenes((current) => {
              if (!isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
                || sceneImportGenerations.current.get(sceneId) !== selectionGeneration
                || !isCurrentSceneOperation(projectId, sessionEpoch, current, index, scene)) return current;
              const next = [...current];
              next[index] = { ...scene, videoStorage: prepared.storage, videoUrl: prepared.previewUrl, videoProvenance: prepared.provenance, imageStorage: undefined, imageDisplayGeometry: undefined, imageFraming: undefined, imageFramingBinding: undefined, imageUrl: undefined, imageProvenance: undefined };
              return next;
            });
            succeeded += 1;
            researchClientDiagnostic('RESEARCH_VIDEO_ATTACHED', { sceneIndex: index });
          }
        } catch (error) {
          if (error instanceof StaleVisualSelectionError) {
            researchClientDiagnostic('RESEARCH_STALE', { sceneIndex: index });
            if (result.kind === 'video') researchClientDiagnostic('RESEARCH_VIDEO_STALE', { sceneIndex: index });
          } else if (sceneImportGenerations.current.get(sceneId) === selectionGeneration
            && directorProjectIdRef.current === projectId && visualSessionEpoch.current === sessionEpoch) {
            researchClientDiagnostic(result.kind === 'image' ? 'RESEARCH_IMAGE_INGEST_FAILED' : 'RESEARCH_VIDEO_INGEST_FAILED', { sceneIndex: index });
            failed += 1;
            firstFailure ??= error;
          }
        } finally {
          if (isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
            && sceneImportGenerations.current.get(sceneId) === selectionGeneration) {
            setResearchingSceneMedia((current) => { const next = new Set(current); next.delete(sceneId); return next; });
          }
        }
      }
      assertCurrentMediaOwnerContext(ownerContext);
      if (pexelsRequestGenerations.current.research !== requestGeneration) return;
      if (failed || succeeded === 0) setError(succeeded ? `${succeeded} scene media items were privately prepared; some scenes could not be updated.` : failed ? providerActionError('footage research', firstFailure) : 'No footage could be found for the current scenes. Try refining the visual descriptions.');
    } catch (researchError) {
      researchClientDiagnostic(
        researchError instanceof Error && /invalid result/i.test(researchError.message)
          ? 'RESEARCH_RESPONSE_INVALID'
          : 'RESEARCH_REQUEST_FAILED',
      );
      if (
        pexelsRequestGenerations.current.research === requestGeneration
        && isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
        && directorProjectIdRef.current === projectId && visualSessionEpoch.current === sessionEpoch
      ) {
        setError(providerActionError('footage research', researchError));
      }
    } finally {
      if (
        pexelsRequestGenerations.current.research === requestGeneration
        && isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
        && directorProjectIdRef.current === projectId && visualSessionEpoch.current === sessionEpoch
      ) { setResearchingFootage(false); setResearchingSceneMedia(new Set()); }
    }
  }

  async function handleGenerateSEO() {
    if (!script.trim() || generatingSEOState) return;
    setGeneratingSEOState(true);
    setError('');
    try {
      const result = await aiService.generateSEO({
        title: title || 'Untitled',
        script,
        hook: hook || undefined,
        niche: channel?.niche || undefined,
        topic: title,
      }, {
        metadata: { source: 'studio', action: 'generate-seo' },
      });
      setSeoResult(result);
    } catch {
      setError('SEO metadata could not be generated. Try again.');
    } finally {
      setGeneratingSEOState(false);
    }
  }

  function currentProductionRecipe(ownerContext: ValidatedMediaOwnerContext, showSubtitlesForBuild = showSubtitles, recipeScenes = scenes) {
    assertCurrentMediaOwnerContext(ownerContext);
    return normalizeStudioProductionRecipeV1({
      projectId: directorProjectId,
      title: title || topic || 'Studio video',
      scenes: toDurableScenes(recipeScenes),
      captionStyle,
      transitionStyle,
      motionStyle,
      // SRT remains a separate downloadable subtitle artifact even when
      // burn-in visibility is off. It still uses the canonical cue planner.
      showSubtitles: showSubtitlesForBuild,
      captionTextColor,
      captionHighlightColor,
      voiceoverMode,
      narration: hasCanonicalNarration && narration ? {
        storage: narration.storage,
        durationMs: narration.durationMs,
        scriptRevision: narration.scriptRevision,
        voiceId: narration.voiceId,
        ...(narration.alignment ? { alignment: narration.alignment } : {}),
      } : null,
      musicId,
      musicStorage,
      musicVolume,
      beatSync,
      watermarkText,
      watermarkPosition,
      visualMode,
      selectedStyleId,
      characterProfileId,
      useBroll,
      characterName,
      characterAppearance,
      characterArtStyle,
    }, ownerContext);
  }

  async function canonicalSubtitleSrt(): Promise<string> {
    const ownerContext = captureValidatedMediaOwnerContext();
    assertCurrentMediaOwnerContext(ownerContext);
    const recipe = currentProductionRecipe(ownerContext, true);
    const mediaEngine = applicationContainer.resolve(dependencyTokens.mediaEngine);
    const build = await mediaEngine.buildProject(compileStudioProductionRecipeV1(recipe));
    assertCurrentMediaOwnerContext(ownerContext);
    return serializeCanonicalSubtitleSrt(build.subtitleTimeline ?? build.project.subtitles);
  }

  async function handleExportSRT() {
    if (scenes.length === 0) return;
    setError('');
    try {
      const srt = await canonicalSubtitleSrt();
      const blob = new Blob([srt], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `subtitles-${title || 'video'}.srt`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Subtitles could not be exported. Try again.');
    }
  }

  async function handleGenerateHooks() {
    if (!topic.trim() || generatingHooks) return;
    setGeneratingHooks(true);
    setError('');
    try {
      const hooks = await aiService.generateHooks(
        { topic, niche, tone },
        { metadata: { source: 'studio', action: 'generate-hooks' } },
      );
      setHookVariations(hooks);
    } catch {
      setError('Hook generation could not be completed. Try again.');
    } finally {
      setGeneratingHooks(false);
    }
  }

  async function handleAnalyzeScript() {
    if (!script.trim() || analyzingScript) return;
    setAnalyzingScript(true);
    setError('');
    try {
      const result = await aiService.analyzeScript(
        { script, hook, niche },
        { metadata: { source: 'studio', action: 'analyze-script' } },
      );
      setScriptAnalysis(result);
    } catch {
      setError('Script analysis could not be completed. Try again.');
    } finally {
      setAnalyzingScript(false);
    }
  }

  async function handleTranslateSubtitles() {
    if (scenes.length === 0 || translating) return;
    setTranslating(true);
    setError('');
    try {
      const srt = await canonicalSubtitleSrt();
      const result = await translateSubtitles({ srt, targetLanguage });
      if (result.status === 'unavailable') {
        setError(translationUnavailableMessage(result.reason));
        return;
      }
      const blob = new Blob([result.translatedSrt], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `subtitles-${targetLanguage}-${safeSubtitleDownloadName(title)}.srt`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Subtitle translation could not be completed. Try again.');
    } finally {
      setTranslating(false);
    }
  }

  function translationUnavailableMessage(reason: SubtitleTranslationUnavailableReason): string {
    if (reason === 'unchanged-result') return t('studio.subtitleTranslationNoChange');
    if (reason === 'incomplete-translation' || reason === 'malformed-provider-response') {
      return t('studio.subtitleTranslationIncomplete');
    }
    return t('studio.subtitleTranslationUnavailable');
  }

  async function handleFindPremiumVisuals(sceneIndex: number, regeneratePlan = false) {
    if (!hasPexels || visualDiscoveryBusy.size || !scenes[sceneIndex]) return;
    const normalizedScenes = scenes;
    const target = normalizedScenes[sceneIndex];
    const binding = createSceneVisualBinding(normalizedScenes, sceneIndex);
    delete cinematographyProposalsRef.current[binding.sceneId];
    setCinematographyOutcome((current) => {
      const { [binding.sceneId]: _ignored, ...rest } = current;
      return rest;
    });
    // A fresh search invalidates its predecessor before either planning or
    // discovery awaits, so retained candidates cannot recreate an old Apply.
    setVisualShortlists((current) => { const next = { ...current }; delete next[binding.sceneId]; return next; });
    setSelectedVisualCandidates((current) => { const next = { ...current }; delete next[binding.sceneId]; return next; });
    visualSpatialGenerations.current.set(`candidate:${binding.sceneId}`, (visualSpatialGenerations.current.get(`candidate:${binding.sceneId}`) ?? 0) + 1);
    setCandidateSpatialEvidence((current) => { const { [binding.sceneId]: _ignored, ...rest } = current; return rest; });
    setCandidateSpatialBusy((current) => { const next = new Set(current); next.delete(binding.sceneId); return next; });
    const projectId = directorProjectIdRef.current;
    const sessionEpoch = visualSessionEpoch.current;
    let owner: ValidatedMediaOwnerContext;
    try { owner = captureValidatedMediaOwnerContext(); } catch { return; }
    const generation = (visualDiscoveryGenerations.current.get(binding.sceneId) ?? 0) + 1;
    visualDiscoveryGenerations.current.set(binding.sceneId, generation);
    const assertCurrent = () => {
      assertCurrentMediaOwnerContext(owner);
      if (visualSessionEpoch.current !== sessionEpoch || directorProjectIdRef.current !== projectId
        || visualDiscoveryGenerations.current.get(binding.sceneId) !== generation
        || !isSceneVisualBindingCurrent(binding, scenesRef.current)) throw new StaleVisualSelectionError();
    };
    scenesRef.current = normalizedScenes;
    setScenes(normalizedScenes);
    setVisualDiscoveryBusy((current) => new Set(current).add(binding.sceneId));
    setError('');
    let stage: 'planning' | 'discovery' = 'planning';
    try {
      let planning = visualPlanningRef.current;
      let brief = planning?.briefs.find((item) => item.sceneBinding.sceneId === binding.sceneId);
      let queryPlan = planning?.queryPlans.find((item) => item.sceneBinding.sceneId === binding.sceneId);
      if (regeneratePlan || !brief || !queryPlan || !isSceneVisualBindingCurrent(brief.sceneBinding, normalizedScenes) || !isVisualQueryPlanCurrent(queryPlan, brief, normalizedScenes)) {
        let result: Awaited<ReturnType<typeof planVisualQueries>>;
        try {
          result = await planVisualQueries({ scenes: [{ sceneBinding: binding, sceneText: target.text, projectContext: title || undefined, visualStylePreference: target.visual || undefined, currentMediaType: target.videoStorage ? 'video' : target.imageStorage ? 'image' : 'none', language: lang }] });
        } catch (error) {
          premiumVisualDiscoveryDiagnostic('VISUAL_PLANNER_REQUEST_FAILED', isApiError(error) ? { apiCode: error.code } : {});
          throw error;
        }
        assertCurrent();
        planning = mergeVisualIntelligencePlanning(visualPlanningRef.current, result.planning); brief = planning.briefs.find((item) => item.sceneBinding.sceneId === binding.sceneId); queryPlan = planning.queryPlans.find((item) => item.sceneBinding.sceneId === binding.sceneId);
        visualPlanningRef.current = planning;
        setVisualIntelligence(planning);
        setVisualShortlists((current) => { const next = { ...current }; delete next[binding.sceneId]; return next; });
      }
      if (!brief || !queryPlan) return;
      assertCurrent();
      stage = 'discovery';
      const continuityContext = planning ? (() => {
        try { return { story: createVisualStoryPlan(planning, normalizedScenes), media: visualStoryMediaContexts(normalizedScenes, visualShortlists, selectedVisualCandidates) }; } catch { return undefined; }
      })() : undefined;
      const shortlist = await discoverVisualCandidates({ brief, queryPlan, provider: visualProviderRef.current, adjacentShortlists: Object.values(visualShortlists), continuityContext });
      assertCurrent();
      if (shortlist.status === 'empty' && shortlist.failedQueryCount > 0) {
        premiumVisualDiscoveryDiagnostic('VISUAL_DISCOVERY_PROVIDER_UNAVAILABLE', { failedQueryCount: shortlist.failedQueryCount, queryCount: shortlist.queryCount });
        setError(t('studio.visualDiscoveryUnavailable'));
        return;
      }
      setVisualShortlists((current) => ({ ...current, [binding.sceneId]: shortlist }));
      setSelectedVisualCandidates((current) => ({ ...current, [binding.sceneId]: shortlist.candidates.some((candidate) => candidate.candidateId === current[binding.sceneId]) ? current[binding.sceneId] : shortlist.candidates[0]?.candidateId ?? '' }));
    } catch (error) {
      if (!(error instanceof StaleVisualSelectionError)) premiumVisualDiscoveryDiagnostic(stage === 'planning' ? 'VISUAL_PLANNER_RESULT_REJECTED' : 'VISUAL_DISCOVERY_UNEXPECTED', isApiError(error) ? { apiCode: error.code } : {});
      if (visualDiscoveryGenerations.current.get(binding.sceneId) === generation && isCurrentValidatedOwnerContext(owner.ownerId, owner.generation) && directorProjectIdRef.current === projectId) setError(stage === 'planning' ? t('studio.visualPlanningUnavailable') : t('studio.visualDiscoveryFailed'));
    } finally {
      if (visualDiscoveryGenerations.current.get(binding.sceneId) === generation) setVisualDiscoveryBusy((current) => { const next = new Set(current); next.delete(binding.sceneId); return next; });
    }
  }

  async function handleApplyPremiumVisual(sceneIndex: number) {
    const scene = scenes[sceneIndex]; const sceneId = scene?.sceneId;
    const shortlist = sceneId ? visualShortlists[sceneId] : undefined; const selectedId = sceneId ? selectedVisualCandidates[sceneId] : undefined;
    const candidate = shortlist?.candidates.find((item) => item.candidateId === selectedId);
    if (!scene || !sceneId || !candidate || visualApplyActive.current.has(`${visualSessionEpoch.current}:${sceneId}`)) return;
    visualSpatialGenerations.current.set(`applied:${sceneId}`, (visualSpatialGenerations.current.get(`applied:${sceneId}`) ?? 0) + 1);
    visualSpatialGenerations.current.set(`candidate:${sceneId}`, (visualSpatialGenerations.current.get(`candidate:${sceneId}`) ?? 0) + 1);
    requestVisualSpatialEvidenceChange((current) => { const { [sceneId]: _ignored, ...rest } = current; return rest; });
    setCandidateSpatialEvidence((current) => { const { [sceneId]: _ignored, ...rest } = current; return rest; });
    setVisualSpatialBusy((current) => { const next = new Set(current); next.delete(sceneId); return next; });
    setCandidateSpatialBusy((current) => { const next = new Set(current); next.delete(sceneId); return next; });
    delete cinematographyProposalsRef.current[sceneId];
    setCinematographyOutcome((current) => {
      const { [sceneId]: _ignored, ...rest } = current;
      return rest;
    });
    const providerMediaId = Number(candidate.providerMediaIdentity);
    if (!Number.isSafeInteger(providerMediaId) || providerMediaId <= 0) {
      setError(t('studio.visualApplyFailed'));
      return;
    }
    const generation = (visualApplyGenerations.current.get(sceneId) ?? 0) + 1;
    visualApplyGenerations.current.set(sceneId, generation);
    const projectId = directorProjectIdRef.current;
    const sessionEpoch = visualSessionEpoch.current;
    let owner: ValidatedMediaOwnerContext;
    try { owner = captureValidatedMediaOwnerContext(); } catch { return; }
    const binding = createSceneVisualBinding(scenes, sceneIndex);
    const operationKey = `${sessionEpoch}:${sceneId}`;
    visualApplyActive.current.add(operationKey);
    setVisualApplyBusy((current) => new Set(current).add(sceneId));
    try {
      const assertCurrent = () => {
        assertCurrentMediaOwnerContext(owner);
        const current = scenesRef.current.find((item) => item.sceneId === sceneId);
        if (!current || visualSessionEpoch.current !== sessionEpoch || directorProjectIdRef.current !== projectId || !isSceneVisualBindingCurrent(binding, scenesRef.current) || current.text !== scene.text || visualApplyGenerations.current.get(sceneId) !== generation || selectedVisualCandidatesRef.current[sceneId] !== selectedId) throw new StaleVisualSelectionError();
      };
      assertCurrent();
      if (candidate.mediaType === 'image') {
        const ingested = await ingestPexelsImage(providerMediaId, scene.visual || scene.text);
        assertCurrent();
        setScenes((current) => {
          const currentScene = current.find((item) => item.sceneId === sceneId);
          if (!currentScene || visualSessionEpoch.current !== sessionEpoch || directorProjectIdRef.current !== projectId || !isSceneVisualBindingCurrent(binding, current) || currentScene.text !== scene.text || visualApplyGenerations.current.get(sceneId) !== generation || selectedVisualCandidatesRef.current[sceneId] !== selectedId || !isCurrentValidatedOwnerContext(owner.ownerId, owner.generation)) return current;
          return current.map((item) => item.sceneId !== sceneId ? item : {
            ...item, imageStorage: ingested.media, imageDisplayGeometry: ingested.imageDisplayGeometry, imageUrl: ingested.previewUrl, imageProvenance: ingested.provenance,
            imageFraming: undefined, imageFramingBinding: undefined, videoStorage: undefined, videoUrl: undefined, videoProvenance: undefined,
          });
        });
      } else {
        const prepared = await prepareDurablePexelsVideo(providerMediaId, scene.visual || scene.text, assertCurrent);
        assertCurrent();
        setScenes((current) => {
          const currentScene = current.find((item) => item.sceneId === sceneId);
          if (!currentScene || visualSessionEpoch.current !== sessionEpoch || directorProjectIdRef.current !== projectId || !isSceneVisualBindingCurrent(binding, current) || currentScene.text !== scene.text || visualApplyGenerations.current.get(sceneId) !== generation || selectedVisualCandidatesRef.current[sceneId] !== selectedId || !isCurrentValidatedOwnerContext(owner.ownerId, owner.generation)) return current;
          return current.map((item) => item.sceneId !== sceneId ? item : {
            ...item, videoStorage: prepared.storage, videoUrl: prepared.previewUrl, videoProvenance: prepared.provenance,
            imageStorage: undefined, imageDisplayGeometry: undefined, imageFraming: undefined, imageFramingBinding: undefined, imageUrl: undefined, imageProvenance: undefined,
          });
        });
      }
    } catch {
      if (visualApplyGenerations.current.get(sceneId) === generation && visualSessionEpoch.current === sessionEpoch && isCurrentValidatedOwnerContext(owner.ownerId, owner.generation) && directorProjectIdRef.current === projectId) setError(t('studio.visualApplyFailed'));
    } finally {
      visualApplyActive.current.delete(operationKey);
      if (visualApplyGenerations.current.get(sceneId) === generation) setVisualApplyBusy((current) => { const next = new Set(current); next.delete(sceneId); return next; });
    }
  }

  function handleApplyCinematography(proposal: CinematographyApplicationProposal): void {
    const operationKey = `${proposal.projectId}:${proposal.sceneId}`;
    if (cinematographyApplyActive.current.has(operationKey)) return;
    cinematographyApplyActive.current.add(operationKey);
    try {
      if (currentProject?.id && currentProject.id !== proposal.projectId) {
        setCinematographyOutcome((current) => ({ ...current, [proposal.sceneId]: 'Scene changed — review recommendation again' }));
        return;
      }
      const currentProposal = cinematographyProposalsRef.current[proposal.sceneId];
      if (!currentProposal || currentProposal.authority !== proposal.authority) {
        setCinematographyOutcome((current) => ({ ...current, [proposal.sceneId]: 'Scene changed — review recommendation again' }));
        return;
      }
      const defaults = { motion: motionStyle, transition: canonicalizeStudioRecipeTransition(transitionStyle) } as const;
      const result = applyCinematographyApplicationProposal({
        projectId: directorProjectIdRef.current,
        scenes: scenesRef.current,
        sceneIndex: currentProposal.sceneIndex,
        defaults,
        recommendation: currentProposal.recommendation,
        recommendationMediaIdentity: currentProposal.canonicalMediaIdentity,
        proposal: currentProposal,
      });
      if (result.status === 'applied') {
        const next = [...result.scenes];
        scenesRef.current = next;
        setScenes(next);
      }
      const message = result.status === 'applied' ? 'Applied to current scene'
        : result.status === 'no-op' ? 'Already matches current scene'
          : result.status === 'stale' || result.status === 'conflict' ? 'Scene changed — review recommendation again'
            : result.status === 'invalid-media' ? 'Current media changed — review recommendation again'
              : result.status === 'unsupported' ? 'This recommendation is advisory only'
                : 'Scene is no longer available';
      setCinematographyOutcome((current) => ({ ...current, [proposal.sceneId]: message }));
    } finally {
      cinematographyApplyActive.current.delete(operationKey);
    }
  }

  async function handleAnalyzeSceneVisual(sceneIndex: number) {
    const scene = scenesRef.current[sceneIndex];
    const sceneId = scene?.sceneId;
    if (!scene || !sceneId || !scene.imageStorage || scene.videoStorage) return;
    const plan = visualPlanningRef.current?.queryPlans.find((item) => item.sceneBinding.sceneId === sceneId);
    const brief = visualPlanningRef.current?.briefs.find((item) => item.sceneBinding.sceneId === sceneId);
    if (!plan || !brief || !isSceneVisualBindingCurrent(brief.sceneBinding, scenesRef.current) || !isVisualQueryPlanCurrent(plan, brief, scenesRef.current)) return;
    const mediaPath = scene.imageStorage.objectPath;
    const operation = { sceneId, mediaPath, briefFingerprint: plan.briefFingerprint };
    const owner = captureValidatedMediaOwnerContext();
    if (!visualSemanticRequests.current.tryAcquire(operation)) return;
    const generation = (visualSemanticGenerations.current.get(sceneId) ?? 0) + 1;
    const epoch = visualSessionEpoch.current; const projectId = directorProjectIdRef.current;
    visualSemanticGenerations.current.set(sceneId, generation);
    setVisualSemanticBusy((current) => new Set(current).add(sceneId));
    try {
      const reference = await issueOpaqueMediaAnalysisReference(scene.imageStorage);
      const response = await analyzeVisualSemantics({ reference: reference.reference, requestId: crypto.randomUUID(), intent: { brief, briefFingerprint: visualBriefFingerprint(brief), dimensions: VISUAL_SEMANTIC_ANALYSIS_DIMENSIONS } });
      const current = scenesRef.current[sceneIndex];
      if (!current || current !== scene || current.imageStorage?.objectPath !== mediaPath || current.videoStorage
        || visualSemanticGenerations.current.get(sceneId) !== generation || visualSessionEpoch.current !== epoch || directorProjectIdRef.current !== projectId
        || !isCurrentValidatedOwnerContext(owner.ownerId, owner.generation) || !isSceneVisualBindingCurrent(brief.sceneBinding, scenesRef.current) || !isVisualQueryPlanCurrent(plan, brief, scenesRef.current)) return;
      const assessment = interpretVisualSemanticAnalysis({ version: 1, analyzerVersion: 'visual-semantic-v1', briefFingerprint: plan.briefFingerprint, candidate: { candidateId: `durable-image:${sceneId}`, provider: 'durable-owner-media', providerMediaIdentity: sceneId, mediaType: 'image' } }, response);
      setVisualSemanticAssessments((currentAssessments) => ({ ...currentAssessments, [sceneId]: { mediaPath, briefFingerprint: plan.briefFingerprint, assessment } }));
    } catch {
      const current = scenesRef.current[sceneIndex];
      if (current === scene && visualSemanticGenerations.current.get(sceneId) === generation && visualSessionEpoch.current === epoch && isCurrentValidatedOwnerContext(owner.ownerId, owner.generation)) {
        setVisualSemanticAssessments((currentAssessments) => ({ ...currentAssessments, [sceneId]: { mediaPath, briefFingerprint: plan.briefFingerprint, assessment: { version: 1, status: 'unavailable', analyzerVersion: 'visual-semantic-v1', briefFingerprint: plan.briefFingerprint, candidate: { candidateId: `durable-image:${sceneId}`, provider: 'durable-owner-media', providerMediaIdentity: sceneId, mediaType: 'image' }, signals: [], unavailableReason: 'provider-unavailable' } } }));
      }
    } finally {
      visualSemanticRequests.current.release(operation);
      if (visualSemanticGenerations.current.get(sceneId) === generation && visualSessionEpoch.current === epoch && isCurrentValidatedOwnerContext(owner.ownerId, owner.generation)) setVisualSemanticBusy((current) => { const next = new Set(current); next.delete(sceneId); return next; });
    }
  }

  async function handleAnalyzeDiscoveryCandidate(sceneIndex: number, candidateId: string) {
    const scene = scenesRef.current[sceneIndex]; const sceneId = scene?.sceneId;
    const plan = sceneId ? visualPlanningRef.current?.queryPlans.find((item) => item.sceneBinding.sceneId === sceneId) : undefined;
    const brief = sceneId ? visualPlanningRef.current?.briefs.find((item) => item.sceneBinding.sceneId === sceneId) : undefined;
    const shortlist = sceneId ? visualShortlistsRef.current[sceneId] : undefined;
    const candidate = shortlist?.candidates.find((item) => item.candidateId === candidateId);
    if (!scene || !sceneId || !plan || !brief || !candidate || candidate.provider !== 'pexels' || candidate.mediaType !== 'image' || !/^\d+$/u.test(candidate.providerMediaIdentity)) return;
    const operation = { sceneId, mediaPath: candidate.candidateId, briefFingerprint: plan.briefFingerprint };
    const owner = captureValidatedMediaOwnerContext(); if (!candidateSemanticRequests.current.tryAcquire(operation)) return;
    const discoveryGeneration = visualDiscoveryGenerations.current.get(sceneId) ?? 0;
    const generation = (visualSemanticGenerations.current.get(sceneId) ?? 0) + 1; const epoch = visualSessionEpoch.current; const projectId = directorProjectIdRef.current;
    visualSemanticGenerations.current.set(sceneId, generation); setCandidateSemanticBusy((current) => new Set(current).add(candidate.candidateId));
    try {
      const response = await analyzeDiscoveryCandidateSemantics({ candidate: { provider: 'pexels', providerAssetId: Number(candidate.providerMediaIdentity), mediaType: 'image' }, requestId: crypto.randomUUID(), intent: { brief, briefFingerprint: visualBriefFingerprint(brief), dimensions: VISUAL_SEMANTIC_ANALYSIS_DIMENSIONS } });
      const currentShortlist = visualShortlistsRef.current[sceneId];
      if (!currentShortlist?.candidates.some((item) => item.candidateId === candidate.candidateId) || visualDiscoveryGenerations.current.get(sceneId) !== discoveryGeneration || visualSemanticGenerations.current.get(sceneId) !== generation || visualSessionEpoch.current !== epoch || directorProjectIdRef.current !== projectId || !isCurrentValidatedOwnerContext(owner.ownerId, owner.generation) || !isVisualQueryPlanCurrent(plan, brief, scenesRef.current)) return;
      const assessment = interpretVisualSemanticAnalysis({ version: 1, analyzerVersion: 'visual-semantic-v1', briefFingerprint: plan.briefFingerprint, candidate }, response);
      setCandidateSemanticAssessments((current) => ({ ...current, [candidate.candidateId]: { briefFingerprint: plan.briefFingerprint, assessment } }));
    } catch {
      if (visualSemanticGenerations.current.get(sceneId) === generation && visualSessionEpoch.current === epoch && isCurrentValidatedOwnerContext(owner.ownerId, owner.generation)) {
        setCandidateSemanticAssessments((current) => ({
          ...current,
          [candidate.candidateId]: {
            briefFingerprint: plan.briefFingerprint,
            assessment: { version: 1, status: 'unavailable', analyzerVersion: 'visual-semantic-v1', briefFingerprint: plan.briefFingerprint, candidate, signals: [], unavailableReason: 'provider-unavailable' },
          },
        }));
      }
    } finally { candidateSemanticRequests.current.release(operation); if (visualSemanticGenerations.current.get(sceneId) === generation) setCandidateSemanticBusy((current) => { const next = new Set(current); next.delete(candidate.candidateId); return next; }); }
  }

  async function handleAnalyzeSceneSpatial(sceneIndex: number) {
    const scene = scenesRef.current[sceneIndex]; const sceneId = scene?.sceneId;
    if (!scene || !sceneId || !scene.imageStorage || scene.videoStorage) return;
    const requestGeometry = trustedSceneImageGeometry(scene);
    if (!requestGeometry) return;
    clearImageFramingProposalSession(sceneId);
    const projectId = directorProjectIdRef.current; const epoch = visualSessionEpoch.current;
    const mediaPath = scene.imageStorage.objectPath;
    const binding: VisualSpatialEvidenceBinding = { projectId, sceneId, sceneIndex, scope: 'applied-image', mediaIdentity: `media:${mediaPath}` };
    const requestSource = visualSpatialEvidenceSourceFromTrustedGeometry(requestGeometry, binding.mediaIdentity);
    const generationKey = `applied:${sceneId}`;
    const owner = captureValidatedMediaOwnerContext();
    if (!visualSpatialRequests.current.tryAcquire(binding)) return;
    const generation = (visualSpatialGenerations.current.get(generationKey) ?? 0) + 1;
    visualSpatialGenerations.current.set(generationKey, generation);
    setVisualSpatialBusy((current) => new Set(current).add(sceneId));
    try {
      const reference = await issueOpaqueSpatialMediaAnalysisReference(scene.imageStorage);
      const response = await analyzeVisualSpatial({ reference: reference.reference, requestId: crypto.randomUUID() });
      const current = scenesRef.current[sceneIndex];
      if (!current || current !== scene || current.sceneId !== sceneId || current.imageStorage?.objectPath !== mediaPath || current.videoStorage
        || visualSpatialGenerations.current.get(generationKey) !== generation || visualSessionEpoch.current !== epoch
        || directorProjectIdRef.current !== projectId || !isCurrentValidatedOwnerContext(owner.ownerId, owner.generation)) return;
      const currentGeometry = trustedSceneImageGeometry(current);
      if (!currentGeometry) return;
      const currentSource = visualSpatialEvidenceSourceFromTrustedGeometry(currentGeometry, binding.mediaIdentity);
      if (!visualSpatialEvidenceSourceEqual(requestSource, currentSource)) return;
      requestVisualSpatialEvidenceChange((records) => ({ ...records, [sceneId]: createVisualSpatialEvidenceRecord(binding, response, requestSource) }));
    } catch {
      const current = scenesRef.current[sceneIndex];
      if (current === scene && current.sceneId === sceneId && current.imageStorage?.objectPath === mediaPath && !current.videoStorage
        && visualSpatialGenerations.current.get(generationKey) === generation && visualSessionEpoch.current === epoch
        && directorProjectIdRef.current === projectId && isCurrentValidatedOwnerContext(owner.ownerId, owner.generation)) {
        const currentGeometry = trustedSceneImageGeometry(current);
        const currentSource = currentGeometry
          ? visualSpatialEvidenceSourceFromTrustedGeometry(currentGeometry, binding.mediaIdentity)
          : undefined;
        if (currentSource && visualSpatialEvidenceSourceEqual(requestSource, currentSource)) {
          requestVisualSpatialEvidenceChange((records) => ({ ...records, [sceneId]: createVisualSpatialEvidenceRecord(binding, unavailableVisualSpatialAnalysis('provider-unavailable'), requestSource) }));
        }
      }
    } finally {
      visualSpatialRequests.current.release(binding);
      if (visualSpatialGenerations.current.get(generationKey) === generation && visualSessionEpoch.current === epoch) setVisualSpatialBusy((current) => { const next = new Set(current); next.delete(sceneId); return next; });
    }
  }

  async function handleAnalyzeDiscoveryCandidateSpatial(sceneIndex: number, candidateId: string) {
    const scene = scenesRef.current[sceneIndex]; const sceneId = scene?.sceneId;
    const shortlist = sceneId ? visualShortlistsRef.current[sceneId] : undefined;
    const candidate = shortlist?.candidates.find((item) => item.candidateId === candidateId);
    if (!scene || !sceneId || !candidate || candidate.provider !== 'pexels' || candidate.mediaType !== 'image'
      || !/^\d+$/u.test(candidate.providerMediaIdentity) || selectedVisualCandidatesRef.current[sceneId] !== candidateId) return;
    const projectId = directorProjectIdRef.current; const epoch = visualSessionEpoch.current;
    const binding: VisualSpatialEvidenceBinding = { projectId, sceneId, sceneIndex, scope: 'discovery-candidate-image', mediaIdentity: `pexels:image:${candidate.providerMediaIdentity}` };
    const generationKey = `candidate:${sceneId}`;
    const owner = captureValidatedMediaOwnerContext();
    if (!candidateSpatialRequests.current.tryAcquire(binding)) return;
    const generation = (visualSpatialGenerations.current.get(generationKey) ?? 0) + 1;
    const discoveryGeneration = visualDiscoveryGenerations.current.get(sceneId) ?? 0;
    visualSpatialGenerations.current.set(generationKey, generation);
    setCandidateSpatialBusy((current) => new Set(current).add(sceneId));
    try {
      const response = await analyzeDiscoveryCandidateSpatial({ candidate: { provider: 'pexels', providerAssetId: Number(candidate.providerMediaIdentity), mediaType: 'image' }, requestId: crypto.randomUUID() });
      const currentScene = scenesRef.current[sceneIndex]; const currentShortlist = visualShortlistsRef.current[sceneId];
      if (currentScene !== scene || currentScene.sceneId !== sceneId || selectedVisualCandidatesRef.current[sceneId] !== candidateId
        || !currentShortlist?.candidates.some((item) => item.candidateId === candidateId && item.providerMediaIdentity === candidate.providerMediaIdentity && item.mediaType === 'image')
        || visualDiscoveryGenerations.current.get(sceneId) !== discoveryGeneration || visualSpatialGenerations.current.get(generationKey) !== generation
        || visualSessionEpoch.current !== epoch || directorProjectIdRef.current !== projectId || !isCurrentValidatedOwnerContext(owner.ownerId, owner.generation)) return;
      setCandidateSpatialEvidence((records) => ({ ...records, [sceneId]: createVisualSpatialEvidenceRecord(binding, response) }));
    } catch {
      const currentScene = scenesRef.current[sceneIndex];
      if (currentScene === scene && currentScene.sceneId === sceneId && selectedVisualCandidatesRef.current[sceneId] === candidateId
        && visualDiscoveryGenerations.current.get(sceneId) === discoveryGeneration && visualSpatialGenerations.current.get(generationKey) === generation
        && visualSessionEpoch.current === epoch && directorProjectIdRef.current === projectId && isCurrentValidatedOwnerContext(owner.ownerId, owner.generation)) {
        setCandidateSpatialEvidence((records) => ({ ...records, [sceneId]: createVisualSpatialEvidenceRecord(binding, unavailableVisualSpatialAnalysis('provider-unavailable')) }));
      }
    } finally {
      candidateSpatialRequests.current.release(binding);
      if (visualSpatialGenerations.current.get(generationKey) === generation && visualSessionEpoch.current === epoch) setCandidateSpatialBusy((current) => { const next = new Set(current); next.delete(sceneId); return next; });
    }
  }

  async function handleGenerateSceneImage(sceneIndex: number) {
    const scene = scenes[sceneIndex];
    if (!scene) return;
    const sceneId = scene.sceneId;
    if (!hasOpenAI) { setError('OpenAI image generation is not configured. Contact an administrator.'); return; }
    const selectionGeneration = (sceneImportGenerations.current.get(sceneId) ?? 0) + 1;
    sceneImportGenerations.current.set(sceneId, selectionGeneration);
    setGeneratingSceneImage(sceneId);
    const ownerContext = captureValidatedMediaOwnerContext();
    const projectId = directorProjectIdRef.current;
    const sessionEpoch = visualSessionEpoch.current;
    try {
      const charDesc = characterName.trim()
        ? `${characterName.trim()}, ${characterAppearance.trim()}`
        : undefined;
      const mode = scene.visualMode || visualMode;
      const result = await generateAIImage({
        prompt: scene.imagePrompt || scene.visual || scene.text,
        mode: (mode === 'auto' || mode === 'real_footage' || mode === 'mixed') ? 'ai_realistic' : mode,
        characterDesc: charDesc,
        sceneContext: scene.text,
      });
      assertCurrentMediaOwnerContext(ownerContext);
      setScenes((current) => {
        if (!isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
          || sceneImportGenerations.current.get(sceneId) !== selectionGeneration
          || !isCurrentSceneOperation(projectId, sessionEpoch, current, sceneIndex, scene)) return current;
        const next = [...current];
        next[sceneIndex] = {
          ...scene,
          imageUrl: result.imageUrl,
          imageStorage: result.media,
          imageDisplayGeometry: result.imageDisplayGeometry,
          imageFraming: undefined,
          imageFramingBinding: undefined,
          videoUrl: undefined,
          videoStorage: undefined,
          imageProvenance: undefined,
          videoProvenance: undefined,
          imagePrompt: result.revisedPrompt || scene.imagePrompt,
        };
        return next;
      });
    } catch (generationError) {
      if (sceneImportGenerations.current.get(sceneId) === selectionGeneration
        && isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
        && directorProjectIdRef.current === projectId && visualSessionEpoch.current === sessionEpoch) {
        setError(providerActionError('this scene image', generationError));
      }
    } finally {
      if (sceneImportGenerations.current.get(sceneId) === selectionGeneration
        && isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)) {
        setGeneratingSceneImage((current) => current === sceneId ? null : current);
      }
    }
  }

  function sceneImportError(error: unknown): string {
    if (!isManualSceneImageImportError(error)) return t('studio.imageImportUploadFailed');
    switch (error.code) {
      case 'selection': return t('studio.imageImportSelectionInvalid');
      case 'mime': return t('studio.imageImportSupportedTypes');
      case 'empty': return t('studio.imageImportEmpty');
      case 'too-large': return t('studio.imageImportTooLarge');
      case 'signature': return t('studio.imageImportInvalidImage');
    }
  }

  async function handleImportSceneImage(sceneIndex: number, files: readonly File[]) {
    const targetScene = scenes[sceneIndex];
    if (!targetScene) return;
    const sceneId = targetScene.sceneId;
    const selectionGeneration = (sceneImportGenerations.current.get(sceneId) ?? 0) + 1;
    sceneImportGenerations.current.set(sceneId, selectionGeneration);
    const ownerContext = captureValidatedMediaOwnerContext();
    const projectId = directorProjectIdRef.current;
    const sessionEpoch = visualSessionEpoch.current;
    setImportingSceneImages((current) => new Set(current).add(sceneId));
    setImportingSceneVideos((current) => { const next = new Set(current); next.delete(sceneId); return next; });
    setError('');
    try {
      const file = requireOneManualSceneImage(files);
      await validateManualSceneImage(file);
      assertCurrentMediaOwnerContext(ownerContext);
      const upload = await uploadMedia(file, 'generated-images');
      assertCurrentMediaOwnerContext(ownerContext);
      if (sceneImportGenerations.current.get(sceneId) !== selectionGeneration) return;
      setScenes((current) => {
        if (
          !isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
          || sceneImportGenerations.current.get(sceneId) !== selectionGeneration
          || !isCurrentSceneOperation(projectId, sessionEpoch, current, sceneIndex, targetScene)
        ) return current;
        const updated = [...current];
        updated[sceneIndex] = {
          ...targetScene,
          imageUrl: upload.imageUrl,
          imageStorage: upload.media,
          imageDisplayGeometry: upload.imageDisplayGeometry,
          imageFraming: undefined,
          imageFramingBinding: undefined,
          videoUrl: undefined,
          videoStorage: undefined,
          imageProvenance: undefined,
          videoProvenance: undefined,
        };
        return updated;
      });
    } catch (importError) {
      if (
        sceneImportGenerations.current.get(sceneId) === selectionGeneration
        && isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
        && directorProjectIdRef.current === projectId && visualSessionEpoch.current === sessionEpoch
      ) setError(sceneImportError(importError));
    } finally {
      if (
        sceneImportGenerations.current.get(sceneId) === selectionGeneration
        && isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
      ) setImportingSceneImages((current) => { const next = new Set(current); next.delete(sceneId); return next; });
    }
  }

  function sceneVideoImportError(error: unknown): string {
    if (!isManualSceneVideoImportError(error)) return t('studio.videoImportProbeFailed');
    switch (error.code) {
      case 'selection': return t('studio.videoImportSelectionInvalid');
      case 'mime': return t('studio.videoImportMp4Required');
      case 'empty': return t('studio.videoImportEmpty');
      case 'too-large': return t('studio.videoImportTooLarge');
      case 'signature': return t('studio.videoImportInvalidMp4');
      default: return t('studio.videoImportProbeFailed');
    }
  }

  async function handleImportSceneVideo(sceneIndex: number, files: readonly File[]) {
    const targetScene = scenes[sceneIndex];
    if (!targetScene) return;
    const sceneId = targetScene.sceneId;
    const selectionGeneration = (sceneImportGenerations.current.get(sceneId) ?? 0) + 1;
    sceneImportGenerations.current.set(sceneId, selectionGeneration);
    const ownerContext = captureValidatedMediaOwnerContext();
    const projectId = directorProjectIdRef.current;
    const sessionEpoch = visualSessionEpoch.current;
    setImportingSceneVideos((current) => new Set(current).add(sceneId));
    setImportingSceneImages((current) => { const next = new Set(current); next.delete(sceneId); return next; });
    setError('');
    try {
      const file = requireOneManualSceneVideo(files);
      await validateManualSceneVideo(file);
      assertCurrentMediaOwnerContext(ownerContext);
      const bridge = window.electronAPI?.ffmpeg;
      if (!bridge?.probeManualMp4) throw new ManualSceneVideoImportError('probe');
      await bridge.probeManualMp4(await file.arrayBuffer());
      assertCurrentMediaOwnerContext(ownerContext);
      if (sceneImportGenerations.current.get(sceneId) !== selectionGeneration) return;
      const upload = await uploadMedia(file, 'videos');
      assertCurrentMediaOwnerContext(ownerContext);
      if (sceneImportGenerations.current.get(sceneId) !== selectionGeneration) return;
      setScenes((current) => {
        if (!isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
          || sceneImportGenerations.current.get(sceneId) !== selectionGeneration
          || !isCurrentSceneOperation(projectId, sessionEpoch, current, sceneIndex, targetScene)) return current;
        const updated = [...current];
        updated[sceneIndex] = {
          ...targetScene,
          videoUrl: upload.videoUrl,
          videoStorage: upload.media,
          imageUrl: undefined,
          imageStorage: undefined,
          imageDisplayGeometry: undefined,
          imageFraming: undefined,
          imageFramingBinding: undefined,
          imageProvenance: undefined,
          videoProvenance: undefined,
        };
        return updated;
      });
    } catch (importError) {
      if (sceneImportGenerations.current.get(sceneId) === selectionGeneration && isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
        && directorProjectIdRef.current === projectId && visualSessionEpoch.current === sessionEpoch) {
        setError(sceneVideoImportError(importError));
      }
    } finally {
      if (sceneImportGenerations.current.get(sceneId) === selectionGeneration && isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)) {
        setImportingSceneVideos((current) => { const next = new Set(current); next.delete(sceneId); return next; });
      }
    }
  }

  async function handleGenerateVoiceover() {
    setGeneratingVoice(true);
    setError('');
    try {
      if (voiceoverMode === 'browser') {
        await generateBrowserTTS(script);
        invalidateNarration();
        setStep('render');
      } else if (voiceoverMode === 'elevenlabs') {
        const ownerContext = captureValidatedMediaOwnerContext();
        const generated = await generateVoiceover(script, selectedVoice);
        assertCurrentMediaOwnerContext(ownerContext);
        setNarration({ storage: generated.media, durationMs: generated.durationMs, scriptRevision: narrationRevision(script), voiceId: selectedVoice, ...(generated.alignment ? { alignment: generated.alignment } : {}) });
        setAudioUrl(generated.playbackUrl ?? await createPrivateMediaSignedUrl(generated.media, ownerContext));
        setAudioBlob(null);
        setStep('render');
      } else {
        setAudioBlob(null);
        setAudioUrl('');
        setStep('render');
      }
    } catch (e) {
      setError(voiceoverMode === 'elevenlabs'
        ? providerActionError('voiceover', e)
        : 'Unable to generate a browser voiceover. Try again.');
    } finally {
      setGeneratingVoice(false);
    }
  }

  async function generateBrowserTTS(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                          voices.find(v => v.lang.startsWith('en')) ||
                          voices[0];
        if (preferred) utterance.voice = preferred;
        window.speechSynthesis.cancel();
        utterance.onend = () => resolve();
        utterance.onerror = () => reject(new Error('Browser TTS failed'));
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        reject(err);
      }
    });
  }

  async function handleFetchImages() {
    if (!hasPexels) { setError('Pexels image search is not configured. Contact an administrator.'); return; }
    setFetchingImages(true);
    setError('');
    const ownerContext = captureValidatedMediaOwnerContext();
    const requestGeneration = ++pexelsRequestGenerations.current.images;
    const projectId = directorProjectIdRef.current;
    const sessionEpoch = visualSessionEpoch.current;
    try {
      let succeeded = 0;
      let failed = 0;
      let unresolved = 0;
      let firstFailure: unknown;
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const sceneId = scene.sceneId;
        const selectionGeneration = (sceneImportGenerations.current.get(sceneId) ?? 0) + 1;
        sceneImportGenerations.current.set(sceneId, selectionGeneration);
        const query = scene.visual || scene.keywords?.[0] || topic;
        try {
          const images = await searchImages(query, 1);
          assertCurrentMediaOwnerContext(ownerContext);
          if (pexelsRequestGenerations.current.images !== requestGeneration) return;
          if (sceneImportGenerations.current.get(sceneId) !== selectionGeneration
            || !isCurrentSceneOperation(projectId, sessionEpoch, scenesRef.current, i, scene)) continue;
          if (images.length > 0) {
            setIngestingPexelsImages((current) => new Set(current).add(sceneId));
            const ingested = await ingestPexelsImage(images[0].id, query);
            assertCurrentMediaOwnerContext(ownerContext);
            if (pexelsRequestGenerations.current.images !== requestGeneration || sceneImportGenerations.current.get(sceneId) !== selectionGeneration
              || !isCurrentSceneOperation(projectId, sessionEpoch, scenesRef.current, i, scene)) continue;
            let attached = false;
            setScenes((current) => {
              if (!isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
                || sceneImportGenerations.current.get(sceneId) !== selectionGeneration
                || !isCurrentSceneOperation(projectId, sessionEpoch, current, i, scene)) return current;
              const next = [...current];
              next[i] = {
                ...scene,
                imageStorage: ingested.media,
                imageDisplayGeometry: ingested.imageDisplayGeometry,
                imageFraming: undefined,
                imageFramingBinding: undefined,
                imageUrl: ingested.previewUrl,
                imageProvenance: ingested.provenance,
                videoStorage: undefined,
                videoUrl: undefined,
                videoProvenance: undefined,
              };
              attached = true;
              return next;
            });
            if (!attached) continue;
            succeeded += 1;
          } else unresolved += 1;
        } catch (sceneError) { failed += 1; firstFailure ??= sceneError; }
        finally {
          if (isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
            && sceneImportGenerations.current.get(sceneId) === selectionGeneration) {
            setIngestingPexelsImages((current) => { const next = new Set(current); next.delete(sceneId); return next; });
          }
        }
      }
      assertCurrentMediaOwnerContext(ownerContext);
      if (pexelsRequestGenerations.current.images !== requestGeneration) return;
      if (failed || unresolved || succeeded === 0) setError(succeeded ? `${succeeded} scene images were ingested; some scenes could not be updated.` : failed ? providerActionError('Pexels image ingestion', firstFailure) : 'No images could be found. Check provider availability and try again.');
    } catch (e) {
      if (
        pexelsRequestGenerations.current.images === requestGeneration
        && isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
        && directorProjectIdRef.current === projectId && visualSessionEpoch.current === sessionEpoch
      ) setError(providerActionError('images', e));
    } finally {
      if (
        pexelsRequestGenerations.current.images === requestGeneration
        && isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
      ) setFetchingImages(false);
    }
  }

  async function handleFetchBroll() {
    if (!hasPexels) { setError('Pexels video search is not configured. Contact an administrator.'); return; }
    setFetchingVideos(true);
    setError('');
    const ownerContext = captureValidatedMediaOwnerContext();
    const requestGeneration = ++pexelsRequestGenerations.current.broll;
    const projectId = directorProjectIdRef.current;
    const sessionEpoch = visualSessionEpoch.current;
    try {
      let succeeded = 0;
      let failed = 0;
      let unresolved = 0;
      let firstFailure: unknown;
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const sceneId = scene.sceneId;
        const selectionGeneration = (sceneImportGenerations.current.get(sceneId) ?? 0) + 1;
        sceneImportGenerations.current.set(sceneId, selectionGeneration);
        const query = scene.visual || scene.keywords?.[0] || topic;
        try {
          const videos = await searchVideos(query, 1);
          assertCurrentMediaOwnerContext(ownerContext);
          if (pexelsRequestGenerations.current.broll !== requestGeneration) return;
          if (sceneImportGenerations.current.get(sceneId) !== selectionGeneration
            || !isCurrentSceneOperation(projectId, sessionEpoch, scenesRef.current, i, scene)) continue;
          if (videos.length > 0) {
            setIngestingPexelsVideos((current) => new Set(current).add(sceneId));
            const prepared = await prepareDurablePexelsVideo(videos[0].id, query, () => {
              assertCurrentMediaOwnerContext(ownerContext);
              if (pexelsRequestGenerations.current.broll !== requestGeneration || sceneImportGenerations.current.get(sceneId) !== selectionGeneration
                || !isCurrentSceneOperation(projectId, sessionEpoch, scenesRef.current, i, scene)) throw new StaleVisualSelectionError();
            });
            let attached = false;
            setScenes((current) => {
              if (!isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
                || sceneImportGenerations.current.get(sceneId) !== selectionGeneration
                || !isCurrentSceneOperation(projectId, sessionEpoch, current, i, scene)) return current;
              const next = [...current];
              next[i] = { ...scene, videoStorage: prepared.storage, videoUrl: prepared.previewUrl, videoProvenance: prepared.provenance, imageStorage: undefined, imageDisplayGeometry: undefined, imageFraming: undefined, imageFramingBinding: undefined, imageUrl: undefined, imageProvenance: undefined };
              attached = true;
              return next;
            });
            if (attached) succeeded += 1;
          } else unresolved += 1;
        } catch (sceneError) { if (!(sceneError instanceof StaleVisualSelectionError)) { failed += 1; firstFailure ??= sceneError; } }
        finally {
          if (isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
            && sceneImportGenerations.current.get(sceneId) === selectionGeneration) {
            setIngestingPexelsVideos((current) => { const next = new Set(current); next.delete(sceneId); return next; });
          }
        }
      }
      assertCurrentMediaOwnerContext(ownerContext);
      if (pexelsRequestGenerations.current.broll !== requestGeneration) return;
      if (failed || unresolved || succeeded === 0) setError(succeeded ? `${succeeded} scene video clips were privately prepared; some scenes could not be updated.` : failed ? providerActionError('Pexels B-roll ingestion', firstFailure) : 'No compatible Pexels video clips could be prepared. Check provider availability and try again.');
    } catch (e) {
      if (
        pexelsRequestGenerations.current.broll === requestGeneration
        && isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
        && directorProjectIdRef.current === projectId && visualSessionEpoch.current === sessionEpoch
      ) setError(providerActionError('video clips', e));
    } finally {
      if (
        pexelsRequestGenerations.current.broll === requestGeneration
        && isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)
      ) setFetchingVideos(false);
    }
  }

  async function handleLoadMusic(trackId: string) {
    const selectionGeneration = ++musicSelectionGeneration.current;
    musicFetchAbort.current?.abort();
    musicFetchAbort.current = null;
    setError('');
    setMusicId(trackId);
    setMusicStorage(null);
    if (!trackId) {
      setMusicBlob(null);
      setLoadingMusic(false);
      return;
    }
    const track = MUSIC_TRACKS.find(t => t.id === trackId);
    if (!track || !isApprovedCatalogMusicUrl(track.url)) {
      setMusicId('');
      setLoadingMusic(false);
      return;
    }
    setLoadingMusic(true);
    const ownerContext = captureValidatedMediaOwnerContext();
    const controller = new AbortController();
    musicFetchAbort.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch(track.url, { redirect: 'error', signal: controller.signal });
      if (!isValidCatalogMusicResponse(res.url || track.url, res.status, res.headers.get('content-type'), res.headers.get('content-length'))) throw new Error('Selected music is not a supported catalog MP3 track.');
      const blob = await res.blob();
      if (!isValidCatalogMusicBlob(blob)) throw new Error('Selected music is not a supported MP3 track.');
      assertCurrentMediaOwnerContext(ownerContext);
      const upload = await uploadMedia(blob, 'music');
      assertCurrentMediaOwnerContext(ownerContext);
      if (selectionGeneration !== musicSelectionGeneration.current) return;
      setMusicBlob(blob);
      setMusicStorage(upload.media);
    } catch {
      if (selectionGeneration !== musicSelectionGeneration.current || !isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)) return;
      setMusicBlob(null);
      setMusicId('');
      setMusicStorage(null);
      setError(t('studio.musicLoadFailed'));
    } finally {
      window.clearTimeout(timeout);
      if (musicFetchAbort.current === controller) musicFetchAbort.current = null;
      if (selectionGeneration === musicSelectionGeneration.current && isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)) setLoadingMusic(false);
    }
  }

  async function handleRender() {
    if (!channel) {
      setError('Select an available channel before rendering this restored draft.');
      setStep('topic');
      return;
    }
    if (!hasExplicitFinalAudioIntent()) return;
    setRendering(true);
    setRenderProgress(0);
    setError('');
    const ownerContext = captureValidatedMediaOwnerContext();
    try {
      const renderScenes = scenes.some((scene) => scene.imageStorage || scene.videoStorage)
        ? await resolvePrivateSceneMedia(toDurableScenes(scenes))
        : scenes;
      assertCurrentMediaOwnerContext(ownerContext);
      const { videoBlob, duration: renderedDuration } = await renderVideo(renderScenes, audioBlob, {
        accentColor: channel?.avatar_color ?? '#10b981',
        captionStyle,
        transitionStyle,
        motionStyle,
        musicBlob,
        musicVolume,
        watermarkText: watermarkText || undefined,
        watermarkPosition,
        showSubtitles,
        captionTextColor: captionTextColor || undefined,
        captionHighlightColor: captionHighlightColor || undefined,
        beatSync,
        onProgress: setRenderProgress,
      });

      assertCurrentMediaOwnerContext(ownerContext);
      const upload = await uploadMedia(videoBlob, 'videos');
      assertCurrentMediaOwnerContext(ownerContext);
      if (!upload.videoUrl) throw new Error('Rendered video could not be opened after upload.');
      setVideoUrl(upload.videoUrl);

      const { data, error: saveError } = await supabase.from('videos').insert({
        title,
        ...createVideoChannelAttribution(channel),
        // This legacy preview renderer has no durable audio binding. The verified
        // canonical export below signs and mixes narration through MediaProject.
        narration_mode: 'silent',
        description: script,
        script,
        hook,
        cta,
        scenes: toDurableScenes(scenes),
        duration_seconds: Math.round(renderedDuration),
        status: 'rendered',
        video_url: null,
        video_storage_bucket: upload.media.bucket,
        video_storage_path: upload.media.objectPath,
        voice_id: selectedVoice || null,
        tags: [],
        visual_mode: visualMode,
        visual_style_id: selectedStyleId || null,
        character_profile_id: characterProfileId || null,
        watermark_text: watermarkText || null,
        watermark_position: watermarkPosition,
        show_subtitles: showSubtitles,
        caption_text_color: captionTextColor || null,
        caption_highlight_color: captionHighlightColor || null,
        beat_sync: beatSync,
      }).select().single();
      assertCurrentMediaOwnerContext(ownerContext);
      if (saveError || !data) throw new Error('Rendered video metadata could not be saved.');
      setStudioVideoId(data?.id ?? null);
      setStep('publish');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to render video');
    } finally {
      setRendering(false);
    }
  }

  function publishingHandoffFor(job: ExportJob) {
    if (!channel || !isVerifiedExportJob(job)) throw new Error('Verified export is unavailable for publishing.');
    return studioVideoId
      ? { kind: 'video-needs-verification' as const, sourceVideoId: studioVideoId, title: title || topic || 'Studio video', exportJobId: job.id, target: toSafePublishingTarget(channel) }
      : { kind: 'verified-export' as const, exportJobId: job.id, sourceVideoId: null, target: toSafePublishingTarget(channel) };
  }

  async function withCurrentVerifiedExport<T>(action: 'open' | 'reveal' | 'save-as' | 'publish', operation: (job: ExportJob & { artifact: NonNullable<ExportJob['artifact']> }, assertCurrent: () => void) => Promise<T>): Promise<T> {
    const job = currentCompletedExport;
    if (!job || !isVerifiedExportJob(job)) throw new Error(t('studio.exportUnavailable'));
    const bridge = window.electronAPI?.ffmpeg;
    if (!bridge?.revalidateArtifact) throw new Error(t('studio.exportUnavailable'));
    const ownerContext = captureValidatedMediaOwnerContext();
    const revision = canonicalStudioRevision;
    const assertCurrent = () => {
      try {
        assertCurrentMediaOwnerContext(ownerContext);
      } catch {
        throw new StalePostRenderActionError();
      }
      if (canonicalStudioRevisionRef.current !== revision) throw new StalePostRenderActionError();
    };
    setPostRenderAction(action);
    setPostRenderNotice(null);
    try {
      const result = await bridge.revalidateArtifact({ artifactPath: job.artifact.path, sizeBytes: job.artifact.sizeBytes, contentDigest: job.artifact.contentDigest! });
      assertCurrent();
      if (!result.ok) throw new Error(t('studio.exportUnavailable'));
      const value = await operation(job, assertCurrent);
      assertCurrent();
      return value;
    } finally {
      setPostRenderAction(null);
    }
  }

  async function handleOpenCompletedExport() {
    try {
      await withCurrentVerifiedExport('open', async (job) => {
        const result = await window.electronAPI?.ffmpeg.openVerifiedExport?.({ artifactPath: job.artifact.path, sizeBytes: job.artifact.sizeBytes, contentDigest: job.artifact.contentDigest! });
        if (!result?.ok) throw new Error(t('studio.openExportFailed'));
      });
    } catch (actionError) { if (!(actionError instanceof StalePostRenderActionError)) setPostRenderNotice(actionError instanceof Error ? actionError.message : t('studio.openExportFailed')); }
  }

  async function handleRevealCompletedExport() {
    try {
      await withCurrentVerifiedExport('reveal', async (job) => {
        const result = await window.electronAPI?.ffmpeg.revealVerifiedExport?.({ artifactPath: job.artifact.path, sizeBytes: job.artifact.sizeBytes, contentDigest: job.artifact.contentDigest! });
        if (!result?.ok) throw new Error(t('studio.revealExportFailed'));
      });
    } catch (actionError) { if (!(actionError instanceof StalePostRenderActionError)) setPostRenderNotice(actionError instanceof Error ? actionError.message : t('studio.revealExportFailed')); }
  }

  async function handleSaveAsCompletedExport() {
    try {
      const destination = await withCurrentVerifiedExport('save-as', async (job, assertCurrent) => {
        const bridge = window.electronAPI?.ffmpeg;
        const selectedDestination = await bridge?.pickOutputPath?.({ defaultPath: exportFilename(job.artifact.path), purpose: 'save-copy' });
        assertCurrent();
        if (!selectedDestination) return null;
        if (!bridge?.saveVerifiedExportAs) throw new Error(t('studio.saveAsFailed'));
        const copied = await bridge.saveVerifiedExportAs({ artifactPath: job.artifact.path, sizeBytes: job.artifact.sizeBytes, contentDigest: job.artifact.contentDigest! }, selectedDestination);
        assertCurrent();
        if (!copied.ok || !copied.sizeBytes) throw new Error(t('studio.saveAsFailed'));
        return selectedDestination;
      });
      if (destination) setPostRenderNotice(t('studio.saveAsComplete', { filename: exportFilename(destination) }));
    } catch (actionError) { if (!(actionError instanceof StalePostRenderActionError)) setPostRenderNotice(actionError instanceof Error ? actionError.message : t('studio.saveAsFailed')); }
  }

  async function handlePublishCompletedExport() {
    try {
      await withCurrentVerifiedExport('publish', async (job) => {
        usePublishingStore.getState().setHandoff(publishingHandoffFor(job));
        navigate('publishing-studio');
      });
    } catch (actionError) { if (!(actionError instanceof StalePostRenderActionError)) setPostRenderNotice(actionError instanceof Error ? actionError.message : t('studio.exportUnavailable')); }
  }

  async function refreshTrustedImageGeometryForVerifiedExport(
    ownerContext: ValidatedMediaOwnerContext,
  ): Promise<Scene[]> {
    const requested = scenesRef.current;
    const projectId = directorProjectIdRef.current;
    const epoch = visualSessionEpoch.current;
    const result = await hydrateTrustedImageGeometry(requested, resolveOwnedImageDisplayGeometry, { force: true });
    assertCurrentMediaOwnerContext(ownerContext);
    if (directorProjectIdRef.current !== projectId || visualSessionEpoch.current !== epoch) {
      throw new Error('The project changed while image geometry was being verified. Try again.');
    }
    const merged = commitImageGeometryHydration({
      expectedProjectId: projectId, currentProjectId: directorProjectIdRef.current,
      expectedEpoch: epoch, currentEpoch: visualSessionEpoch.current,
      current: scenesRef.current, requested, hydrated: result.scenes,
    });
    const unresolved = merged.filter((scene) => scene.imageStorage && !scene.videoStorage).some((scene) => {
      try {
        normalizeTrustedImageDisplayGeometry(scene.imageDisplayGeometry, `media:${scene.imageStorage!.objectPath}`);
        return false;
      } catch { return true; }
    });
    scenesRef.current = merged;
    setScenes(merged);
    if (unresolved || result.failedMedia.length > 0) throw new Error('Trusted image geometry is unresolved. Retry after private media becomes available.');
    return merged;
  }

  async function prepareModernPublish() {
    if (!channel) {
      setError('Select an available channel before preparing this video for publishing.');
      setStep('topic');
      return;
    }
    if (!hasExplicitFinalAudioIntent()) return;
    setPreparingPublish(true);
    setError('');
    const ownerContext = captureValidatedMediaOwnerContext();
    try {
      assertCurrentMediaOwnerContext(ownerContext);
      const executionScenes = await refreshTrustedImageGeometryForVerifiedExport(ownerContext);
      const recipe = currentProductionRecipe(ownerContext, showSubtitles, executionScenes);
      const buildInput = compileStudioProductionRecipeV1(recipe);
      const mediaEngine = applicationContainer.resolve(dependencyTokens.mediaEngine);
      const build = await mediaEngine.buildProject(buildInput);
      // Development-only diagnostic: establishes whether provider alignment
      // survived through the canonical timeline without exposing any script or
      // private-media data.
      const subtitleTimeline = build.subtitleTimeline ?? build.project.subtitles;
      const audioTimeline = build.audioTimeline ?? build.project.audio;
      const alignmentAssessment = assessNarrationAlignment(resolveSubtitleTimingScenes(build.project.scenes), build.project.settings, narration?.alignment, narration?.durationMs);
      if (import.meta.env.DEV) {
        console.info('[subtitle-timing]', {
          source: subtitleTimeline?.source ?? 'unavailable',
          alignmentEntryCount: narration?.alignment?.characters.length ?? 0,
          firstAlignedWordStartMs: subtitleTimeline?.words[0]?.startMs ?? null,
          firstCueStartMs: subtitleTimeline?.cues[0]?.startMs ?? null,
          firstSceneStartMs: build.project.scenes[0]?.startMs ?? null,
          canonicalNarrationStartMs: audioTimeline?.voice[0]?.startMs ?? null,
          alignmentFallbackReason: subtitleTimeline?.source === 'word-timestamps' ? null : alignmentAssessment.reason,
          alignmentSceneWindow: subtitleTimeline?.source === 'word-timestamps' ? null : alignmentAssessment.sceneWindow ?? null,
        });
        console.info(`[subtitle-timing-result] source=${subtitleTimeline?.source ?? 'unavailable'} fallback=${subtitleTimeline?.source === 'word-timestamps' ? 'none' : alignmentAssessment.reason} window=${alignmentAssessment.sceneWindow?.detail ?? 'none'}`);
      }
      if (!build.renderReady || build.validation.renderReady !== true) {
        throw new Error(canonicalMediaValidationError(build));
      }
      assertCurrentMediaOwnerContext(ownerContext);
      useMediaStore.getState().setBuildResult(build.project, build.manifest, build.renderReady, build.assetResolution, build.validation);
      await loadExportCapabilities();
      assertCurrentMediaOwnerContext(ownerContext);
      const plan = await planActiveExport('youtube-shorts');
      assertCurrentMediaOwnerContext(ownerContext);
      if (plan.blockingIssues.length > 0) throw new Error(plan.blockingIssues.join(' '));
      const outputPath = await window.electronAPI?.ffmpeg.pickOutputPath?.({ defaultPath: `studio-${directorProjectId}.mp4` });
      assertCurrentMediaOwnerContext(ownerContext);
      if (!outputPath) return;
      const exportJob = await enqueueActiveExport(plan, outputPath);
      assertCurrentMediaOwnerContext(ownerContext);
      const completed = await waitForActiveExport(exportJob.id);
      assertCurrentMediaOwnerContext(ownerContext);
      setCompletedExport({ job: completed, revision: computeCanonicalStudioRevision(executionScenes) });
      setPostRenderNotice(null);
    } catch (publishError) {
      if (isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)) {
        setError(publishError instanceof Error ? publishError.message : 'Verified export could not be prepared.');
      }
    } finally {
      if (isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)) setPreparingPublish(false);
    }
  }

  function hasExplicitFinalAudioIntent(): boolean {
    if (voiceoverMode === 'browser' && browserTtsFinalIntent !== 'without-narration') {
      setError(t('studio.browserTTSRenderBlocked'));
      setStep('voice');
      return false;
    }
    if (voiceoverMode === 'elevenlabs' && !hasCanonicalNarration) {
      setError(t('studio.elevenLabsNarrationRenderBlocked'));
      setStep('voice');
      return false;
    }
    return true;
  }

  const canProceed = step === 'topic' ? topic.trim().length > 0 && channelId : true;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('studio.title')}</h1>
          <p className="text-sm text-slate-500">{t('studio.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
            {draftStatus === 'saving' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            <span>
              {draftStatus === 'saving' ? 'Taslak kaydediliyor…' :
                draftStatus === 'saved' ? `Taslak kaydedildi${draftSavedAt ? ` · ${new Date(draftSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}` :
                'Henüz taslak yok'}
            </span>
          </div>
          {(topic || title || script || scenes.length > 0) && (
            <button
              type="button"
              onClick={handleClearDraft}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              title="Taslağı temizle"
            >
              <RotateCcw size={14} /> Sıfırla
            </button>
          )}
        </div>
      </div>

      <AIPipelineMonitor />

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Üretim ilerlemesi</p>
            <p className="text-xs text-slate-500">{currentWorkflowHint}</p>
          </div>
          <span className="text-sm font-semibold text-slate-700">%{workflow.progress}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${workflow.progress}%` }} />
        </div>
      </Card>

      {/* Step indicator */}
      <div className="flex items-center justify-between">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const workflowItem = workflow.items[i];
          const isDone = workflowItem.status === 'complete';
          const isCurrent = workflowItem.status === 'current';
          const isLocked = workflowItem.status === 'locked';
          return (
            <div key={s.key} className="flex flex-1 items-center">
              <button
                type="button"
                disabled={isLocked}
                onClick={() => setStep(s.key)}
                className={classNames('flex flex-col items-center gap-1.5', isLocked ? 'cursor-not-allowed' : 'cursor-pointer')}
                title={isLocked ? 'Önce önceki adımları tamamla' : `${s.label} adımına git`}
              >
                <div
                  className={classNames(
                    'flex h-10 w-10 items-center justify-center rounded-full transition-colors',
                    isDone ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-slate-900 text-white' : isLocked ? 'bg-slate-100 text-slate-300' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
                  )}
                >
                  {isDone ? <Check size={18} /> : <Icon size={18} />}
                </div>
                <span className={classNames('text-xs font-medium', isCurrent ? 'text-slate-900' : isLocked ? 'text-slate-300' : 'text-slate-500')}>
                  {s.label}
                </span>
              </button>
              {i < steps.length - 1 && (
                <div className={classNames('mx-2 h-0.5 flex-1 rounded', workflow.items[i].complete ? 'bg-emerald-500' : 'bg-slate-100')} />
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {unavailableRestoredChannelId && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>The channel saved with this draft is no longer available. Select a channel explicitly before rendering or publishing; ShortsFlow will not substitute another channel.</span>
        </div>
      )}
      {providerStatusError && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{providerStatusError}</span>
        </div>
      )}

      {/* Step 1: Topic */}
      {step === 'topic' && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">{t('studio.whatAbout')}</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">{t('studio.channel')}</label>
              <select value={channelId} onChange={(e) => { setChannelId(e.target.value); setUnavailableRestoredChannelId(null); setError(''); }}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                {(channels.length !== 1 || !channelId) && <option value="">{t('studio.channel')}…</option>}
                {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">{t('studio.topicLabel')}</label>
              <textarea value={topic} onChange={(e) => setTopic(e.target.value)} rows={3}
                placeholder={t('studio.topicPlaceholder')}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700">{t('studio.tone')}</label>
                <select value={tone} onChange={(e) => setTone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                  <option value="engaging">{t('studio.toneEngaging')}</option>
                  <option value="energetic">{t('studio.toneEnergetic')}</option>
                  <option value="educational">{t('studio.toneEducational')}</option>
                  <option value="dramatic">{t('studio.toneDramatic')}</option>
                  <option value="casual">{t('studio.toneCasual')}</option>
                  <option value="inspirational">{t('studio.toneInspirational')}</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">{t('studio.duration')}: {duration}s</label>
                <input type="range" min="15" max="60" value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="mt-3 w-full accent-slate-900" />
              </div>
            </div>
            <div className="space-y-2">
              <Button onClick={handleGenerateScript} disabled={!canProceed || generating} className="w-full">
                {generating ? <><Loader2 size={16} className="animate-spin" /> {t('studio.generatingScript')}</> : <><Sparkles size={16} /> {t('studio.generateScript')}</>}
              </Button>
              <p className="text-center text-xs text-slate-400">
                {hasOpenAI ? t('studio.aiPowered') : t('studio.templateEngine')}
              </p>
              <Button variant="secondary" onClick={handleManualScript} disabled={!canProceed} className="w-full">
                <Wand2 size={16} /> {t('studio.writeManual')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Step 2: Script */}
      {step === 'script' && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">{t('studio.reviewScript')}</h2>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('studio.titleLabel')}</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-slate-400" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('studio.hook')}</label>
              <input value={hook} onChange={(e) => setHook(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('studio.scriptLabel')}</label>
              <textarea value={script} onChange={(e) => { setScript(e.target.value); invalidateNarration(); }} rows={6}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('studio.cta')}</label>
              <input value={cta} onChange={(e) => setCta(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('studio.scenes')} ({scenes.length})</label>
                <div className="flex items-center gap-3">
                  {hasPexels && (
                    <>
                      <button onClick={handleFetchImages} disabled={fetchingImages}
                        className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50">
                        {fetchingImages ? t('studio.fetchingImages') : t('studio.autoFetchImages')}
                      </button>
                      <button onClick={handleFetchBroll} disabled={fetchingVideos}
                        className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50">
                        {fetchingVideos ? t('studio.fetchingVideos') : t('studio.autoFetchBroll')}
                      </button>
                    </>
                  )}
                  <button onClick={() => setScenes([...scenes, { sceneId: createCanonicalSceneId(), text: '', duration: 5, visual: '', keywords: [] }])}
                    className="text-xs font-medium text-blue-600 hover:underline">{t('studio.addScene')}</button>
                </div>
              </div>
              {scenes.length > 1 && <div data-testid="spatial-continuity-panel" className="mt-3 rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-xs text-slate-700">
                <p className="font-semibold text-sky-900">{t('studio.spatialContinuityTitle')}</p>
                <p className="mt-0.5 text-[11px] text-slate-600">{t('studio.spatialContinuityCoverage', {
                  analyzed: spatialContinuity.coverage.analyzedSceneIds.length,
                  unavailable: spatialContinuity.coverage.unavailableSceneIds.length,
                  unsupported: spatialContinuity.coverage.unsupportedSceneIds.length,
                })}</p>
                <div className="mt-2 space-y-1.5">
                  {spatialContinuity.boundaries.map((boundary) => {
                    const boundaryKey = `${boundary.fromSceneId}:${boundary.toSceneId}`;
                    const recommendation = visibleSpatialContinuityFramingRecommendations.find((candidate) =>
                      `${candidate.boundary.fromSceneId}:${candidate.boundary.toSceneId}` === boundaryKey);
                    const targetScene = recommendation ? scenes[recommendation.target.sceneIndex] : undefined;
                    const targetGeometry = targetScene ? trustedSceneImageGeometry(targetScene) : null;
                    const stale = imageFramingProposalOutcome[boundary.toSceneId] === 'stale';
                    return <div key={boundaryKey} data-testid="spatial-continuity-boundary" className="rounded border border-sky-100 bg-white/80 px-2 py-1.5">
                      <span className="font-medium">{t('studio.spatialContinuityScenes', { from: boundary.fromSceneIndex + 1, to: boundary.toSceneIndex + 1 })}</span>
                      <span className="text-slate-500"> · {boundary.findings.map((finding) => t(`studio.spatialContinuity.${finding}`)).join(' · ')}</span>
                      {recommendation && targetScene?.imageUrl && targetGeometry && <div data-testid="spatial-continuity-framing-recommendation" className="mt-2 border-t border-violet-100 pt-2">
                        <p className="font-medium text-violet-800">{t('studio.spatialContinuityFramingAvailable', { scene: recommendation.target.sceneIndex + 1 })}</p>
                        <div className="mt-2 flex flex-wrap items-start justify-between gap-2">
                          <p className="max-w-xs text-[11px] text-slate-500">{t('studio.spatialContinuityFramingDescription')}</p>
                          <div>
                            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-violet-500">{t('studio.framingSuggested')}</p>
                            <ImageFramingPreview
                              src={targetScene.imageUrl}
                              alt={t('studio.framingSuggested')}
                              displayDimensions={targetGeometry.displayDimensions}
                              framing={recommendation.framingProposal.proposedFraming}
                              focalPoint={recommendation.framingProposal.displayFocalPoint}
                              subjectRegion={recommendation.framingProposal.displaySubjectRegion}
                              className="h-40 w-[90px] rounded-md ring-1 ring-violet-300"
                            />
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button type="button" onClick={() => handleApplySpatialContinuityFraming(recommendation)} className="rounded-md bg-violet-700 px-2 py-1 text-xs font-medium text-white hover:bg-violet-800">{t('studio.framingSuggestionApply')}</button>
                          <button type="button" onClick={() => handleAdjustSpatialContinuityFraming(recommendation)} className="rounded-md border border-violet-300 px-2 py-1 text-xs text-violet-700 hover:bg-violet-50">{t('studio.framingSuggestionAdjust')}</button>
                          <button type="button" onClick={() => setDismissedContinuityFramingRecommendations((current) => ({ ...current, [boundaryKey]: recommendation.freshnessFingerprint }))} className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-50">{t('studio.framingSuggestionDismiss')}</button>
                        </div>
                      </div>}
                      {stale && !recommendation && <p role="status" className="mt-1 text-xs text-amber-700">{t('studio.framingSuggestionStale')}</p>}
                    </div>;
                  })}
                </div>
                <div data-testid="visual-rhythm-panel" className="mt-3 border-t border-sky-200 pt-3">
                  <p className="font-semibold text-sky-900">{t('studio.visualRhythmTitle')}</p>
                  <p className="mt-0.5 text-[11px] text-slate-600">{t('studio.visualRhythmCoverage', {
                    structural: visualRhythm.coverage.structuralSceneIds.length,
                    analyzed: visualRhythm.coverage.spatialAnalyzedSceneIds.length,
                    unavailable: visualRhythm.coverage.spatialUnavailableSceneIds.length,
                    unsupported: visualRhythm.coverage.spatialUnsupportedSceneIds.length,
                  })}</p>
                  {(visualRhythm.coverage.spatialUnavailableSceneIds.length > 0 || visualRhythm.coverage.spatialUnsupportedSceneIds.length > 0) && <p className="mt-1 text-[11px] text-slate-500">{t('studio.visualRhythmSpatialGap')}</p>}
                  {visualRhythm.runs.length > 0 && <div className="mt-2 space-y-1">
                    {visualRhythm.runs.map((run) => <p key={run.key} data-testid="visual-rhythm-run" className="rounded border border-sky-100 bg-white/80 px-2 py-1">
                      {t(`studio.visualRhythm.${run.kind}`, { scenes: run.sceneIds.length, boundaries: run.boundaryKeys.length })}
                    </p>)}
                  </div>}
                  {visualRhythm.runs.length === 0 && <p className="mt-1 text-[11px] text-slate-500">{t('studio.visualRhythmNoRuns')}</p>}
                </div>
              </div>}
              <div className="mt-2 space-y-2">
                {scenes.map((s, i) => (
                  <div key={s.sceneId} className="rounded-lg bg-slate-50 p-3">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>{t('studio.scene')} {i + 1}</span>
                      <div className="flex items-center gap-2">
                        <input type="number" min="1" max="60" value={s.duration}
                          onChange={(e) => {
                            const updated = [...scenes];
                            updated[i] = { ...s, duration: Number(e.target.value) };
                            setScenes(updated);
                          }}
                          className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-xs" />
                        <span>s</span>
                        {scenes.length > 1 && (
                          <button onClick={() => setScenes(scenes.filter((_, idx) => idx !== i))}
                            className="text-red-400 hover:text-red-600"><X size={12} /></button>
                        )}
                      </div>
                    </div>
                    <textarea value={s.text} placeholder={t('studio.scenePlaceholder')}
                      onChange={(e) => {
                        const updated = [...scenes];
                        updated[i] = { ...s, text: e.target.value };
                        setScenes(updated);
                      }}
                      rows={2}
                      className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-slate-400" />
                    <input value={s.visual ?? ''} placeholder={t('studio.visualPlaceholder')}
                      onChange={(e) => {
                        const updated = [...scenes];
                        updated[i] = { ...s, visual: e.target.value };
                        setScenes(updated);
                      }}
                      className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-500 outline-none focus:border-slate-400" />
                    {s.videoUrl && (
                      <div className="mt-2 flex items-center gap-2 rounded-lg bg-blue-50 p-2">
                        <Video size={14} className="shrink-0 text-blue-500" />
                        <span className="text-xs text-blue-600">{t('studio.brollAttached')} {s.videoStorage ? t('studio.videoImportAudioNotice') : ''}</span>
                      </div>
                    )}
                    {s.imageUrl && !s.videoUrl && (
                      (() => {
                         const geometry = trustedSceneImageGeometry(s);
                         const adjustment = manualImageFraming?.sceneId === s.sceneId ? manualImageFraming : null;
                         const framingProposal = imageFramingProposals[s.sceneId];
                         const framingProposalStale = imageFramingProposalOutcome[s.sceneId] === 'stale';
                        if (!geometry) return <div className="mt-2 overflow-hidden rounded-lg">
                          <img src={s.imageUrl} alt="Scene visual" className="h-24 w-full object-cover" />
                          {framingProposalStale && <p role="status" className="p-2 text-xs text-amber-700">{t('studio.framingSuggestionStale')}</p>}
                        </div>;
                        return <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
                          <div className="flex items-start gap-3">
                            <div>
                              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">{t('studio.framingApplied')}</p>
                              <ImageFramingPreview
                                src={s.imageUrl}
                                alt="Applied scene framing"
                                displayDimensions={geometry.displayDimensions}
                                framing={s.imageFraming}
                                className="h-40 w-[90px] rounded-md"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              {!adjustment ? <>
                                <p className="text-xs text-slate-600">{s.imageFraming ? `${t('studio.framingAnchor')} ${s.imageFraming.anchor.x.toFixed(2)}, ${s.imageFraming.anchor.y.toFixed(2)}` : t('studio.framingInheritedCenter')}</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button type="button" onClick={() => beginManualImageFraming(s)} className="rounded-md border border-violet-300 px-2 py-1 text-xs text-violet-700 hover:bg-violet-50">{t('studio.framingAdjust')}</button>
                                  {s.imageFraming && <button type="button" onClick={() => resetManualImageFraming(s.sceneId)} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">{t('studio.framingReset')}</button>}
                                </div>
                              </> : <>
                                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-violet-600">{t('studio.framingPending')}</p>
                                <ImageFramingPreview
                                  src={s.imageUrl}
                                  alt="Pending scene framing"
                                  displayDimensions={geometry.displayDimensions}
                                  framing={adjustment.pending}
                                  editable
                                  onChange={(pending) => updateManualImageFraming(s.sceneId, pending)}
                                  className="h-52 w-[117px] rounded-md ring-1 ring-violet-300"
                                />
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button type="button" onClick={applyManualImageFraming} className="rounded-md bg-violet-700 px-2 py-1 text-xs font-medium text-white hover:bg-violet-800">{t('studio.framingApply')}</button>
                                  <button type="button" onClick={() => updateManualImageFraming(s.sceneId, undefined)} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">{t('studio.framingCenter')}</button>
                                  <button type="button" onClick={() => setManualImageFraming(null)} className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-50">{t('studio.framingCancel')}</button>
                                </div>
                              </>}
                            </div>
                           </div>
                           {framingProposal && !adjustment && !continuityFramingTargetSceneIds.has(s.sceneId) && (
                             <div data-testid="image-framing-suggestion" className="mt-3 border-t border-violet-100 pt-3">
                               <div className="flex flex-wrap items-start justify-between gap-2">
                                 <div>
                                   <p className="text-xs font-semibold text-violet-800">{t('studio.framingSuggestionAvailable')}</p>
                                   <p className="mt-0.5 text-[11px] text-slate-500">{t('studio.framingSuggestionConfidence', { confidence: framingProposal.confidenceBand ?? '' })}</p>
                                 </div>
                                 <div>
                                   <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-violet-500">{t('studio.framingSuggested')}</p>
                                   <ImageFramingPreview
                                     src={s.imageUrl}
                                     alt={t('studio.framingSuggested')}
                                     displayDimensions={geometry.displayDimensions}
                                     framing={framingProposal.proposedFraming}
                                     focalPoint={framingProposal.displayFocalPoint}
                                     subjectRegion={framingProposal.displaySubjectRegion}
                                     className="h-40 w-[90px] rounded-md ring-1 ring-violet-300"
                                   />
                                 </div>
                               </div>
                               <div className="mt-2 flex flex-wrap gap-2">
                                 <button type="button" onClick={() => handleApplySpatialImageFraming(framingProposal)} className="rounded-md bg-violet-700 px-2 py-1 text-xs font-medium text-white hover:bg-violet-800">{t('studio.framingSuggestionApply')}</button>
                                 <button type="button" onClick={() => handleAdjustSpatialImageFraming(framingProposal)} className="rounded-md border border-violet-300 px-2 py-1 text-xs text-violet-700 hover:bg-violet-50">{t('studio.framingSuggestionAdjust')}</button>
                                 <button type="button" onClick={() => dismissImageFramingProposal(s.sceneId)} className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-50">{t('studio.framingSuggestionDismiss')}</button>
                               </div>
                             </div>
                           )}
                           {framingProposalStale && !framingProposal && <p role="status" className="mt-2 text-xs text-amber-700">{t('studio.framingSuggestionStale')}</p>}
                         </div>;
                      })()
                    )}
                    {s.imageStorage && !s.videoStorage && (() => {
                      const sceneId = s.sceneId;
                      const brief = sceneId ? visualIntelligence?.briefs.find((item) => item.sceneBinding.sceneId === sceneId) : undefined;
                      const plan = sceneId ? visualIntelligence?.queryPlans.find((item) => item.sceneBinding.sceneId === sceneId) : undefined;
                      const eligible = Boolean(sceneId && brief && plan && isSceneVisualBindingCurrent(brief.sceneBinding, scenes) && isVisualQueryPlanCurrent(plan, brief, scenes));
                      const record = sceneId ? visualSemanticAssessments[sceneId] : undefined;
                      const assessment = record && record.mediaPath === s.imageStorage?.objectPath && record.briefFingerprint === plan?.briefFingerprint ? record.assessment : undefined;
                      const busy = Boolean(sceneId && visualSemanticBusy.has(sceneId));
                      const spatialRecord = sceneId ? visualSpatialEvidence[sceneId] : undefined;
                      const spatialGeometry = trustedSceneImageGeometry(s);
                      const spatialSource = spatialGeometry && s.imageStorage
                        ? visualSpatialEvidenceSourceFromTrustedGeometry(spatialGeometry, `media:${s.imageStorage.objectPath}`)
                        : undefined;
                      const spatial = spatialRecord && spatialSource && isVisualSpatialEvidenceRecordCurrent(spatialRecord, {
                        projectId: directorProjectId, sceneId, sceneIndex: i, scope: 'applied-image', mediaIdentity: `media:${s.imageStorage.objectPath}`,
                      }, spatialSource) ? spatialRecord.response : undefined;
                      const spatialBusy = Boolean(sceneId && visualSpatialBusy.has(sceneId));
                      const score = assessment ? semanticRankingAdjustment(assessment) : 0;
                      const fit = score >= 3 ? 'High' : score <= -3 ? 'Low' : 'Medium';
                      return <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50/60 p-2 text-xs text-slate-700">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">Semantic analysis: {assessment?.status === 'available' ? 'Evaluated' : assessment?.unavailableReason === 'unsupported-media' ? 'Unsupported' : assessment?.status === 'unavailable' ? 'Unavailable' : 'Not analyzed'}</span>
                          <div className="flex flex-wrap gap-1">
                            <button type="button" onClick={() => void handleAnalyzeSceneVisual(i)} disabled={!eligible || busy}
                              className="rounded border border-sky-300 bg-white px-2 py-1 text-[11px] font-medium text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50">
                              {busy ? 'Analyzing…' : 'Analyze semantics'}
                            </button>
                            <button type="button" onClick={() => void handleAnalyzeSceneSpatial(i)} disabled={spatialBusy}
                              className="rounded border border-sky-300 bg-white px-2 py-1 text-[11px] font-medium text-sky-800 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50">
                              {spatialBusy ? 'Analyzing…' : 'Analyze framing'}
                            </button>
                          </div>
                        </div>
                        {!eligible && <p className="mt-1 text-[11px] text-slate-500">Create or refresh the visual plan before analysis.</p>}
                        {assessment?.status === 'available' && <p className="mt-1 text-[11px]">Semantic fit: {fit}. {assessment.signals.filter((signal) => signal.state === 'evaluated').slice(0, 3).map((signal) => `${signal.dimension}: ${signal.interpretation}`).join(' · ')}</p>}
                        {assessment?.status === 'unavailable' && <p className="mt-1 text-[11px] text-slate-500">Analysis unavailable: {assessment.unavailableReason?.replace(/-/gu, ' ') ?? 'provider unavailable'}.</p>}
                        {spatial?.status === 'evaluated' && <p className="mt-1 text-[11px]">Spatial evidence: focal ({spatial.focalPoint.x.toFixed(2)}, {spatial.focalPoint.y.toFixed(2)}) · {spatial.sourceDimensions.width}×{spatial.sourceDimensions.height} encoded raster · {spatial.confidenceBand} confidence{spatial.primarySubjectRegion ? ' · primary subject region available' : ' · no primary subject region'}.</p>}
                        {spatial && spatial.status !== 'evaluated' && <p className="mt-1 text-[11px] text-slate-500">Spatial analysis {spatial.status}: {spatial.reason.replace(/-/gu, ' ')}.</p>}
                      </div>;
                    })()}
                    {hasPexels && (
                      <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/50 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{t('studio.visualPlan')}</p>
                            <p className="mt-0.5 text-xs text-slate-600">{t('studio.visualDiscoveryDesc')}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleFindPremiumVisuals(i)}
                            disabled={!s.text.trim() || visualDiscoveryBusy.size > 0}
                            className="flex items-center gap-1 rounded-lg border border-violet-300 bg-white px-2 py-1 text-xs font-medium text-violet-800 hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {visualDiscoveryBusy.has(s.sceneId) ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            {t('studio.findVisuals')}
                          </button>
                        </div>
                        {(() => {
                          const sceneId = s.sceneId;
                          const rawBrief = sceneId ? visualIntelligence?.briefs.find((item) => item.sceneBinding.sceneId === sceneId) : undefined;
                          const plan = sceneId ? visualIntelligence?.queryPlans.find((item) => item.sceneBinding.sceneId === sceneId) : undefined;
                          const brief = rawBrief && plan && isSceneVisualBindingCurrent(rawBrief.sceneBinding, scenes) && isVisualQueryPlanCurrent(plan, rawBrief, scenes) ? rawBrief : undefined;
                          const rawShortlist = sceneId ? visualShortlists[sceneId] : undefined;
                          const shortlist = brief && rawShortlist && isSceneVisualBindingCurrent(rawShortlist.sceneBinding, scenes) && rawShortlist.briefFingerprint === plan?.briefFingerprint ? rawShortlist : undefined;
                          const selectedId = sceneId ? selectedVisualCandidates[sceneId] : undefined;
                          const selectedCandidate = shortlist?.candidates.find((candidate) => candidate.candidateId === selectedId);
                          const selectedCandidateAssessment = selectedCandidate && plan ? candidateSemanticAssessments[selectedCandidate.candidateId]?.briefFingerprint === plan.briefFingerprint ? candidateSemanticAssessments[selectedCandidate.candidateId]?.assessment : undefined : undefined;
                          const selectedCandidateSpatialRecord = sceneId ? candidateSpatialEvidence[sceneId] : undefined;
                          const selectedCandidateSpatial = selectedCandidate && selectedCandidateSpatialRecord && sceneId
                            && isVisualSpatialEvidenceRecordCurrent(selectedCandidateSpatialRecord, {
                              projectId: directorProjectId, sceneId, sceneIndex: i, scope: 'discovery-candidate-image', mediaIdentity: `pexels:image:${selectedCandidate.providerMediaIdentity}`,
                            }) ? selectedCandidateSpatialRecord.response : undefined;
                          const cinematography = selectedCandidate && sceneId ? assessCinematography({ sceneId, mediaType: selectedCandidate.mediaType, durationMs: Math.round(s.duration * 1_000), width: selectedCandidate.width, height: selectedCandidate.height, quality: selectedCandidate.quality, semantic: selectedCandidateAssessment ?? selectedCandidate.semantic, continuityBoundary: selectedCandidate.continuity.reasons.includes('continuity-group-support'), repeatedMedia: selectedCandidate.continuity.reasons.includes('repeated-provider-media') }) : undefined;
                          const candidateIsCurrentCanonicalMedia = Boolean(selectedCandidate && (
                            selectedCandidate.mediaType === 'image'
                              ? s.imageStorage && !s.videoStorage && s.imageProvenance?.provider === 'pexels' && String(s.imageProvenance.providerMediaId) === selectedCandidate.providerMediaIdentity
                              : s.videoStorage && !s.imageStorage && s.videoProvenance?.provider === 'pexels' && String(s.videoProvenance.providerMediaId) === selectedCandidate.providerMediaIdentity
                          ));
                          const canonicalMediaIdentity = selectedCandidate?.mediaType === 'image' && s.imageStorage
                            ? `image:media:${s.imageStorage.objectPath}`
                            : selectedCandidate?.mediaType === 'video' && s.videoStorage ? `video:media:${s.videoStorage.objectPath}` : undefined;
                          const cinematographyProposal = cinematography && candidateIsCurrentCanonicalMedia && canonicalMediaIdentity && sceneId
                            ? createCinematographyApplicationProposal({ projectId: directorProjectId, scenes, sceneIndex: i, defaults: { motion: motionStyle, transition: canonicalizeStudioRecipeTransition(transitionStyle) }, recommendation: cinematography, recommendationMediaIdentity: canonicalMediaIdentity })
                            : undefined;
                          if (sceneId) {
                            if (cinematographyProposal) cinematographyProposalsRef.current[sceneId] = cinematographyProposal;
                            else delete cinematographyProposalsRef.current[sceneId];
                          }
                          const candidateAnalyzing = Boolean(selectedCandidate && candidateSemanticBusy.has(selectedCandidate.candidateId));
                          const candidateSpatialAnalyzing = Boolean(sceneId && candidateSpatialBusy.has(sceneId));
                          const applying = sceneId ? visualApplyBusy.has(sceneId) : false;
                          return <>
                            {brief && (
                              <div className="mt-2 rounded-md bg-white/80 px-2 py-1.5 text-xs text-slate-700">
                                {[brief.subject, brief.setting, brief.mood, brief.editorialRole].filter(Boolean).join(' · ')}
                              </div>
                            )}
                            {shortlist?.status === 'partial' && <p role="status" className="mt-2 text-xs text-amber-700">{t('studio.visualPartial')}</p>}
                            {shortlist && shortlist.candidates.length === 0 && <p role="status" className="mt-2 text-xs text-slate-600">{t('studio.visualEmpty')}</p>}
                            {shortlist && shortlist.candidates.length > 0 && (
                              <div className="mt-3">
                                <p className="mb-1 text-xs font-medium text-slate-700">{t('studio.visualCandidates')}</p>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                  {shortlist.candidates.map((candidate) => {
                                    const selected = candidate.candidateId === selectedId;
                                    const preview = visualProviderRef.current.resolvePreview(candidate.candidateId);
                                    const label = `${candidate.mediaType === 'video' ? t('studio.broll') : t('studio.generateImage')}${candidate.width && candidate.height ? ` · ${candidate.width}×${candidate.height}` : ''}`;
                                    const reasons = candidate.explanations.slice(0, 2).map((reason) => reason.replace(/-/gu, ' ')).join(' · ');
                                    const qualityReasons = candidate.quality.reasons.slice(0, 2).map((reason) => t(`studio.visualQualityReason.${reason}`)).join(' · ');
                                    const qualityLabel = t(`studio.visualQualityGrade.${candidate.quality.grade}`);
                                    const continuityReasons = candidate.continuity.reasons.slice(0, 2).map((reason) => t(`studio.visualSequenceReason.${reason}`)).join(' · ');
                                    return (
                                      <button
                                        key={candidate.candidateId}
                                        type="button"
                                        aria-pressed={selected}
                                        aria-label={`${label} · ${t('studio.visualQuality')}: ${qualityLabel}${candidate.semantic.status === 'unavailable' ? ` · ${t('studio.visualSemanticUnavailable')}` : ''}${continuityReasons ? ` · ${t('studio.visualSequenceFit')}: ${continuityReasons}` : ''}`}
                                        onClick={() => {
                                          if (!sceneId || applying) return;
                                          visualApplyGenerations.current.set(sceneId, (visualApplyGenerations.current.get(sceneId) ?? 0) + 1);
                                          delete cinematographyProposalsRef.current[sceneId];
                                          setCinematographyOutcome((current) => {
                                            const { [sceneId]: _ignored, ...rest } = current;
                                            return rest;
                                          });
                                          visualSpatialGenerations.current.set(`candidate:${sceneId}`, (visualSpatialGenerations.current.get(`candidate:${sceneId}`) ?? 0) + 1);
                                          setCandidateSpatialEvidence((current) => { const { [sceneId]: _ignored, ...rest } = current; return rest; });
                                          setCandidateSpatialBusy((current) => { const next = new Set(current); next.delete(sceneId); return next; });
                                          setSelectedVisualCandidates((current) => ({ ...current, [sceneId]: candidate.candidateId }));
                                        }}
                                        className={classNames('overflow-hidden rounded-md border text-left transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500', selected ? 'border-violet-600 ring-1 ring-violet-500' : 'border-slate-200 hover:border-violet-300')}
                                      >
                                        {preview ? <img src={preview} alt="" className="h-20 w-full object-cover" /> : <div className="flex h-20 items-center justify-center bg-slate-100 text-slate-400">{candidate.mediaType === 'video' ? <Video size={18} /> : <ImagePlus size={18} />}</div>}
                                        <span className="block truncate px-1.5 pt-1 text-[11px] text-slate-600">{label}</span>
                                        <span className="block truncate px-1.5 pt-0.5 text-[10px] font-medium text-violet-700">{t('studio.visualQuality')}: {qualityLabel}{qualityReasons ? ` · ${qualityReasons}` : ''}</span>
                                        {candidate.semantic.status === 'unavailable' && <span className="block truncate px-1.5 pt-0.5 text-[10px] text-slate-500">{t('studio.visualSemanticUnavailable')}</span>}
                                        {continuityReasons && <span className="block truncate px-1.5 pt-0.5 text-[10px] text-sky-700">{t('studio.visualSequenceFit')}: {continuityReasons}</span>}
                                        <span className="block truncate px-1.5 pb-1 text-[10px] text-slate-500">{t('studio.visualProvider')}{reasons ? ` · ${reasons}` : ''}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <button type="button" onClick={() => void handleFindPremiumVisuals(i)} disabled={visualDiscoveryBusy.size > 0 || applying}
                                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                                    {t('studio.searchAgain')}
                                  </button>
                                  <button type="button" onClick={() => void handleApplyPremiumVisual(i)} disabled={!selectedId || applying}
                                    className="rounded-md bg-violet-700 px-2 py-1 text-xs font-medium text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50">
                                    {applying ? t('studio.applyingVisual') : t('studio.useThisVisual')}
                                  </button>
                                  <button type="button" onClick={() => selectedCandidate && void handleAnalyzeDiscoveryCandidate(i, selectedCandidate.candidateId)} disabled={!selectedCandidate || selectedCandidate.mediaType !== 'image' || candidateAnalyzing}
                                    className="rounded-md border border-sky-300 bg-white px-2 py-1 text-xs text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50">
                                    {candidateAnalyzing ? 'Analyzing…' : 'Analyze selected'}
                                  </button>
                                  <button type="button" onClick={() => selectedCandidate && void handleAnalyzeDiscoveryCandidateSpatial(i, selectedCandidate.candidateId)} disabled={!selectedCandidate || selectedCandidate.mediaType !== 'image' || candidateSpatialAnalyzing}
                                    className="rounded-md border border-sky-300 bg-white px-2 py-1 text-xs text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50">
                                    {candidateSpatialAnalyzing ? 'Analyzing…' : 'Analyze framing'}
                                  </button>
                                </div>
                                {selectedCandidateAssessment && <p className="mt-2 text-xs text-sky-800">Semantic analysis: {selectedCandidateAssessment.status === 'available' ? `Evaluated — fit ${semanticRankingAdjustment(selectedCandidateAssessment) >= 3 ? 'High' : semanticRankingAdjustment(selectedCandidateAssessment) <= -3 ? 'Low' : 'Medium'}` : selectedCandidateAssessment.unavailableReason === 'unsupported-media' ? 'Unsupported' : 'Unavailable'}</p>}
                                {selectedCandidateSpatial?.status === 'evaluated' && <p className="mt-2 text-xs text-sky-800">Spatial evidence: focal ({selectedCandidateSpatial.focalPoint.x.toFixed(2)}, {selectedCandidateSpatial.focalPoint.y.toFixed(2)}) · {selectedCandidateSpatial.confidenceBand} confidence{selectedCandidateSpatial.primarySubjectRegion ? ' · primary subject region available' : ' · no primary subject region'}.</p>}
                                {selectedCandidateSpatial && selectedCandidateSpatial.status !== 'evaluated' && <p className="mt-2 text-xs text-slate-500">Spatial analysis {selectedCandidateSpatial.status}: {selectedCandidateSpatial.reason.replace(/-/gu, ' ')}.</p>}
                                {cinematography && !cinematographyProposal && <p className="mt-2 text-xs text-slate-500">Apply cinematography is available after this visual is the current scene media.</p>}
                                {cinematographyProposal && <div className="mt-2 rounded-md border border-indigo-200 bg-indigo-50/60 p-2 text-xs text-slate-700">
                                  {cinematographyProposal.status === 'ready' && <>
                                    <p className="font-medium">Proposed changes</p>
                                    {cinematographyProposal.changes.map((change) => <p key={change.field} className="mt-0.5">{change.field === 'motion' ? 'Motion' : 'Transition'}: {String(change.before).replace(/_/gu, ' ')} → {String(change.after).replace(/_/gu, ' ')}</p>)}
                                    <button type="button" onClick={() => handleApplyCinematography(cinematographyProposal)} className="mt-2 rounded-md bg-indigo-700 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-800">Apply cinematography</button>
                                  </>}
                                  {cinematographyProposal.status === 'no-op' && <p>Already matches current scene.</p>}
                                  {cinematographyProposal.status === 'unsupported' && <p>This recommendation is advisory only: {cinematographyProposal.reasons.join(', ').replace(/-/gu, ' ')}.</p>}
                                  {sceneId && cinematographyOutcome[sceneId] && <p role="status" className="mt-1 text-indigo-800">{cinematographyOutcome[sceneId]}</p>}
                                </div>}
                                {cinematography && <p className="mt-2 text-xs text-slate-600">Cinematography advisory · {cinematography.strategy.replace(/-/gu, ' ')} · motion {cinematography.motion} · crop {cinematography.crop.replace(/-/gu, ' ')} · transition {cinematography.transition} · {cinematography.reasons.slice(0, 3).join(' · ')}</p>}
                              </div>
                            )}
                          </>;
                        })()}
                      </div>
                    )}
                    {ingestingPexelsImages.has(s.sceneId) && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-blue-600"><Loader2 size={12} className="animate-spin" /> Ingesting Pexels image…</div>
                    )}
                    {ingestingPexelsVideos.has(s.sceneId) && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-blue-600"><Loader2 size={12} className="animate-spin" /> {t('studio.preparingPexelsBroll')}</div>
                    )}
                    {researchingSceneMedia.has(s.sceneId) && !ingestingPexelsImages.has(s.sceneId) && !ingestingPexelsVideos.has(s.sceneId) && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-blue-600"><Loader2 size={12} className="animate-spin" /> {t('studio.researchingFootage')}</div>
                    )}
                    {/* Per-scene AI image generation */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => handleGenerateSceneImage(i)}
                        disabled={!hasOpenAI || generatingSceneImage === s.sceneId}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {generatingSceneImage === s.sceneId ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        {t('studio.generateImage')}
                      </button>
                      <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">
                        {importingSceneImages.has(s.sceneId) ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
                        {importingSceneImages.has(s.sceneId) ? t('studio.importingImage') : t('studio.importImage')}
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          className="sr-only"
                          disabled={importingSceneImages.has(s.sceneId)}
                          onChange={(event) => {
                            const files = Array.from(event.currentTarget.files ?? []);
                            event.currentTarget.value = '';
                            void handleImportSceneImage(i, files);
                          }}
                        />
                      </label>
                      <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">
                        {importingSceneVideos.has(s.sceneId) ? <Loader2 size={12} className="animate-spin" /> : <Video size={12} />}
                        {importingSceneVideos.has(s.sceneId) ? t('studio.importingVideo') : t('studio.importVideo')}
                        <input
                          type="file"
                          accept="video/mp4"
                          className="sr-only"
                          disabled={importingSceneVideos.has(s.sceneId)}
                          onChange={(event) => {
                            const files = Array.from(event.currentTarget.files ?? []);
                            event.currentTarget.value = '';
                            void handleImportSceneVideo(i, files);
                          }}
                        />
                      </label>
                      <select
                        value={s.visualMode ?? ''}
                        onChange={(e) => {
                          const updated = [...scenes];
                          updated[i] = { ...s, visualMode: (e.target.value || undefined) as VisualMode | undefined };
                          setScenes(updated);
                        }}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 outline-none focus:border-slate-400"
                      >
                        <option value="">{t('studio.sceneVisualMode')}</option>
                        {VISUAL_MODES.filter((m) => m.key !== 'auto').map((m) => (
                          <option key={m.key} value={m.key}>{t(m.labelKey)}</option>
                        ))}
                      </select>
                    </div>
                    {/* Image prompt override */}
                    <input
                      value={s.imagePrompt ?? ''}
                      onChange={(e) => {
                        const updated = [...scenes];
                        updated[i] = { ...s, imagePrompt: e.target.value };
                        setScenes(updated);
                      }}
                      placeholder={t('studio.imagePromptPlaceholder')}
                      className="mt-1 w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-500 outline-none focus:border-slate-400"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="secondary" onClick={() => setStep('topic')}><ArrowLeft size={16} /> {t('studio.back')}</Button>
              <Button variant="secondary" onClick={handleGenerateScript} disabled={generating}>
                {generating ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {t('studio.regenerate')}
              </Button>
              <Button onClick={() => setStep('style')} disabled={!script.trim()}>
                {t('studio.continue')} <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Step 3: Style */}
      {step === 'style' && (
        <Card className="p-6">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">{t('studio.chooseStyle')}</h2>
          <p className="mb-4 text-sm text-slate-500">{t('studio.styleDesc')}</p>
          <div className="space-y-5">
            {/* Caption Style */}
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Type size={14} /> {t('studio.captionStyle')}
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {CAPTION_STYLES.map((s) => (
                  <button key={s.key} onClick={() => setCaptionStyle(s.key)}
                    className={classNames(
                      'rounded-lg border p-3 text-left transition-colors',
                      captionStyle === s.key ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50',
                    )}>
                    <p className="text-sm font-medium text-slate-900">{t(`studio.caption${s.key.charAt(0).toUpperCase() + s.key.slice(1)}`)}</p>
                    <p className="text-xs text-slate-500">{t(`studio.caption${s.key.charAt(0).toUpperCase() + s.key.slice(1)}Desc`)}</p>
                  </button>
                ))}
              </div>

              {/* Subtitle Toggle & Custom Colors */}
              <div className="mt-3 space-y-3 rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-3">
                  <button onClick={() => setShowSubtitles(!showSubtitles)}
                    className={classNames('relative h-6 w-11 rounded-full transition-colors', showSubtitles ? 'bg-emerald-500' : 'bg-slate-200')}>
                    <span className={classNames('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', showSubtitles ? 'translate-x-5' : 'translate-x-0.5')} />
                  </button>
                  <div className="flex items-center gap-1.5">
                    {showSubtitles ? <Eye size={14} className="text-slate-600" /> : <EyeOff size={14} className="text-slate-400" />}
                    <p className="text-sm font-medium text-slate-900">{t('studio.showSubtitles')}</p>
                  </div>
                </div>
                {showSubtitles && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs font-medium text-slate-500">{t('studio.captionTextColor')}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <input type="color" value={captionTextColor || '#ffffff'} onChange={(e) => setCaptionTextColor(e.target.value)}
                          className="h-8 w-8 cursor-pointer rounded border border-slate-200" />
                        <input value={captionTextColor} onChange={(e) => setCaptionTextColor(e.target.value)} placeholder="#ffffff"
                          className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-slate-400" />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500">{t('studio.captionHighlightColor')}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <input type="color" value={captionHighlightColor || '#10b981'} onChange={(e) => setCaptionHighlightColor(e.target.value)}
                          className="h-8 w-8 cursor-pointer rounded border border-slate-200" />
                        <input value={captionHighlightColor} onChange={(e) => setCaptionHighlightColor(e.target.value)} placeholder="#10b981"
                          className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-slate-400" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Transition Style */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('studio.transitions')}</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {TRANSITION_STYLES.map((transition) => (
                  <button key={transition.key} onClick={transition.canonical ? () => requestTransitionStyleChange(transition.key) : undefined} disabled={!transition.canonical}
                    className={classNames(
                      'rounded-lg border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400',
                      transition.canonical && transitionStyle === transition.key ? 'border-slate-900 bg-slate-50 font-medium text-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                    )}>
                    {transition.label}{!transition.canonical && <span className="ml-1 text-[10px] text-slate-400">{t('studio.transitionComingLater')}</span>}
                  </button>
                ))}
                {!isStudioRecipeCanonicalTransition(transitionStyle) && (
                  <p className="w-full text-xs text-amber-700" role="status">{t('studio.transitionLegacyUnavailable')}</p>
                )}
              </div>
            </div>

            {/* Motion Style */}
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Move size={14} /> {t('studio.imageMotion')}
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {MOTION_STYLES.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button key={m.key} onClick={() => requestMotionStyleChange(m.key)}
                      className={classNames(
                        'flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors',
                        motionStyle === m.key ? 'border-slate-900 bg-slate-50 font-medium text-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                      )}>
                      <Icon size={14} /> {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* B-roll toggle */}
            {hasPexels && (
              <div>
                <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <Video size={14} /> {t('studio.broll')}
                </label>
                <div className="mt-2 flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                  <button
                    onClick={() => setUseBroll(!useBroll)}
                    className={classNames(
                      'relative h-6 w-11 rounded-full transition-colors',
                      useBroll ? 'bg-emerald-500' : 'bg-slate-200',
                    )}>
                    <span className={classNames(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                      useBroll ? 'translate-x-5' : 'translate-x-0.5',
                    )} />
                  </button>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{t('studio.useBroll')}</p>
                    <p className="text-xs text-slate-500">{t('studio.brollDesc')}</p>
                  </div>
                </div>
                {useBroll && (
                  <button onClick={handleFetchBroll} disabled={fetchingVideos}
                    className="mt-2 text-sm font-medium text-blue-600 hover:underline disabled:opacity-50">
                    {fetchingVideos ? t('studio.fetchingVideos') : t('studio.fetchBroll')}
                  </button>
                )}
              </div>
            )}

            {/* Background Music */}
            <div>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Music size={14} /> {t('studio.bgMusic')}
              </label>
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => handleLoadMusic('')}
                    className={classNames(
                      'rounded-lg border p-3 text-left transition-colors',
                      !musicId ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50',
                    )}>
                    <p className="text-sm font-medium text-slate-900">No Music</p>
                    <p className="text-xs text-slate-500">Voiceover only</p>
                  </button>
                  {MUSIC_TRACKS.map((track) => (
                    <button key={track.id} onClick={() => handleLoadMusic(track.id)} disabled={loadingMusic}
                      className={classNames(
                        'rounded-lg border p-3 text-left transition-colors disabled:opacity-50',
                        musicId === track.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50',
                      )}>
                      <p className="text-sm font-medium text-slate-900">{track.name}</p>
                      <p className="text-xs text-slate-500">{track.mood}</p>
                    </button>
                  ))}
                </div>
                {musicId && (
                  <div>
                    <label className="text-xs text-slate-500">{t('studio.musicVolume')}: {Math.round(musicVolume * 100)}%</label>
                    <input type="range" min="0" max="1" step="0.05" value={musicVolume}
                      onChange={(e) => setMusicVolume(Number(e.target.value))}
                      className="mt-1 w-full accent-slate-900" />
                    <div className="mt-2 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <button type="button" disabled aria-label={t('studio.beatSyncUnavailable')}
                        className="relative h-5 w-10 cursor-not-allowed rounded-full bg-slate-200 opacity-70">
                        <span className="absolute top-0.5 h-4 w-4 translate-x-0.5 rounded-full bg-white shadow" />
                      </button>
                      <div>
                        <p className="text-xs font-medium text-slate-700">{t('studio.beatSync')} <span className="ml-1 rounded bg-slate-200 px-1 py-0.5 text-[10px] font-semibold text-slate-600">{t('studio.beatSyncComingLater')}</span></p>
                        <p className="text-xs text-slate-500">{t('studio.beatSyncDesc')}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Pro Features: Visual Mode */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <Sparkles size={14} /> {t('studio.proFeatures')}
              </label>
              <p className="mt-1 text-xs text-slate-500">{t('studio.proFeaturesDesc')}</p>

              {/* Visual Mode Selector */}
              <div className="mt-3">
                <p className="text-sm font-medium text-slate-700">{t('studio.visualMode')}</p>
                <p className="text-xs text-slate-500">{t('studio.visualModeDesc')}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {VISUAL_MODES.map((mode) => {
                    const Icon = mode.icon;
                    return (
                      <button key={mode.key} onClick={() => setVisualMode(mode.key)}
                        className={classNames(
                          'flex flex-col items-center gap-1 rounded-lg border p-2.5 text-center transition-colors',
                          visualMode === mode.key ? 'border-slate-900 bg-white font-medium text-slate-900 shadow-sm' : 'border-slate-200 bg-white/50 text-slate-600 hover:bg-white',
                        )}>
                        <Icon size={16} />
                        <span className="text-xs">{t(mode.labelKey)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Style Presets */}
              {visualStyles.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium text-slate-700">{t('studio.stylePresets')}</p>
                  <select value={selectedStyleId} onChange={(e) => setSelectedStyleId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                    <option value="">Default</option>
                    {visualStyles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              {/* Character Profile */}
              <div className="mt-3">
                <p className="flex items-center gap-1 text-sm font-medium text-slate-700"><User size={14} /> {t('studio.characterProfile')}</p>
                <p className="text-xs text-slate-500">{t('studio.characterProfileDesc')}</p>
                <div className="mt-2 space-y-2">
                  <input value={characterName} onChange={(e) => setCharacterName(e.target.value)}
                    placeholder={t('studio.characterNamePlaceholder')}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                  <textarea value={characterAppearance} onChange={(e) => setCharacterAppearance(e.target.value)}
                    placeholder={t('studio.characterAppearancePlaceholder')} rows={2}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" />
                  {characterName.trim() && (
                    <button onClick={async () => {
                      const ownerContext = captureValidatedMediaOwnerContext();
                      try {
                        const { data, error: profileError } = await supabase.from('character_profiles').insert({
                          user_id: ownerContext.ownerId,
                          name: characterName.trim(), appearance: characterAppearance.trim(),
                          art_style: visualMode === 'ai_cartoon' ? 'cartoon' : visualMode === 'ai_anime' ? 'anime' : 'realistic',
                        }).select().single();
                        assertCurrentMediaOwnerContext(ownerContext);
                        if (profileError || !data) {
                          setError('Character profile could not be saved. Please try again.');
                          return;
                        }
                        setCharacterProfileId(data.id);
                        setCharacterProfiles((current) => current.some((profile) => profile.id === data.id) ? current : [...current, data]);
                      } catch {
                        if (isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)) {
                          setError('Character profile could not be saved. Please try again.');
                        }
                      }
                    }} className="text-xs font-medium text-blue-600 hover:underline">
                      {t('studio.characterProfile')} →
                    </button>
                  )}
                  {characterProfiles.length > 0 && (
                    <select value={characterProfileId} onChange={(e) => setCharacterProfileId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
                      <option value="">{t('studio.noCharacter')}</option>
                      {characterProfiles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </div>
              </div>

              {/* Generate All Visuals / Research Footage */}
              <div className="mt-3 flex flex-wrap gap-2">
                {hasOpenAI && (visualMode === 'ai_cartoon' || visualMode === 'ai_realistic' || visualMode === 'ai_anime' || visualMode === 'ai_horror' || visualMode === 'auto' || visualMode === 'mixed') && (
                  <Button size="sm" onClick={handleGenerateAllVisuals} disabled={generatingVisuals || scenes.length === 0}>
                    {generatingVisuals ? <><Loader2 size={14} className="animate-spin" /> {t('studio.generatingVisuals')}</> : <><Sparkles size={14} /> {t('studio.generateVisuals')}</>}
                  </Button>
                )}
                {hasPexels && (visualMode === 'real_footage' || visualMode === 'mixed') && (
                  <Button size="sm" variant="secondary" onClick={handleResearchFootage} disabled={researchingFootage || scenes.length === 0}>
                    {researchingFootage ? <><Loader2 size={14} className="animate-spin" /> {t('studio.researchingFootage')}</> : <><Search size={14} /> {t('studio.researchFootage')}</>}
                  </Button>
                )}
              </div>

              {/* AI Hook Generator */}
              <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/30 p-3">
                <p className="flex items-center gap-1 text-sm font-medium text-slate-700"><Wand2 size={14} /> {t('studio.hookGenerator')}</p>
                <p className="text-xs text-slate-500">{t('studio.hookGeneratorDesc')}</p>
                <button onClick={handleGenerateHooks} disabled={!hasOpenAI || generatingHooks || !topic.trim()}
                  className="mt-2 flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {generatingHooks ? <><Loader2 size={14} className="animate-spin" /> {t('studio.generatingHooks')}</> : <><Sparkles size={14} /> {t('studio.generateHooks')}</>}
                </button>
                {hookVariations.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {hookVariations.map((h, i) => (
                      <button key={i} onClick={() => { setHook(h.text); }}
                        className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-left hover:border-slate-400">
                        <div className="flex items-center justify-between">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{h.formula}</span>
                          <span className="text-xs font-medium text-emerald-600">{h.predictedScore}/100</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-800">{h.text}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Script Analyzer */}
              <div className="mt-3 rounded-lg border border-purple-100 bg-purple-50/30 p-3">
                <p className="flex items-center gap-1 text-sm font-medium text-slate-700"><Activity size={14} /> {t('studio.scriptAnalyzer')}</p>
                <p className="text-xs text-slate-500">{t('studio.scriptAnalyzerDesc')}</p>
                <button onClick={handleAnalyzeScript} disabled={!hasOpenAI || analyzingScript || !script.trim()}
                  className="mt-2 flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {analyzingScript ? <><Loader2 size={14} className="animate-spin" /> {t('studio.analyzingScript')}</> : <><Activity size={14} /> {t('studio.analyzeScript')}</>}
                </button>
                {scriptAnalysis && (
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-4 gap-2">
                      <div className="rounded-lg bg-white p-2 text-center">
                        <p className="text-xs text-slate-500">{t('studio.retentionScore')}</p>
                        <p className="text-lg font-bold text-slate-900">{scriptAnalysis.retention_score}</p>
                      </div>
                      <div className="rounded-lg bg-white p-2 text-center">
                        <p className="text-xs text-slate-500">{t('studio.pacingScore')}</p>
                        <p className="text-lg font-bold text-slate-900">{scriptAnalysis.pacing_score}</p>
                      </div>
                      <div className="rounded-lg bg-white p-2 text-center">
                        <p className="text-xs text-slate-500">{t('studio.emotionScore')}</p>
                        <p className="text-lg font-bold text-slate-900">{scriptAnalysis.emotion_score}</p>
                      </div>
                      <div className="rounded-lg bg-white p-2 text-center">
                        <p className="text-xs text-slate-500">{t('studio.hookStrengthScore')}</p>
                        <p className="text-lg font-bold text-slate-900">{scriptAnalysis.hook_strength}</p>
                      </div>
                    </div>
                    {scriptAnalysis.suggestions.length > 0 && (
                      <div className="space-y-1.5">
                        {scriptAnalysis.suggestions.map((s, i) => (
                          <div key={i} className={classNames('rounded-lg border p-2', s.severity === 'high' ? 'border-amber-200 bg-amber-50/50' : s.severity === 'medium' ? 'border-slate-200 bg-slate-50' : 'border-slate-100 bg-white')}>
                            <span className={classNames('rounded px-1.5 py-0.5 text-xs font-medium', s.severity === 'high' ? 'bg-amber-100 text-amber-700' : s.severity === 'medium' ? 'bg-slate-200 text-slate-600' : 'bg-slate-100 text-slate-500')}>{s.severity}</span>
                            <p className="mt-1 text-xs text-slate-700">{s.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* AI Subtitle Translation */}
              <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/30 p-3">
                <p className="flex items-center gap-1 text-sm font-medium text-slate-700"><Languages size={14} /> {t('studio.subtitleTranslation')}</p>
                <p className="text-xs text-slate-500">{t('studio.subtitleTranslationDesc')}</p>
                <div className="mt-2 flex items-center gap-2">
                  <select value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400">
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="pt">Português</option>
                    <option value="it">Italiano</option>
                    <option value="ja">日本語</option>
                    <option value="ko">한국어</option>
                    <option value="zh">中文</option>
                    <option value="ar">العربية</option>
                    <option value="hi">हिन्दी</option>
                    <option value="ru">Русский</option>
                    <option value="tr">Türkçe</option>
                    <option value="nl">Nederlands</option>
                    <option value="pl">Polski</option>
                  </select>
                  <button onClick={handleTranslateSubtitles} disabled={translating || scenes.length === 0}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    {translating ? <><Loader2 size={14} className="animate-spin" /> {t('studio.translating')}</> : <><Globe size={14} /> {t('studio.translateSubtitles')}</>}
                  </button>
                </div>
              </div>

              {/* Watermark */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs font-medium text-slate-500">{t('studio.watermark')}</p>
                  <input value={watermarkText} maxLength={20} onChange={(e) => setWatermarkText(e.target.value)}
                    placeholder={t('studio.watermarkPlaceholder')}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500">{t('studio.watermarkPosition')}</p>
                  <select value={watermarkPosition} onChange={(e) => setWatermarkPosition(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-slate-400">
                    <option value="bottom-right">{t('studio.bottomRight')}</option>
                    <option value="bottom-left">{t('studio.bottomLeft')}</option>
                    <option value="top-right">{t('studio.topRight')}</option>
                    <option value="top-left">{t('studio.topLeft')}</option>
                  </select>
                </div>
              </div>

              {/* SEO & SRT */}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={handleGenerateSEO} disabled={!hasOpenAI || generatingSEOState || !script.trim()}>
                  {generatingSEOState ? <><Loader2 size={14} className="animate-spin" /> {t('studio.generatingSEO')}</> : <><Tag size={14} /> {t('studio.generateSEO')}</>}
                </Button>
                <Button size="sm" variant="secondary" onClick={handleExportSRT} disabled={scenes.length === 0}>
                  <Download size={14} /> {t('studio.exportSRT')}
                </Button>
              </div>

              {seoResult && (
                <div className="mt-3 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                  <p className="text-xs font-semibold text-emerald-700">{t('studio.seoGenerated')}</p>
                  <div>
                    <p className="text-xs font-medium text-slate-500">{t('studio.optimizedTitle')}</p>
                    <p className="text-sm text-slate-800">{seoResult.optimizedTitle}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">{t('studio.optimizedDescription')}</p>
                    <p className="text-sm text-slate-800">{seoResult.optimizedDescription}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">{t('studio.seoTags')}</p>
                    <div className="flex flex-wrap gap-1">
                      {seoResult.tags.map((tag, i) => <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{tag}</span>)}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">{t('studio.seoHashtags')}</p>
                    <div className="flex flex-wrap gap-1">
                      {seoResult.hashtags.map((tag, i) => <span key={i} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">{tag}</span>)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="secondary" onClick={() => setStep('script')}><ArrowLeft size={16} /> {t('studio.back')}</Button>
              <Button onClick={() => { handleLoadVoices(); setStep('voice'); }}>
                {t('studio.continue')} <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Step 4: Voiceover */}
      {step === 'voice' && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">{t('studio.chooseVoiceover')}</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <button
                onClick={() => { setVoiceoverMode('elevenlabs'); setBrowserTtsFinalIntent(null); invalidateNarration(); }}
                disabled={!hasElevenLabs}
                className={classNames(
                  'flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors disabled:opacity-50',
                  voiceoverMode === 'elevenlabs' ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50',
                )}>
                <Headphones size={20} className="mt-0.5 shrink-0 text-slate-600" />
                <div>
                  <p className="text-sm font-medium text-slate-900">{t('studio.elevenlabs')} {hasElevenLabs ? '' : t('studio.elevenlabsNotConfigured')}</p>
                  <p className="text-xs text-slate-500">{t('studio.elevenlabsDesc')}</p>
                </div>
              </button>
              <button
                onClick={() => { setVoiceoverMode('browser'); setBrowserTtsFinalIntent(null); invalidateNarration(); }}
                className={classNames(
                  'flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors',
                  voiceoverMode === 'browser' ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50',
                )}>
                <Volume2 size={20} className="mt-0.5 shrink-0 text-slate-600" />
                <div>
                  <p className="text-sm font-medium text-slate-900">{t('studio.browserTTS')}</p>
                  <p className="text-xs text-slate-500">{t('studio.browserTTSDesc')}</p>
                </div>
              </button>
              <button
                onClick={() => { setVoiceoverMode('none'); setBrowserTtsFinalIntent(null); invalidateNarration(); }}
                className={classNames(
                  'flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors',
                  voiceoverMode === 'none' ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50',
                )}>
                <Film size={20} className="mt-0.5 shrink-0 text-slate-600" />
                <div>
                  <p className="text-sm font-medium text-slate-900">{t('studio.noVoiceover')}</p>
                  <p className="text-xs text-slate-500">{t('studio.noVoiceoverDesc')}</p>
                </div>
              </button>
            </div>

            {voiceoverMode === 'browser' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status">
                <p>{t('studio.browserTTSFinalNotice')}</p>
                {browserTtsFinalIntent === 'without-narration' ? (
                  <p className="mt-2 font-medium">{t('studio.browserTTSFinalIntentConfirmed')}</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => { setVoiceoverMode('elevenlabs'); setBrowserTtsFinalIntent(null); invalidateNarration(); }} disabled={!hasElevenLabs}>
                      {t('studio.browserTTSUseElevenLabs')}
                    </Button>
                    <Button onClick={() => setBrowserTtsFinalIntent('without-narration')}>
                      {t('studio.browserTTSExportWithoutNarration')}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {voiceoverMode === 'elevenlabs' && hasElevenLabs && (
              <div>
                {voices.length === 0 ? (
                  <button onClick={handleLoadVoices} className="text-sm text-blue-600 hover:underline">
                    {t('studio.loadVoices')}
                  </button>
                ) : (
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {voices.map((v) => (
                      <button key={v.voice_id}
                        onClick={() => { setSelectedVoice(v.voice_id); invalidateNarration(); }}
                        className={classNames(
                          'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                          selectedVoice === v.voice_id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:bg-slate-50',
                        )}>
                        <div className={classNames('flex h-8 w-8 items-center justify-center rounded-full',
                          selectedVoice === v.voice_id ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400')}>
                          {selectedVoice === v.voice_id ? <Check size={16} /> : <Volume2 size={16} />}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">{v.name}</p>
                          {v.category && <p className="text-xs text-slate-500">{v.category}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {audioUrl && (
              <div className="rounded-lg bg-slate-50 p-3">
                <audio src={audioUrl} controls className="w-full" />
              </div>
            )}
            <div className="flex justify-between gap-2">
              <Button variant="secondary" onClick={() => setStep('style')}><ArrowLeft size={16} /> {t('studio.back')}</Button>
              <Button onClick={handleGenerateVoiceover} disabled={generatingVoice || !script.trim()}>
                {generatingVoice ? <><Loader2 size={16} className="animate-spin" /> {t('studio.processing')}</> : <><Mic size={16} /> {t('studio.continue')}</>}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Step 5: Render */}
      {step === 'render' && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">{t('studio.renderYourVideo')}</h2>
          <div className="mb-4 text-sm text-slate-500">
            {t('studio.renderDesc', { caption: captionStyle, transition: transitionStyle, motion: motionStyle, audio: hasCanonicalNarration ? ' + ' + t('studio.voiceoverPreview').toLowerCase() : '', music: musicBlob ? ' + ' + t('studio.bgMusic').toLowerCase() : '' })}
            <p className="mt-2 text-xs text-amber-700">{t('studio.recipeExportNotice')}</p>
          </div>
          {rendering ? (
            <div className="space-y-3">
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${renderProgress}%` }} />
              </div>
              <p className="text-center text-sm text-slate-500">{renderProgress}% {t('studio.rendered')}…</p>
            </div>
          ) : (
            <div className="space-y-4">
              {currentCompletedExport ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={20} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-emerald-950">{t('studio.videoReady')}</p>
                      <p className="mt-1 text-sm text-emerald-800">{t('studio.exportComplete')}</p>
                      <p className="mt-3 truncate text-sm font-medium text-slate-900">{exportFilename(currentCompletedExport.artifact.path)}</p>
                      <p className="mt-1 text-xs text-slate-600">{t('studio.verifiedExport')} · {Math.round(currentCompletedExport.artifact.durationMs / 1_000)}s · {formatFileSize(currentCompletedExport.artifact.sizeBytes)}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => void handlePublishCompletedExport()} disabled={postRenderAction !== null}><Youtube size={16} /> {postRenderAction === 'publish' ? t('studio.processing') : t('studio.publishToYouTube')}</Button>
                    <Button variant="secondary" onClick={() => void handleOpenCompletedExport()} disabled={postRenderAction !== null}><ExternalLink size={16} /> {t('studio.openVideo')}</Button>
                    <Button variant="secondary" onClick={() => void handleRevealCompletedExport()} disabled={postRenderAction !== null}><FolderOpen size={16} /> {t('studio.showInFolder')}</Button>
                    <Button variant="secondary" onClick={() => void handleSaveAsCompletedExport()} disabled={postRenderAction !== null}><Save size={16} /> {t('studio.saveAs')}</Button>
                  </div>
                </div>
              ) : (
                <>
                  {audioUrl && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{t('studio.voiceoverPreview')}</p>
                      <audio src={audioUrl} controls className="w-full" />
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <Button variant="secondary" onClick={() => setStep('voice')}><ArrowLeft size={16} /> {t('studio.back')}</Button>
                    <div className="flex gap-2"><DirectorAnalysisAction navigate={() => onNavigateDirector()} request={{ projectId: directorProjectId, buildInput: { title: title || topic || 'Untitled Studio Project', scenes, audio: { narrationMode: resolveStudioAudioNarrationMode(voiceoverMode, hasCanonicalNarration) }, narration: hasCanonicalNarration && narration ? { storage: narration.storage, durationMs: narration.durationMs, scriptRevision: narration.scriptRevision, voiceId: narration.voiceId, ...(narration.alignment ? { alignment: narration.alignment } : {}) } : undefined } }} />{onNavigatePlatform && <Button onClick={onNavigatePlatform}><Sparkles size={16} /> Optimize for platform</Button>}<Button onClick={() => void prepareModernPublish()} disabled={!channel || preparingPublish}><Film size={16} /> {t('studio.renderVideo')}</Button></div>
                  </div>
                </>
              )}
              {postRenderNotice && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{postRenderNotice}</p>
              )}
              {currentCompletedExport && (
                <div className="flex justify-between gap-2">
                  <Button variant="secondary" onClick={() => setStep('voice')} disabled={postRenderAction !== null}><ArrowLeft size={16} /> {t('studio.back')}</Button>
                  <Button variant="secondary" onClick={() => setCompletedExport(null)} disabled={postRenderAction !== null}><Film size={16} /> {t('studio.renderVideo')}</Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Step 6: Publish */}
      {step === 'publish' && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">{t('studio.publishToYouTube')}</h2>
          <div className="space-y-4">
            {videoUrl && <div className="overflow-hidden rounded-lg bg-slate-900"><video src={videoUrl} controls className="mx-auto max-h-96" /></div>}
            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700"><p className="flex items-center gap-2"><Youtube size={16} /> Create a canonical local export for publishing.</p><p className="mt-1">ShortsFlow will render through the existing export queue, verify the exact bytes with FFprobe and SHA-256, then keep the publishing handoff bound to that export.</p></div>
            <div className="flex justify-between gap-2"><Button variant="secondary" onClick={() => setStep('render')}><ArrowLeft size={16} /> {t('studio.back')}</Button>{currentCompletedExport ? <Button onClick={() => void handlePublishCompletedExport()} disabled={postRenderAction !== null}><Youtube size={16} /> {t('studio.publishToYouTube')}</Button> : <Button onClick={() => setStep('render')}><Film size={16} /> {t('studio.renderVideo')}</Button>}</div>
          </div>
        </Card>
      )}
    </div>
  );
}
