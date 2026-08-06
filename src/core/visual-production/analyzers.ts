import type { MediaAsset, MediaScene, RenderManifest } from '@/core/media';
import type { BrollOpportunity, ColorGradePlan, VisualProductionPlan, VisualSceneAnalysis } from './types';
import { resolveColorGrade } from './colorGradeProfiles';

const clamp = (value: number) => Math.round(Math.max(0, Math.min(100, value)));
const num = (asset: MediaAsset | undefined, key: string, fallback: number) => { const value = asset?.metadata[key]; return typeof value === 'number' && Number.isFinite(value) ? value : fallback; };
const bool = (asset: MediaAsset | undefined, key: string, fallback = false) => typeof asset?.metadata[key] === 'boolean' ? asset.metadata[key] as boolean : fallback;
const abstractVisualKeywords = new Set(['why', 'how', 'because', 'idea', 'data', 'result', 'neden', 'nasıl', 'çünkü', 'sonuç']);

export function normalizeVisualAnalyzerText(value: string): string { return value.normalize('NFKC').toLocaleLowerCase('tr-TR'); }
export function matchesAbstractVisualKeyword(value: string): boolean { return normalizeVisualAnalyzerText(value).split(/[^\p{L}\p{N}]+/u).some((token) => abstractVisualKeywords.has(token)); }

export function analyzeScenes(manifest: RenderManifest, signal?: AbortSignal): VisualSceneAnalysis[] {
  return manifest.timeline.scenes.map((scene, index, scenes) => {
    if (signal?.aborted) throw abortError();
    const asset = scene.assetIds.map((id) => manifest.assets.find((item) => item.id === id)).find(Boolean);
    const faceX = num(asset, 'faceX', .5), faceY = num(asset, 'faceY', .38), focalX = num(asset, 'focalX', .5);
    const brightness = num(asset, 'brightness', .5), contrast = num(asset, 'contrast', .55), sharpness = num(asset, 'sharpness', .55);
    const shake = num(asset, 'shake', 0), compression = num(asset, 'compressionArtifacts', 0), saturation = num(asset, 'saturation', .5);
    const thirds = 100 - Math.min(Math.abs(faceX - 1 / 3), Math.abs(faceX - 2 / 3)) * 180;
    const headroom = 100 - Math.abs(faceY - .34) * 180;
    const leadRoom = scene.cameraMotion === 'pan_left' ? focalX * 100 : scene.cameraMotion === 'pan_right' ? (1 - focalX) * 100 : 82;
    const cropSafety = bool(asset, 'subjectClipped') ? 25 : 92;
    const aspectSafety = num(asset, 'aspectSafety', manifest.render.height >= manifest.render.width ? 90 : 70);
    const composition = clamp((thirds + headroom + leadRoom + cropSafety + aspectSafety) / 5);
    const staticScene = scene.cameraMotion === 'none';
    const movement = staticScene ? 35 : 82;
    const motion = clamp((staticScene ? 88 : 82) - (staticScene ? 0 : shake * 65) - (index && !staticScene && scene.cameraMotion === scenes[index - 1].cameraMotion ? 5 : 0));
    const previousAsset = index ? scenes[index - 1].assetIds.map((id) => manifest.assets.find((item) => item.id === id)).find(Boolean) : asset;
    const continuity = clamp(100 - Math.abs(brightness - num(previousAsset, 'brightness', brightness)) * 90 - Math.abs(saturation - num(previousAsset, 'saturation', saturation)) * 55 - Math.abs(num(asset, 'whiteBalance', .5) - num(previousAsset, 'whiteBalance', .5)) * 65);
    const quality = clamp(100 - compression * 55 - shake * 20 - Math.abs(sharpness - .58) * 65 - (brightness < .22 ? 35 : 0) - (brightness > .86 ? 35 : 0) - (contrast < .25 ? 25 : 0) - (bool(asset, 'lumaClipping') ? 30 : 0));
    const inHook = scene.startMs < 3000;
    const hook = clamp(inHook ? movement * .3 + composition * .3 + Math.abs(brightness - num(previousAsset, 'brightness', brightness)) * 100 * .2 + num(asset, 'visualNovelty', .55) * 100 * .2 : 70);
    const textContrast = num(asset, 'textContrast', contrast >= .45 ? .8 : .45);
    const fontSize = manifest.subtitles.style.fontSize;
    const readability = clamp(textContrast * 65 + Math.min(1, fontSize / 42) * 25 + (bool(asset, 'subtitleBackgroundConflict') ? 0 : 10));
    const risks: string[] = [];
    if (!staticScene && shake > .2) risks.push('unstable-motion');
    if (sharpness < .3) risks.push('blur-risk'); if (compression > .5) risks.push('compression-artifact-risk'); if (sharpness > .88) risks.push('over-sharpen');
    if (brightness < .22) risks.push('under-exposure'); if (brightness > .86) risks.push('over-exposure'); if (contrast < .25) risks.push('low-contrast'); if (bool(asset, 'lumaClipping')) risks.push('clipping-risk');
    return { sceneId: scene.id, composition, motion, continuity, quality, hook, readability, risks, evidence: [
      { rule: 'rule-of-thirds', value: Math.round(faceX * 100) / 100, threshold: 'focal x near 0.33 or 0.67', explanation: `Focal position yields ${clamp(thirds)}.` },
      { rule: 'headroom', value: Math.round(faceY * 100) / 100, threshold: 'face y near 0.34', explanation: `Headroom yields ${clamp(headroom)}.` },
      { rule: 'motion-stability', value: shake, threshold: 'shake <= 0.20', explanation: `Declared shake metadata reduces motion score deterministically.` },
      { rule: 'exposure', value: brightness, threshold: '0.22..0.86', explanation: 'Normalized luminance outside the range is exposure risk.' },
      { rule: 'text-contrast', value: textContrast, threshold: '>= 0.65', explanation: 'Subtitle contrast and size determine readability.' },
    ] };
  });
}

