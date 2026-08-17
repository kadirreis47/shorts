import type { AssetResolutionReport } from './assetProviderTypes';
import { resolveAudioNarrationMode } from './audioTypes';
import type {
  MediaAsset,
  MediaProject,
  MediaScene,
  RenderManifest,
} from './types';
import { mediaStorageIdentityFromMetadata, privateStorageSource } from './storageIdentity';
import type {
  MediaValidationCategory,
  MediaValidationIssue,
  MediaValidationReport,
  MediaValidationScoreBreakdown,
  MediaValidationSeverity,
} from './validationTypes';

interface ValidateMediaProjectInput {
  project: MediaProject;
  manifest: RenderManifest;
  assetResolution: AssetResolutionReport;
}

export function validateMediaProject(
  input: ValidateMediaProjectInput,
): MediaValidationReport {
  const { project, manifest, assetResolution } = input;
  const issues: MediaValidationIssue[] = [];

  validateProject(project, issues);
  validateTimeline(project, issues);
  validateAssets(project, assetResolution, issues);
  validateSubtitles(project, issues);
  validateAudio(project, issues);
  validateRenderManifest(manifest, issues);

  const scoreBreakdown: MediaValidationScoreBreakdown = {
    project: scoreCategory('project', issues),
    timeline: scoreCategory('timeline', issues),
    assets: scoreCategory('assets', issues),
    subtitles: scoreCategory('subtitles', issues),
    audio: scoreCategory('audio', issues),
    render: scoreCategory('render', issues),
  };

  const score = Math.round(
    Object.values(scoreBreakdown).reduce((total, value) => total + value, 0) /
      Object.keys(scoreBreakdown).length,
  );

  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.filter((issue) => issue.severity === 'warning').length;
  const infoCount = issues.filter((issue) => issue.severity === 'info').length;
  const valid = errorCount === 0;

  return {
    valid,
    renderReady: valid && score >= 70,
    score,
    scoreBreakdown,
    issues,
    errorCount,
    warningCount,
    infoCount,
    validatedAt: new Date().toISOString(),
  };
}

function validateProject(
  project: MediaProject,
  issues: MediaValidationIssue[],
): void {
  if (project.scenes.length === 0) {
    addIssue(issues, 'PROJECT_HAS_NO_SCENES', 'project', 'error', 'Medya projesinde sahne bulunmuyor.');
  }

  if (!project.metadata.title.trim()) {
    addIssue(issues, 'PROJECT_TITLE_EMPTY', 'project', 'warning', 'Proje başlığı boş.');
  }

  if (project.timeline.durationMs <= 0) {
    addIssue(issues, 'PROJECT_DURATION_INVALID', 'project', 'error', 'Proje süresi geçersiz.');
  }
}

function validateTimeline(
  project: MediaProject,
  issues: MediaValidationIssue[],
): void {
  const { scenes, metrics } = project.timeline;

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];

    if (scene.durationMs <= 0 || scene.endMs <= scene.startMs) {
      addIssue(
        issues,
        'SCENE_DURATION_INVALID',
        'timeline',
        'error',
        `Sahne ${index + 1} için zaman aralığı geçersiz.`,
        scene.id,
      );
    }

    const previous = index > 0 ? scenes[index - 1] : null;
    if (previous && scene.startMs < previous.startMs) {
      addIssue(
        issues,
        'SCENE_ORDER_INVALID',
        'timeline',
        'error',
        `Sahne ${index + 1} zaman çizelgesinde sırasız.`,
        scene.id,
      );
    }
  }

  if (metrics.pacingScore < 45) {
    addIssue(
      issues,
      'PACING_SCORE_LOW',
      'timeline',
      'warning',
      `Kurgu tempo puanı düşük (${metrics.pacingScore}/100).`,
    );
  }

  if (metrics.cutsPerMinute < 4) {
    addIssue(
      issues,
      'CUT_RATE_LOW',
      'timeline',
      'info',
      'Shorts formatı için dakika başına kesme sayısı düşük olabilir.',
    );
  }
}

