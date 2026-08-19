import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, Mic, Film, Youtube, ArrowRight, ArrowLeft, Check, Loader2,
  Wand2, RefreshCw, AlertCircle, Volume2, X, Palette, Music, Video,
  ImagePlus, Headphones, Type, Zap, Move, User, Search, Download, Tag, Globe,
  Activity, Languages, Eye, EyeOff, ZoomIn, ZoomOut, Save, RotateCcw, FolderOpen, ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { MediaStorageObject, Scene, Voice, PexelsVideo, VisualMode, VisualStyle, CharacterProfile } from '@/lib/types';
import type { CanonicalChannelIdentity } from '@/services/canonicalChannelCatalog';
import {
  generateVoiceover, getProviderStatus, listVoices, uploadMedia,
  searchImages, searchVideos,
  generateAIImage, researchFootage, generateSRT, translateSubtitles,
} from '@/lib/api';
import type { HookVariation, ScriptAnalysis } from '@/lib/types';
import {
  renderVideo, type CaptionStyle, type TransitionStyle, type MotionStyle,
} from '@/lib/videoRenderer';
import { Card, Button } from '@/components/ui';
import { AIPipelineMonitor } from '@/components/AIPipelineMonitor';
import { classNames } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { clearStudioDraft, loadStudioDraft, resolveStudioAudioNarrationMode, saveStudioDraft, type StudioDraft, type StudioStep, type StudioVoiceoverMode } from '@/lib/studioDraft';
import { getStudioWorkflow } from '@/lib/studioWorkflow';
import { applicationContainer, dependencyTokens } from '@/core/di';
import { compileStudioProductionRecipeV1, normalizeStudioProductionRecipeV1 } from '@/core/media';
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
} from '@/lib/mediaStorage';
import { isCurrentValidatedOwnerContext } from '@/auth/identity';
import { isApprovedCatalogMusicUrl, isValidCatalogMusicBlob, isValidCatalogMusicResponse, MUSIC_TRACKS } from '@/lib/catalogMusic';
import { useAuthSessionStore } from '@/auth/session';

interface StudioProps {
  channels: CanonicalChannelIdentity[];
  onNavigateDirector: () => void;
  onNavigatePlatform?: () => void;
}

type Step = StudioStep;

function defaultChannelId(channels: readonly CanonicalChannelIdentity[]) {
  return channels.length === 1 ? channels[0].id : '';
}