export function analyzeBroll(manifest: RenderManifest, scenes: readonly VisualSceneAnalysis[]): BrollOpportunity[] { return scenes.flatMap((analysis, index) => { const scene = manifest.timeline.scenes[index]; const abstract = matchesAbstractVisualKeyword(`${scene.text} ${scene.visualPrompt}`); const staticLong = scene.cameraMotion === 'none' && scene.durationMs >= 2800; const score = clamp((abstract ? 45 : 0) + (staticLong ? 40 : 0) + (analysis.composition < 60 ? 15 : 0)); return score >= 55 ? [{ sceneId: scene.id, mode: abstract ? 'cutaway' as const : analysis.readability < 60 ? 'overlay' as const : 'insert' as const, score, reason: abstract ? 'Abstract narration benefits from concrete supporting imagery.' : 'A long static shot benefits from a visual pattern interrupt.' }] : []; }); }
export function planGrade(scenes: readonly VisualSceneAnalysis[], manifest: RenderManifest): ColorGradePlan { const quality = average(scenes.map((x) => x.quality)); const hook = manifest.timeline.scenes.some((x) => x.role === 'hook'); const style = hook ? 'social' : quality < 65 ? 'documentary' : 'cinematic'; const intensity = quality < 65 ? .35 : .2; const parameters = resolveColorGrade(style, intensity)!; return { style, intensity, reason: `${style} preserves continuity while matching ${hook ? 'short-form hook energy' : 'the current visual tone'}.`, parameters: { brightness: parameters.brightness, contrast: parameters.contrast, saturation: parameters.saturation, gamma: parameters.gamma } }; }
export function scores(scenes: readonly VisualSceneAnalysis[]): VisualProductionPlan['scores'] { const metric = (key: keyof Omit<VisualSceneAnalysis, 'sceneId' | 'risks' | 'evidence'>) => average(scenes.map((x) => x[key])); const result = { composition: metric('composition'), motion: metric('motion'), continuity: metric('continuity'), quality: metric('quality'), hook: metric('hook'), readability: metric('readability') }; return { overall: average(Object.values(result)), ...result }; }
function average(values: readonly number[]): number { return values.length ? clamp(values.reduce((a, b) => a + b, 0) / values.length) : 0; }
function abortError(): Error { const error = new Error('Visual production analysis aborted.'); error.name = 'AbortError'; return error; }
