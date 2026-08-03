import type { DirectorReport } from '@/core/director';
import type { AudioSegment, MediaScene, RenderManifest, SubtitleCue, TransitionType } from '@/core/media';
import type { BrollPlan, SplitProposal, TransitionPlan, TrimProposal } from './types';
import { clamp, stableId } from './utils';

export function planAutoTrim(scene: MediaScene, manifest: RenderManifest, maximumTrimPercent = 0.3): TrimProposal {
  const cues = manifest.subtitles.cues.filter((cue) => cue.sceneId === scene.id);
  const voice = manifest.audio.voice.filter((item) => item.sceneId === scene.id);
  const mediaEnd = Math.max(scene.startMs, ...cues.map((cue) => cue.endMs), ...voice.map((item) => item.endMs));
  const safetyMarginMs = 180 + Math.min(300, scene.transition.durationMs);
  const desired = Math.min(scene.durationMs * maximumTrimPercent, Math.max(0, scene.endMs - mediaEnd - safetyMarginMs));
  const minimum = scene.role === 'hook' ? 1_800 : scene.role === 'cta' ? 1_500 : 1_000;
  const removable = Math.max(0, Math.min(desired, scene.durationMs - minimum));
  const blockers = removable <= 0 ? ['Voice/subtitle tail or minimum scene duration blocks trimming.'] : [];
  return { originalStartMs: scene.startMs, originalEndMs: scene.endMs, proposedStartMs: scene.startMs,
    proposedEndMs: Math.round(scene.endMs - removable), removedDurationMs: Math.round(removable), safetyMarginMs,
    blockingReasons: blockers, confidence: blockers.length ? 30 : 84 };
}

export function planSceneSplit(scene: MediaScene, manifest: RenderManifest): SplitProposal {
  const minimum = 1_000; const midpoint = scene.startMs + scene.durationMs / 2;
  const cueBoundaries = manifest.subtitles.cues.filter((cue) => cue.sceneId === scene.id)
    .map((cue) => cue.endMs).filter((time) => time - scene.startMs >= minimum && scene.endMs - time >= minimum);
  const sentenceRatio = sentenceBoundaryRatio(scene.text);
  const sentencePoint = scene.startMs + scene.durationMs * sentenceRatio;
  const candidates = [...cueBoundaries, sentencePoint].filter((time) => time - scene.startMs >= minimum && scene.endMs - time >= minimum);
  const splitAtMs = candidates.sort((a, b) => Math.abs(a - midpoint) - Math.abs(b - midpoint) || a - b)[0] ?? null;
  return { sceneId: scene.id, splitAtMs: splitAtMs === null ? null : Math.round(splitAtMs), childSceneIds: splitAtMs === null ? [] : [stableId(`${scene.id}-part`, '1'), stableId(`${scene.id}-part`, '2')], blockingReasons: splitAtMs === null ? ['No safe sentence or subtitle boundary found.'] : [], confidence: splitAtMs === null ? 25 : 78 };
}

export function planBroll(scene: MediaScene): BrollPlan {
  const tokens = (scene.keywords.length ? scene.keywords : scene.text.toLocaleLowerCase('tr-TR').match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 6);
  return { targetSceneId: scene.id, startMs: scene.startMs, endMs: scene.endMs, intent: scene.visualPrompt || scene.text,
    searchQuery: tokens.join(' '), preferredAssetTypes: ['video', 'broll', 'image'], motionRecommendation: scene.cameraMotion === 'none' ? 'ken-burns' : scene.cameraMotion,
    visualStyle: scene.intensity > 65 ? 'dynamic' : 'natural', avoidTerms: ['watermark', 'logo'], mode: scene.assetIds.length ? 'overlay' : 'replacement', confidence: 76, expectedImpact: 8 };
}

export function planMotion(scene: MediaScene, previous?: MediaScene): string {
  if (scene.durationMs < 1_200) return 'quick-cut';
  if (scene.role === 'hook') return scene.cameraMotion === 'zoom_in' ? 'text-emphasis' : 'punch-in';
  if (scene.intensity < 35) return 'ken-burns';
  const options = ['zoom-in', 'pan-left', 'pan-right', 'text-emphasis'] as const;
  return options.find((item) => item.replace('-', '_') !== previous?.cameraMotion) ?? 'text-emphasis';
}

export function planTransitions(scenes: readonly MediaScene[]): TransitionPlan[] {
  const supported: readonly TransitionType[] = ['cut', 'fade', 'crossfade', 'slide', 'zoom', 'blur'];
  return scenes.slice(1).map((scene, index) => {
    const previous = scenes[index]; const intensityDelta = Math.abs(scene.intensity - previous.intensity);
    const type: TransitionType = intensityDelta > 45 ? 'zoom' : scene.role === 'cta' ? 'fade' : 'cut';
    return { fromSceneId: previous.id, toSceneId: scene.id, type: supported.includes(type) ? type : 'cut', durationMs: type === 'cut' ? 0 : clamp(180 + intensityDelta * 3, 180, 500), confidence: 74 };
  });
}

export function optimizeSubtitleCues(manifest: RenderManifest): SubtitleCue[] {
  const sceneMap = new Map(manifest.timeline.scenes.map((scene) => [scene.id, scene]));
  return manifest.subtitles.cues.flatMap((cue) => { const scene = sceneMap.get(cue.sceneId); if (!scene) return [];
    const startMs = clamp(cue.startMs, scene.startMs, scene.endMs - 1); const endMs = clamp(cue.endMs, startMs + 1, scene.endMs);
    return [{ ...cue, startMs, endMs, durationMs: endMs - startMs }]; });
}

export function optimizeAudioSegments(manifest: RenderManifest): AudioSegment[] {
  const sceneMap = new Map(manifest.timeline.scenes.map((scene) => [scene.id, scene]));
  return [...manifest.audio.voice, ...manifest.audio.music, ...manifest.audio.sfx].map((segment) => {
    const scene = segment.sceneId ? sceneMap.get(segment.sceneId) : undefined; if (!scene) return { ...segment };
    const startMs = clamp(segment.startMs, scene.startMs, scene.endMs - 1); const endMs = clamp(segment.endMs, startMs + 1, scene.endMs);
    return { ...segment, startMs, endMs, durationMs: endMs - startMs };
  });
}

export function planReorder(report: DirectorReport, scenes: readonly MediaScene[]): readonly string[] {
  const original = scenes.map((scene) => scene.id); const hook = scenes.find((scene) => scene.role === 'hook'); const cta = scenes.find((scene) => scene.role === 'cta');
  const movable = scenes.filter((scene) => scene !== hook && scene !== cta).sort((a, b) => {
    const ar = report.sceneRanking.scenes.find((rank) => rank.sceneId === a.id)?.absoluteRank ?? a.index;
    const br = report.sceneRanking.scenes.find((rank) => rank.sceneId === b.id)?.absoluteRank ?? b.index;
    return ar - br || a.index - b.index || a.id.localeCompare(b.id);
  });
  const ordered = [...(hook ? [hook] : []), ...movable, ...(cta ? [cta] : [])].map((scene) => scene.id);
  return ordered.length === original.length ? ordered : original;
}

function sentenceBoundaryRatio(text: string): number { const match = /[.!?](?:\s|$)/u.exec(text); return match && text.length ? clamp((match.index + 1) / text.length, 0.25, 0.75) : 0.5; }