function providerActionError(action: string, error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/not configured|not available/i.test(message)) return `The provider for ${action} is not configured. Contact an administrator.`;
  return `Unable to complete ${action}. Check your connection and try again.`;
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
  const { t } = useI18n();
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
  const [fetchingVideos, setFetchingVideos] = useState(false);
  const [voiceoverMode, setVoiceoverMode] = useState<StudioVoiceoverMode>('none');

  const [title, setTitle] = useState('');
  const [hook, setHook] = useState('');
  const [script, setScript] = useState('');
  const [cta, setCta] = useState('');
  const [scenes, setScenes] = useState<Scene[]>([]);

  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('karaoke');
  const [transitionStyle, setTransitionStyle] = useState<TransitionStyle>('crossfade');
  const [motionStyle, setMotionStyle] = useState<MotionStyle>('kenburns');
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
  const [generatingSEOState, setGeneratingSEOState] = useState(false);
  const [seoResult, setSeoResult] = useState<{ optimizedTitle: string; optimizedDescription: string; tags: string[]; hashtags: string[]; thumbnailText: string } | null>(null);
  const [watermarkText, setWatermarkText] = useState('');
  const [watermarkPosition, setWatermarkPosition] = useState('bottom-right');
  const [generatingSceneImage, setGeneratingSceneImage] = useState<number | null>(null);

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
  const [translatedSrt, setTranslatedSrt] = useState('');

  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [narration, setNarration] = useState<{ storage: MediaStorageObject; durationMs: number; scriptRevision: string; voiceId: string } | null>(null);
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

  const canonicalStudioRevision = useMemo(() => JSON.stringify({
    title, hook, script, cta, scenes: toDurableScenes(scenes), captionStyle, transitionStyle,
    motionStyle, useBroll, musicId, musicStorage, musicVolume, visualMode, selectedStyleId, characterName,
    characterAppearance, characterArtStyle, characterProfileId, watermarkText, watermarkPosition,
    showSubtitles, captionTextColor, captionHighlightColor, beatSync, voiceoverMode, selectedVoice,
    narration: hasCanonicalNarration && narration ? { storage: narration.storage, durationMs: narration.durationMs, scriptRevision: narration.scriptRevision, voiceId: narration.voiceId } : null,
  }), [title, hook, script, cta, scenes, captionStyle, transitionStyle, motionStyle, useBroll, musicId, musicStorage, musicVolume, visualMode, selectedStyleId, characterName, characterAppearance, characterArtStyle, characterProfileId, watermarkText, watermarkPosition, showSubtitles, captionTextColor, captionHighlightColor, beatSync, voiceoverMode, selectedVoice, hasCanonicalNarration, narration]);

  const currentCompletedExport = completedExport?.revision === canonicalStudioRevision && isVerifiedExportJob(completedExport.job)
    ? completedExport.job
    : null;
  const canonicalStudioRevisionRef = useRef(canonicalStudioRevision);
  canonicalStudioRevisionRef.current = canonicalStudioRevision;

  useEffect(() => {
    invalidateNarration();
    setCompletedExport(null);
    setPostRenderNotice(null);
    setPostRenderAction(null);
    setPreparingPublish(false);
    setError('');
    // Owner-scoped state must never cross an authenticated owner transition.
  }, [authenticatedUserId]);

  useEffect(() => {
    if (completedExport && completedExport.revision !== canonicalStudioRevision) setPostRenderNotice(t('studio.exportOutdated'));
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
    setDirectorProjectId(projectId);
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
      const restoredScenes = toDurableScenes(draft.scenes ?? []);
      setScenes(restoredScenes);
      if (restoredScenes.some((scene) => scene.imageStorage || scene.videoStorage)) {
        void resolvePrivateSceneMedia(restoredScenes)
          .then((resolvedScenes) => { if (!cancelled) setScenes(resolvedScenes); })
          .catch(() => { /* Stable identity remains available for a later signed-URL retry. */ });
      }
      setCaptionStyle(draft.captionStyle);
      setTransitionStyle(draft.transitionStyle);
      setMotionStyle(draft.motionStyle);
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
      setDraftSavedAt('');
      setDraftStatus('empty');
    }
    draftHydratedRef.current = true;
    return () => { cancelled = true; };
  }, [channels, currentProject?.id]);

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
    selectedVoice,
    targetLanguage,
    narration: narration ?? undefined,
  }), [directorProjectId, step, channelId, unavailableRestoredChannelId, topic, niche, tone, duration, title, hook, script, cta, scenes,
    captionStyle, transitionStyle, motionStyle, useBroll, musicId, musicStorage, musicVolume, visualMode,
    selectedStyleId, characterName, characterAppearance, characterArtStyle, characterProfileId,
    watermarkText, watermarkPosition, showSubtitles, captionTextColor, captionHighlightColor,
    beatSync, voiceoverMode, selectedVoice, targetLanguage, narration]);

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
      saveStudioDraft(savedDraft);
      useProjectStore.getState().upsertDraft(createStudioProjectDraft(savedDraft));
      setDraftSavedAt(savedAt);
      setDraftStatus('saved');
    }, 650);
    return () => window.clearTimeout(timer);
  }, [draft, topic, title, script, scenes.length]);

  function handleClearDraft() {
    clearStudioDraft();
    const projectId = startNewStudioProject(projectIdentity.current);
    setDirectorProjectId(projectId);
    setStep('topic');
    setTopic('');
    setTitle('');
    setHook('');
    setScript('');
    setCta('');
    setScenes([]);
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
    try {
      const result = await aiService.generateScript(
        { topic, niche, tone, duration },
        { metadata: { source: 'studio', action: 'generate-script' } },
      );
      setTitle(result.title);
      setHook(result.hook);
      setScript(result.script);
      invalidateNarration();
      setCta(result.cta);
      setScenes(result.scenes ?? []);
      setStep('script');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate script');
    } finally {
      setGenerating(false);
    }
  }

  function handleManualScript() {
    setTitle(topic);
    setHook('');
    setScript('');
    setCta('');
    setScenes([{ text: '', duration: duration, visual: '', keywords: [] }]);
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
    try {
      const charDesc = characterName.trim()
        ? `${characterName.trim()}, ${characterAppearance.trim()}`
        : undefined;
      const updatedScenes = [...scenes];
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
            videoUrl: undefined,
            videoStorage: undefined,
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
      setScenes(updatedScenes);
      if (failed) setError(succeeded ? `${succeeded} scene visuals were generated; ${failed} could not be generated.` : providerActionError('scene visuals', firstFailure));
    } catch (generationError) {
      setError(providerActionError('scene visuals', generationError));
    } finally {
      setGeneratingVisuals(false);
    }
  }

  async function handleResearchFootage() {
    if (scenes.length === 0) return;
    if (!hasPexels) { setError('Pexels footage research is not configured. Contact an administrator.'); return; }
    setResearchingFootage(true);
    setError('');
    try {
      const results = await researchFootage({ topic: title || script.slice(0, 100), scenes, mode: visualMode });
      const updatedScenes = [...scenes];
      let resolved = 0;
      for (const result of results) {
        if (result.sceneIndex < updatedScenes.length) {
          if (result.imageUrl || result.videoUrl) resolved += 1;
          updatedScenes[result.sceneIndex] = {
            ...updatedScenes[result.sceneIndex],
            imageUrl: result.imageUrl ?? updatedScenes[result.sceneIndex].imageUrl,
            videoUrl: result.videoUrl ?? updatedScenes[result.sceneIndex].videoUrl,
            ...(result.imageUrl ? { imageStorage: undefined } : {}),
            ...(result.videoUrl ? { videoStorage: undefined } : {}),
          };
        }
      }
      setScenes(updatedScenes);
      if (resolved === 0) setError('No footage could be found for the current scenes. Try refining the visual descriptions.');
    } catch (researchError) {
      setError(providerActionError('footage research', researchError));
    } finally {
      setResearchingFootage(false);
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

  function handleExportSRT() {
    if (scenes.length === 0) return;
    const srt = generateSRT(scenes);
    const blob = new Blob([srt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `subtitles-${title || 'video'}.srt`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
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
      const srt = generateSRT(scenes);
      const result = await translateSubtitles({ srt, targetLanguage });
      setTranslatedSrt(result.translatedSrt);
      const blob = new Blob([result.translatedSrt], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `subtitles-${targetLanguage}-${title || 'video'}.srt`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Subtitle translation could not be completed. Try again.');
    } finally {
      setTranslating(false);
    }
  }

  async function handleGenerateSceneImage(sceneIndex: number) {
    const scene = scenes[sceneIndex];
    if (!scene) return;
    if (!hasOpenAI) { setError('OpenAI image generation is not configured. Contact an administrator.'); return; }
    setGeneratingSceneImage(sceneIndex);
    const ownerContext = captureValidatedMediaOwnerContext();
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
      setScenes(prev => prev.map((s, i) => i === sceneIndex ? {
        ...s,
        imageUrl: result.imageUrl,
        imageStorage: result.media,
        videoUrl: undefined,
        videoStorage: undefined,
        imagePrompt: result.revisedPrompt || s.imagePrompt,
      } : s));
    } catch (generationError) {
      setError(providerActionError('this scene image', generationError));
    } finally {
      setGeneratingSceneImage(null);
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
        setNarration({ storage: generated.media, durationMs: generated.durationMs, scriptRevision: narrationRevision(script), voiceId: selectedVoice });
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
    try {
      const updatedScenes = [...scenes];
      let succeeded = 0;
      let failed = 0;
      let unresolved = 0;
      let firstFailure: unknown;
      for (let i = 0; i < updatedScenes.length; i++) {
        const scene = updatedScenes[i];
        const query = scene.visual || scene.keywords?.[0] || topic;
        try {
          const images = await searchImages(query, 1);
          if (images.length > 0) {
            updatedScenes[i] = { ...scene, imageUrl: images[0].url, imageStorage: undefined, videoUrl: undefined, videoStorage: undefined };
            succeeded += 1;
          } else unresolved += 1;
        } catch (sceneError) { failed += 1; firstFailure ??= sceneError; }
      }
      setScenes(updatedScenes);
      if (failed || unresolved || succeeded === 0) setError(succeeded ? `${succeeded} scene images were found; some scenes could not be updated.` : failed ? providerActionError('images', firstFailure) : 'No images could be found. Check provider availability and try again.');
    } catch (e) {
      setError(providerActionError('images', e));
    } finally {
      setFetchingImages(false);
    }
  }

  async function handleFetchBroll() {
    if (!hasPexels) { setError('Pexels video search is not configured. Contact an administrator.'); return; }
    setFetchingVideos(true);
    setError('');
    try {
      const updatedScenes = [...scenes];
      let succeeded = 0;
      let failed = 0;
      let unresolved = 0;
      let firstFailure: unknown;
      for (let i = 0; i < updatedScenes.length; i++) {
        const scene = updatedScenes[i];
        const query = scene.visual || scene.keywords?.[0] || topic;
        try {
          const videos = await searchVideos(query, 1);
          if (videos.length > 0 && videos[0].fileUrl) {
            updatedScenes[i] = { ...scene, videoUrl: videos[0].fileUrl, videoStorage: undefined, imageUrl: videos[0].preview, imageStorage: undefined };
            succeeded += 1;
          } else unresolved += 1;
        } catch (sceneError) { failed += 1; firstFailure ??= sceneError; }
      }
      setScenes(updatedScenes);
      if (failed || unresolved || succeeded === 0) setError(succeeded ? `${succeeded} scene video clips were found; some scenes could not be updated.` : failed ? providerActionError('video clips', firstFailure) : 'No video clips could be found. Check provider availability and try again.');
    } catch (e) {
      setError(providerActionError('video clips', e));
    } finally {
      setFetchingVideos(false);
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
        const selectedDestination = await bridge?.pickOutputPath?.({ defaultPath: exportFilename(job.artifact.path) });
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

  async function prepareModernPublish() {
    if (!channel) {
      setError('Select an available channel before preparing this video for publishing.');
      setStep('topic');
      return;
    }
    setPreparingPublish(true);
    setError('');
    const ownerContext = captureValidatedMediaOwnerContext();
    try {
      assertCurrentMediaOwnerContext(ownerContext);
      const recipe = normalizeStudioProductionRecipeV1({
        projectId: directorProjectId,
        title: title || topic || 'Studio video',
        scenes: toDurableScenes(scenes),
        captionStyle,
        transitionStyle,
        motionStyle,
        showSubtitles,
        captionTextColor,
        captionHighlightColor,
        voiceoverMode,
        narration: hasCanonicalNarration && narration ? {
          storage: narration.storage,
          durationMs: narration.durationMs,
          scriptRevision: narration.scriptRevision,
          voiceId: narration.voiceId,
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
      const buildInput = compileStudioProductionRecipeV1(recipe);
      const mediaEngine = applicationContainer.resolve(dependencyTokens.mediaEngine);
      const build = await mediaEngine.buildProject(buildInput);
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
      setCompletedExport({ job: completed, revision: canonicalStudioRevision });
      setPostRenderNotice(null);
    } catch (publishError) {
      if (isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)) {
        setError(publishError instanceof Error ? publishError.message : 'Verified export could not be prepared.');
      }
    } finally {
      if (isCurrentValidatedOwnerContext(ownerContext.ownerId, ownerContext.generation)) setPreparingPublish(false);
    }
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
                  <button onClick={() => setScenes([...scenes, { text: '', duration: 5, visual: '', keywords: [] }])}
                    className="text-xs font-medium text-blue-600 hover:underline">{t('studio.addScene')}</button>
                </div>
              </div>
              <div className="mt-2 space-y-2">
                {scenes.map((s, i) => (
                  <div key={i} className="rounded-lg bg-slate-50 p-3">
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
                        <span className="text-xs text-blue-600">{t('studio.brollAttached')}</span>
                      </div>
                    )}
                    {s.imageUrl && !s.videoUrl && (
                      <div className="mt-2 overflow-hidden rounded-lg">
                        <img src={s.imageUrl} alt="Scene visual" className="h-24 w-full object-cover" />
                      </div>
                    )}
                    {/* Per-scene AI image generation */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => handleGenerateSceneImage(i)}
                        disabled={!hasOpenAI || generatingSceneImage === i}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {generatingSceneImage === i ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        {t('studio.generateImage')}
                      </button>
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
                  <button key={transition.key} onClick={() => setTransitionStyle(transition.key)}
                    className={classNames(
                      'rounded-lg border px-3 py-2 text-sm transition-colors',
                      transitionStyle === transition.key ? 'border-slate-900 bg-slate-50 font-medium text-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                    )}>
                    {transition.label}{!transition.canonical && <span className="ml-1 text-[10px] text-slate-400">{t('studio.previewOnly')}</span>}
                  </button>
                ))}
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
                    <button key={m.key} onClick={() => setMotionStyle(m.key)}
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
                    <div className="mt-2 flex items-center gap-3 rounded-lg border border-slate-200 p-2">
                      <button onClick={() => setBeatSync(!beatSync)}
                        className={classNames('relative h-5 w-10 rounded-full transition-colors', beatSync ? 'bg-emerald-500' : 'bg-slate-200')}>
                        <span className={classNames('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', beatSync ? 'translate-x-5' : 'translate-x-0.5')} />
                      </button>
                      <div>
                        <p className="text-xs font-medium text-slate-700">{t('studio.beatSync')}</p>
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
                onClick={() => { setVoiceoverMode('elevenlabs'); invalidateNarration(); }}
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
                onClick={() => { setVoiceoverMode('browser'); invalidateNarration(); }}
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
                onClick={() => { setVoiceoverMode('none'); invalidateNarration(); }}
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
                    <div className="flex gap-2"><DirectorAnalysisAction navigate={() => onNavigateDirector()} request={{ projectId: directorProjectId, buildInput: { title: title || topic || 'Untitled Studio Project', scenes, audio: { narrationMode: resolveStudioAudioNarrationMode(voiceoverMode, hasCanonicalNarration) }, narration: hasCanonicalNarration && narration ? { storage: narration.storage, durationMs: narration.durationMs, scriptRevision: narration.scriptRevision, voiceId: narration.voiceId } : undefined } }} />{onNavigatePlatform && <Button onClick={onNavigatePlatform}><Sparkles size={16} /> Optimize for platform</Button>}<Button onClick={() => void prepareModernPublish()} disabled={!channel || preparingPublish}><Film size={16} /> {t('studio.renderVideo')}</Button></div>
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
