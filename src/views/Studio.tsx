import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, Mic, Film, Youtube, ArrowRight, ArrowLeft, Check, Loader2,
  Wand2, RefreshCw, AlertCircle, Volume2, X, Palette, Music, Video,
  ImagePlus, Headphones, Type, Zap, Move, User, Search, Download, Tag, Globe,
  Activity, Languages, Eye, EyeOff, ZoomIn, ZoomOut, Save, RotateCcw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Channel, Scene, Voice, PexelsVideo, VisualMode, VisualStyle, CharacterProfile } from '@/lib/types';
import {
  generateScript, generateVoiceover, listVoices, uploadMedia, publishToYouTube,
  getYouTubeAuthUrl, getApiKeyKeys, searchImages, searchVideos,
  generateAIImage, researchFootage, generateSEO, generateSRT,
  generateHooks, analyzeScript, translateSubtitles,
} from '@/lib/api';
import type { HookVariation, ScriptAnalysis } from '@/lib/types';
import {
  renderVideo, type CaptionStyle, type TransitionStyle, type MotionStyle,
} from '@/lib/videoRenderer';
import { Card, Button } from '@/components/ui';
import { classNames } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { clearStudioDraft, loadStudioDraft, saveStudioDraft, type StudioDraft, type StudioStep } from '@/lib/studioDraft';
import { getStudioWorkflow } from '@/lib/studioWorkflow';

interface StudioProps {
  channels: Channel[];
}

type Step = StudioStep;

const CAPTION_STYLES: { key: CaptionStyle; label: string; desc: string }[] = [
  { key: 'karaoke', label: 'Karaoke', desc: 'Word-by-word pop with accent color' },
  { key: 'highlight', label: 'Highlight Box', desc: 'Active word gets a colored block' },
  { key: 'classic', label: 'Classic', desc: 'Bottom gradient with full text' },
  { key: 'minimal', label: 'Minimal', desc: 'Clean centered text, subtle shadow' },
];