function validateAssets(
  project: MediaProject,
  report: AssetResolutionReport,
  issues: MediaValidationIssue[],
): void {
  const sceneCount = Math.max(project.scenes.length, 1);
  const coverage = report.resolvedCount / sceneCount;
  const scenesById = new Map(project.scenes.map((scene) => [scene.id, scene]));

  for (const resolution of report.resolutions) {
    if (!resolution.asset) {
      const scene = scenesById.get(resolution.sceneId);
      if (scene && supportsBuiltInComposition(scene)) continue;
      addIssue(
        issues,
        'SCENE_ASSET_UNRESOLVED',
        'assets',
        'error',
        'Sahne için görsel veya video varlığı çözümlenemedi.',
        resolution.sceneId,
        { queries: resolution.query.queries },
      );
    } else if (!hasCanonicalAssetSource(resolution.asset)) {
      addIssue(
        issues,
        'SCENE_MEDIA_SOURCE_INVALID',
        'assets',
        'error',
        'Sahne medyasÄ± desteklenen kalÄ±cÄ± bir kaynak deÄŸil.',
        resolution.sceneId,
      );
    }
  }

  if (coverage < 1 && coverage >= 0.8) {
    addIssue(
      issues,
      'ASSET_COVERAGE_INCOMPLETE',
      'assets',
      'warning',
      `Asset kapsama oranı %${Math.round(coverage * 100)}.`,
    );
  }

  if (report.duplicateCandidatesRejected > 0) {
    addIssue(
      issues,
      'DUPLICATE_ASSETS_REJECTED',
      'assets',
      'info',
      `${report.duplicateCandidatesRejected} tekrar eden asset adayı elendi.`,
    );
  }
}

/**
 * Studio's default/auto mode deliberately renders a deterministic FFmpeg
 * colour composition when no provider media is selected. This is canonical:
 * its scene order, duration and colour are all derived from the manifest.
 * Explicit provider/AI modes still require a concrete canonical asset.
 */
function supportsBuiltInComposition(scene: MediaScene): boolean {
  const source = scene.sourceScene;
  const hasDeclaredMedia = Boolean(
    source.imageStorage || source.videoStorage || source.imageUrl || source.videoUrl,
  );
  return !hasDeclaredMedia && (source.visualMode == null || source.visualMode === 'auto');
}

function hasCanonicalAssetSource(asset: MediaAsset): boolean {
  const storageIdentity = mediaStorageIdentityFromMetadata(asset.metadata);
  if (storageIdentity) return asset.source === privateStorageSource(storageIdentity);
  if (isTrustedPexelsMediaUrl(asset.source)) return true;
  return isLocalMediaPath(asset.source);
}

function isTrustedPexelsMediaUrl(source: string): boolean {
  try {
    const url = new URL(source);
    return url.protocol === 'https:' && (
      url.hostname === 'images.pexels.com' || url.hostname === 'videos.pexels.com'
    );
  } catch {
    return false;
  }
}

function isLocalMediaPath(source: string): boolean {
  return /^[a-z]:[\\/]/i.test(source) || source.startsWith('file:///');
}

function validateSubtitles(
  project: MediaProject,
  issues: MediaValidationIssue[],
): void {
  const { subtitles } = project;

  // Studio's canonical subtitle toggle intentionally produces an empty
  // subtitle track. Legacy timelines without this field retain prior checks.
  if (subtitles.enabled === false) return;

  if (subtitles.cues.length === 0) {
    addIssue(issues, 'SUBTITLE_CUES_EMPTY', 'subtitles', 'error', 'Altyazı cue listesi boş.');
    return;
  }

  if (subtitles.metrics.coverage < 0.95) {
    addIssue(
      issues,
      'SUBTITLE_COVERAGE_LOW',
      'subtitles',
      subtitles.metrics.coverage < 0.8 ? 'error' : 'warning',
      `Altyazı kapsama oranı %${Math.round(subtitles.metrics.coverage * 100)}.`,
    );
  }

  if (subtitles.metrics.readingSpeedWpm > 230) {
    addIssue(
      issues,
      'SUBTITLE_READING_SPEED_HIGH',
      'subtitles',
      'warning',
      `Altyazı okuma hızı yüksek (${Math.round(subtitles.metrics.readingSpeedWpm)} WPM).`,
    );
  }

  if (subtitles.source === 'estimated') {
    addIssue(
      issues,
      'SUBTITLE_ALIGNMENT_ESTIMATED',
      'subtitles',
      'info',
      'Altyazı zamanlaması tahmini; gerçek kelime timestamp verisi kaliteyi artırır.',
    );
  }
}