const TRANSITION_STYLES: { key: TransitionStyle; label: string }[] = [
  { key: 'crossfade', label: 'Crossfade' },
  { key: 'slide', label: 'Slide' },
  { key: 'zoom', label: 'Zoom Punch' },
  { key: 'fadeblack', label: 'Fade to Black' },
  { key: 'glitch', label: 'Glitch' },
  { key: 'shake', label: 'Shake' },
  { key: 'whippan', label: 'Whip Pan' },
  { key: 'none', label: 'None' },
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

const MUSIC_TRACKS: { id: string; name: string; url: string; mood: string }[] = [
  { id: 'upbeat', name: 'Upbeat Energy', url: 'https://cdn.pixabay.com/audio/2024/02/05/audio_3311b036f5.mp3', mood: 'Energetic, fast-paced' },
  { id: 'chill', name: 'Chill Lo-Fi', url: 'https://cdn.pixabay.com/audio/2023/12/26/audio_8d61de4c2e.mp3', mood: 'Calm, focused' },
  { id: 'cinematic', name: 'Cinematic', url: 'https://cdn.pixabay.com/audio/2022/10/25/audio_9a88ce0c7e.mp3', mood: 'Dramatic, epic' },
  { id: 'corporate', name: 'Corporate', url: 'https://cdn.pixabay.com/audio/2023/06/19/audio_3f8ee2a0a7.mp3', mood: 'Professional, clean' },
];

export function Studio({ channels }: StudioProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>('topic');
  const [channelId, setChannelId] = useState(channels[0]?.id ?? '');
  const [topic, setTopic] = useState('');
  const [niche, setNiche] = useState('');
  const [tone, setTone] = useState('engaging');
  const [duration, setDuration] = useState(30);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [hasOpenAI, setHasOpenAI] = useState(false);
  const [hasPexels, setHasPexels] = useState(false);
  const [hasElevenLabs, setHasElevenLabs] = useState(false);
  const [fetchingImages, setFetchingImages] = useState(false);
  const [fetchingVideos, setFetchingVideos] = useState(false);
  const [voiceoverMode, setVoiceoverMode] = useState<'elevenlabs' | 'browser' | 'none'>('none');

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
  const [musicBlob, setMusicBlob] = useState<Blob | null>(null);
  const [musicVolume, setMusicVolume] = useState(0.25);
  const [loadingMusic, setLoadingMusic] = useState(false);

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
  const [generatingVoice, setGeneratingVoice] = useState(false);

  const [renderProgress, setRenderProgress] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoId, setVideoId] = useState('');

  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [youtubeVideoId, setYoutubeVideoId] = useState('');
  const [draftStatus, setDraftStatus] = useState<'loading' | 'saved' | 'saving' | 'empty'>('loading');
  const [draftSavedAt, setDraftSavedAt] = useState<string>('');
  const draftHydratedRef = useRef(false);

  const channel = channels.find((c) => c.id === channelId);

  useEffect(() => {
    const draft = loadStudioDraft();
    if (draft) {
      setStep(draft.step);
      setChannelId(draft.channelId || channels[0]?.id || '');
      setTopic(draft.topic);
      setNiche(draft.niche);
      setTone(draft.tone);
      setDuration(draft.duration);
      setTitle(draft.title);
      setHook(draft.hook);
      setScript(draft.script);
      setCta(draft.cta);
      setScenes(draft.scenes ?? []);
      setCaptionStyle(draft.captionStyle);
      setTransitionStyle(draft.transitionStyle);
      setMotionStyle(draft.motionStyle);
      setUseBroll(draft.useBroll);
      setMusicId(draft.musicId);
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
      setTargetLanguage(draft.targetLanguage);
      setDraftSavedAt(draft.savedAt);
      setDraftStatus('saved');
    } else {
      setDraftStatus('empty');
    }
    draftHydratedRef.current = true;
  }, [channels]);

  const draft = useMemo<StudioDraft>(() => ({
    version: 1,
    savedAt: new Date().toISOString(),
    step,
    channelId,
    topic,
    niche,
    tone,
    duration,
    title,
    hook,
    script,
    cta,
    scenes,
    captionStyle,
    transitionStyle,
    motionStyle,
    useBroll,
    musicId,
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
  }), [step, channelId, topic, niche, tone, duration, title, hook, script, cta, scenes,
    captionStyle, transitionStyle, motionStyle, useBroll, musicId, musicVolume, visualMode,
    selectedStyleId, characterName, characterAppearance, characterArtStyle, characterProfileId,
    watermarkText, watermarkPosition, showSubtitles, captionTextColor, captionHighlightColor,
    beatSync, voiceoverMode, selectedVoice, targetLanguage]);

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
      saveStudioDraft({ ...draft, savedAt });
      setDraftSavedAt(savedAt);
      setDraftStatus('saved');
    }, 650);
    return () => window.clearTimeout(timer);
  }, [draft, topic, title, script, scenes.length]);

  function handleClearDraft() {
    clearStudioDraft();
    setStep('topic');
    setTopic('');
    setTitle('');
    setHook('');
    setScript('');
    setCta('');
    setScenes([]);
    setAudioBlob(null);
    setAudioUrl('');
    setVideoUrl('');
    setVideoId('');
    setPublished(false);
    setYoutubeVideoId('');
    setMusicBlob(null);
    setMusicId('');
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
    (async () => {
      const keys = await getApiKeyKeys();
      // Load visual styles
      const { data: styles } = await supabase.from('visual_styles').select('*');
      setVisualStyles(styles ?? []);
      // Load character profiles
      const { data: chars } = await supabase.from('character_profiles').select('*');
      setCharacterProfiles(chars ?? []);
      setHasOpenAI(!!keys.openai);
      setHasPexels(!!keys.pexels);
      setHasElevenLabs(!!keys.elevenlabs);
      if (keys.elevenlabs) setVoiceoverMode('elevenlabs');
    })();
  }, []);

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
    published,
  }), [step, channelId, topic, script, scenes.length, videoUrl, published]);

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
      const result = await generateScript({ topic, niche, tone, duration });
      setTitle(result.title);
      setHook(result.hook);
      setScript(result.script);
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
    try {
      const v = await listVoices();
      setVoices(v);
      if (v.length > 0 && !selectedVoice) setSelectedVoice(v[0].voice_id);
    } catch {
      // silently fail
    }
  }

  // Pro Features handlers
  async function handleGenerateAllVisuals() {
    if (scenes.length === 0) return;
    setGeneratingVisuals(true);
    try {
      const charDesc = characterName.trim()
        ? `${characterName.trim()}, ${characterAppearance.trim()}`
        : undefined;
      const updatedScenes = [...scenes];
      for (let i = 0; i < updatedScenes.length; i++) {
        const scene = updatedScenes[i];
        const prompt = scene.imagePrompt || scene.visual || scene.text;
        const mode = scene.visualMode || visualMode;
        const result = await generateAIImage({
          prompt,
          mode: (mode === 'auto' || mode === 'real_footage' || mode === 'mixed') ? 'ai_realistic' : mode,
          characterDesc: charDesc,
          sceneContext: scene.text,
        });
        updatedScenes[i] = { ...scene, imageUrl: result.imageUrl, imagePrompt: result.revisedPrompt || prompt };
      }
      setScenes(updatedScenes);
    } catch { /* ignore */ }
    setGeneratingVisuals(false);
  }

  async function handleResearchFootage() {
    if (scenes.length === 0) return;
    setResearchingFootage(true);
    try {
      const results = await researchFootage({ topic: title || script.slice(0, 100), scenes, mode: visualMode });
      const updatedScenes = [...scenes];
      for (const result of results) {
        if (result.sceneIndex < updatedScenes.length) {
          updatedScenes[result.sceneIndex] = {
            ...updatedScenes[result.sceneIndex],
            imageUrl: result.imageUrl ?? updatedScenes[result.sceneIndex].imageUrl,
            videoUrl: result.videoUrl ?? updatedScenes[result.sceneIndex].videoUrl,
          };
        }
      }
      setScenes(updatedScenes);
    } catch { /* ignore */ }
    setResearchingFootage(false);
  }

  async function handleGenerateSEO() {
    if (!script.trim()) return;
    setGeneratingSEOState(true);
    try {
      const result = await generateSEO({
        title: title || 'Untitled',
        script,
        hook: hook || undefined,
        niche: channel?.niche || undefined,
        topic: title,
      });
      setSeoResult(result);
    } catch { /* ignore */ }
    setGeneratingSEOState(false);
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
    if (!topic.trim()) return;
    setGeneratingHooks(true);
    try {
      const hooks = await generateHooks({ topic, niche, tone });
      setHookVariations(hooks);
    } catch { /* ignore */ }
    setGeneratingHooks(false);
  }

  async function handleAnalyzeScript() {
    if (!script.trim()) return;
    setAnalyzingScript(true);
    try {
      const result = await analyzeScript({ script, hook, niche });
      setScriptAnalysis(result);
    } catch { /* ignore */ }
    setAnalyzingScript(false);
  }

  async function handleTranslateSubtitles() {
    if (scenes.length === 0) return;
    setTranslating(true);
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
    } catch { /* ignore */ }
    setTranslating(false);
  }

  async function handleGenerateSceneImage(sceneIndex: number) {
    const scene = scenes[sceneIndex];
    if (!scene) return;
    setGeneratingSceneImage(sceneIndex);
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
      setScenes(prev => prev.map((s, i) => i === sceneIndex ? { ...s, imageUrl: result.imageUrl, imagePrompt: result.revisedPrompt || s.imagePrompt } : s));
    } catch { /* ignore */ }
    setGeneratingSceneImage(null);
  }

  async function handleGenerateVoiceover() {
    setGeneratingVoice(true);
    setError('');
    try {
      if (voiceoverMode === 'browser') {
        const blob = await generateBrowserTTS(script);
        setAudioBlob(blob.size > 0 ? blob : null);
        setAudioUrl(blob.size > 0 ? URL.createObjectURL(blob) : '');
        setStep('render');
      } else if (voiceoverMode === 'elevenlabs') {
        const blob = await generateVoiceover(script, selectedVoice);
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setStep('render');
      } else {
        setAudioBlob(null);
        setAudioUrl('');
        setStep('render');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate voiceover');
    } finally {
      setGeneratingVoice(false);
    }
  }

  async function generateBrowserTTS(text: string): Promise<Blob> {
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
        utterance.onend = () => resolve(new Blob([], { type: 'audio/wav' }));
        utterance.onerror = () => reject(new Error('Browser TTS failed'));
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        reject(err);
      }
    });
  }

  async function handleFetchImages() {
    setFetchingImages(true);
    setError('');
    try {
      const updatedScenes = [...scenes];
      for (let i = 0; i < updatedScenes.length; i++) {
        const scene = updatedScenes[i];
        const query = scene.visual || scene.keywords?.[0] || topic;
        try {
          const images = await searchImages(query, 1);
          if (images.length > 0) {
            updatedScenes[i] = { ...scene, imageUrl: images[0].url, videoUrl: undefined };
          }
        } catch { /* skip */ }
      }
      setScenes(updatedScenes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch images');
    } finally {
      setFetchingImages(false);
    }
  }

  async function handleFetchBroll() {
    setFetchingVideos(true);
    setError('');
    try {
      const updatedScenes = [...scenes];
      for (let i = 0; i < updatedScenes.length; i++) {
        const scene = updatedScenes[i];
        const query = scene.visual || scene.keywords?.[0] || topic;
        try {
          const videos = await searchVideos(query, 1);
          if (videos.length > 0 && videos[0].fileUrl) {
            updatedScenes[i] = { ...scene, videoUrl: videos[0].fileUrl, imageUrl: videos[0].preview };
          }
        } catch { /* skip */ }
      }
      setScenes(updatedScenes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch video clips');
    } finally {
      setFetchingVideos(false);
    }
  }

  async function handleLoadMusic(trackId: string) {
    setMusicId(trackId);
    if (!trackId) {
      setMusicBlob(null);
      return;
    }
    const track = MUSIC_TRACKS.find(t => t.id === trackId);
    if (!track) return;
    setLoadingMusic(true);
    try {
      const res = await fetch(track.url);
      if (!res.ok) throw new Error('Failed to load music');
      const blob = await res.blob();
      setMusicBlob(blob);
    } catch {
      setMusicBlob(null);
      setMusicId('');
    } finally {
      setLoadingMusic(false);
    }
  }

  async function handleRender() {
    setRendering(true);
    setRenderProgress(0);
    setError('');
    try {
      const { videoBlob, duration: renderedDuration } = await renderVideo(scenes, audioBlob, {
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

      const fileName = `videos/${channelId}/${Date.now()}.webm`;
      const url = await uploadMedia(videoBlob, fileName);
      setVideoUrl(url);

      const { data } = await supabase.from('videos').insert({
        title,
        channel_id: channelId,
        description: script,
        script,
        hook,
        cta,
        scenes,
        duration_seconds: Math.round(renderedDuration),
        status: 'rendered',
        video_url: url,
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
      setVideoId(data?.id ?? '');
      setStep('publish');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to render video');
    } finally {
      setRendering(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setError('');
    try {
      const ytId = await publishToYouTube(channelId, videoId);
      setYoutubeVideoId(ytId);
      setPublished(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to publish');
    } finally {
      setPublishing(false);
    }
  }

  async function handleConnectYouTube() {
    try {
      const authUrl = await getYouTubeAuthUrl(channelId);
      window.open(authUrl, 'youtube-auth', 'width=600,height=700');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start YouTube connection');
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

      {/* Step 1: Topic */}
      {step === 'topic' && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">{t('studio.whatAbout')}</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-700">{t('studio.channel')}</label>
              <select value={channelId} onChange={(e) => setChannelId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400">
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
              <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={6}
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
                        disabled={generatingSceneImage === i}
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
                {TRANSITION_STYLES.map((t) => (
                  <button key={t.key} onClick={() => setTransitionStyle(t.key)}
                    className={classNames(
                      'rounded-lg border px-3 py-2 text-sm transition-colors',
                      transitionStyle === t.key ? 'border-slate-900 bg-slate-50 font-medium text-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                    )}>
                    {t.label}
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
                      const { data } = await supabase.from('character_profiles').insert({
                        name: characterName.trim(), appearance: characterAppearance.trim(),
                        art_style: visualMode === 'ai_cartoon' ? 'cartoon' : visualMode === 'ai_anime' ? 'anime' : 'realistic',
                      }).select().single();
                      if (data) { setCharacterProfileId(data.id); setCharacterProfiles([...characterProfiles, data]); }
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
                {(visualMode === 'ai_cartoon' || visualMode === 'ai_realistic' || visualMode === 'ai_anime' || visualMode === 'ai_horror' || visualMode === 'auto' || visualMode === 'mixed') && (
                  <Button size="sm" onClick={handleGenerateAllVisuals} disabled={generatingVisuals || scenes.length === 0}>
                    {generatingVisuals ? <><Loader2 size={14} className="animate-spin" /> {t('studio.generatingVisuals')}</> : <><Sparkles size={14} /> {t('studio.generateVisuals')}</>}
                  </Button>
                )}
                {(visualMode === 'real_footage' || visualMode === 'mixed') && (
                  <Button size="sm" variant="secondary" onClick={handleResearchFootage} disabled={researchingFootage || scenes.length === 0}>
                    {researchingFootage ? <><Loader2 size={14} className="animate-spin" /> {t('studio.researchingFootage')}</> : <><Search size={14} /> {t('studio.researchFootage')}</>}
                  </Button>
                )}
              </div>

              {/* AI Hook Generator */}
              <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/30 p-3">
                <p className="flex items-center gap-1 text-sm font-medium text-slate-700"><Wand2 size={14} /> {t('studio.hookGenerator')}</p>
                <p className="text-xs text-slate-500">{t('studio.hookGeneratorDesc')}</p>
                <button onClick={handleGenerateHooks} disabled={generatingHooks || !topic.trim()}
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
                <button onClick={handleAnalyzeScript} disabled={analyzingScript || !script.trim()}
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
                  <input value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)}
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
                <Button size="sm" variant="secondary" onClick={handleGenerateSEO} disabled={generatingSEOState || !script.trim()}>
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
                onClick={() => setVoiceoverMode('elevenlabs')}
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
                onClick={() => setVoiceoverMode('browser')}
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
                onClick={() => setVoiceoverMode('none')}
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
                        onClick={() => setSelectedVoice(v.voice_id)}
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
          <p className="mb-4 text-sm text-slate-500">
            {t('studio.renderDesc', { caption: captionStyle, transition: transitionStyle, motion: motionStyle, audio: audioBlob ? ' + ' + t('studio.voiceoverPreview').toLowerCase() : '', music: musicBlob ? ' + ' + t('studio.bgMusic').toLowerCase() : '' })}
          </p>
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
              {audioUrl && (
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{t('studio.voiceoverPreview')}</p>
                  <audio src={audioUrl} controls className="w-full" />
                </div>
              )}
              <div className="flex justify-between gap-2">
                <Button variant="secondary" onClick={() => setStep('voice')}><ArrowLeft size={16} /> {t('studio.back')}</Button>
                <Button onClick={handleRender}><Film size={16} /> {t('studio.renderVideo')}</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Step 6: Publish */}
      {step === 'publish' && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">{t('studio.publishToYouTube')}</h2>
          {published ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Check size={32} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{t('studio.published')}</h3>
                <p className="mt-1 text-sm text-slate-500">{t('studio.publishedDesc')}</p>
                {youtubeVideoId && (
                  <a href={`https://www.youtube.com/watch?v=${youtubeVideoId}`} target="_blank" rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline">
                    <Youtube size={16} /> {t('studio.viewOnYouTube')}
                  </a>
                )}
              </div>
              <Button variant="secondary" onClick={handleClearDraft}>
                {t('studio.createAnother')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {videoUrl && (
                <div className="overflow-hidden rounded-lg bg-slate-900">
                  <video src={videoUrl} controls className="mx-auto max-h-96" />
                </div>
              )}
              <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                <p className="flex items-center gap-2"><Youtube size={16} /> {t('settings.youtubeDesc')}</p>
              </div>
              <div className="flex justify-between gap-2">
                <Button variant="secondary" onClick={() => setStep('render')}><ArrowLeft size={16} /> {t('studio.back')}</Button>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={handleConnectYouTube}>
                    {t('studio.connectYouTube')}
                  </Button>
                  <Button onClick={handlePublish} disabled={publishing}>
                    {publishing ? <><Loader2 size={16} className="animate-spin" /> {t('studio.publishing')}</> : <><Youtube size={16} /> {t('studio.publishToYouTube')}</>}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