function validateAudio(
  project: MediaProject,
  issues: MediaValidationIssue[],
): void {
  const { audio } = project;
  const narrationRequired = resolveAudioNarrationMode(audio) === 'required';

  if (narrationRequired && audio.voice.length === 0) {
    addIssue(issues, 'VOICE_TRACK_EMPTY', 'audio', 'error', 'Seslendirme segmenti bulunmuyor.');
  }

  if (narrationRequired && audio.metrics.voiceCoverage < 0.9) {
    addIssue(
      issues,
      'VOICE_COVERAGE_LOW',
      'audio',
      audio.metrics.voiceCoverage < 0.7 ? 'error' : 'warning',
      `Seslendirme kapsama oranı %${Math.round(audio.metrics.voiceCoverage * 100)}.`,
    );
  }

  if (audio.metrics.peakConcurrentLayers > 4) {
    addIssue(
      issues,
      'AUDIO_LAYER_DENSITY_HIGH',
      'audio',
      'warning',
      `Aynı anda ${audio.metrics.peakConcurrentLayers} ses katmanı çalıyor.`,
    );
  }

  if (
    audio.metrics.estimatedIntegratedLufs > -10 ||
    audio.metrics.estimatedIntegratedLufs < -20
  ) {
    addIssue(
      issues,
      'AUDIO_LOUDNESS_OUT_OF_RANGE',
      'audio',
      'warning',
      `Tahmini ses yüksekliği ${audio.metrics.estimatedIntegratedLufs.toFixed(1)} LUFS.`,
    );
  }
}

function validateRenderManifest(
  manifest: RenderManifest,
  issues: MediaValidationIssue[],
): void {
  if (manifest.render.fps < 24) {
    addIssue(issues, 'RENDER_FPS_LOW', 'render', 'warning', 'Render FPS değeri 24 altı.');
  }

  if (manifest.render.width < 720 || manifest.render.height < 1280) {
    addIssue(
      issues,
      'RENDER_RESOLUTION_LOW',
      'render',
      'warning',
      'Dikey kısa video için render çözünürlüğü düşük.',
    );
  }

  if (manifest.render.height <= manifest.render.width) {
    addIssue(
      issues,
      'RENDER_NOT_VERTICAL',
      'render',
      'error',
      'Shorts/Reels çıktısı için dikey çözünürlük gerekli.',
    );
  }
}

function scoreCategory(
  category: MediaValidationCategory,
  issues: MediaValidationIssue[],
): number {
  const categoryIssues = issues.filter((issue) => issue.category === category);
  const deduction = categoryIssues.reduce((total, issue) => {
    if (issue.severity === 'error') return total + 35;
    if (issue.severity === 'warning') return total + 12;
    return total + 2;
  }, 0);

  return Math.max(0, Math.min(100, 100 - deduction));
}

function addIssue(
  issues: MediaValidationIssue[],
  code: string,
  category: MediaValidationCategory,
  severity: MediaValidationSeverity,
  message: string,
  sceneId?: string,
  metadata: Readonly<Record<string, unknown>> = {},
): void {
  issues.push({
    id: `${code.toLowerCase()}-${issues.length + 1}`,
    code,
    category,
    severity,
    message,
    sceneId,
    metadata,
  });
}
