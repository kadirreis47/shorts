import { calculateAudioMetrics, calculateSubtitleMetrics, calculateTimelineMetrics, normalizeTransitionOverlap, type AudioSegment, type MediaClip, type MediaScene, type RenderManifest, type SubtitleCue, type TimelineMarker } from '@/core/media';
import type { EditOperation, EditPlan, EditPreview, SceneChangeSummary, TimelineSnapshot } from './types';
import { deriveEffectiveEditPlan } from './editPlanCompiler';
import { createManifestRevisionId, MANIFEST_FINGERPRINT_VERSION } from './manifestFingerprint';
import { assertNotAborted, deepClone, stableId } from './utils';

export function createTimelineSnapshot(manifest: RenderManifest, revisionId: string, parentRevisionId: string | null = null, createdAt = manifest.createdAt): TimelineSnapshot {
  return { projectId: manifest.projectId, revisionId, manifestFingerprint: createManifestRevisionId(manifest), fingerprintVersion: MANIFEST_FINGERPRINT_VERSION, parentRevisionId, createdAt, manifest: deepClone(manifest) };
}

export function isTimelineSnapshotCurrent(snapshot: TimelineSnapshot, manifest: RenderManifest): boolean {
  const fingerprint = createManifestRevisionId(manifest);
  return snapshot.fingerprintVersion === MANIFEST_FINGERPRINT_VERSION && snapshot.projectId === manifest.projectId && snapshot.manifest.projectId === manifest.projectId &&
    snapshot.manifestFingerprint === fingerprint && createManifestRevisionId(snapshot.manifest) === fingerprint;
}

export function isTimelineSnapshotInternallyValid(snapshot: TimelineSnapshot): boolean {
  return snapshot.fingerprintVersion === MANIFEST_FINGERPRINT_VERSION &&
    snapshot.projectId === snapshot.manifest.projectId &&
    snapshot.manifestFingerprint === createManifestRevisionId(snapshot.manifest);
}

export function transformTimeline(snapshot: TimelineSnapshot, plan: EditPlan, enabledIds?: readonly string[], signal?: AbortSignal): { snapshot: TimelineSnapshot; applied: string[]; skipped: string[]; changes: SceneChangeSummary[] } {
  assertNotAborted(signal); if (snapshot.projectId !== plan.projectId || snapshot.revisionId !== plan.sourceRevisionId) throw new Error('Stale timeline revision; create a new edit plan.');
  const manifest = deepClone(snapshot.manifest); const before = new Map(manifest.timeline.scenes.map((scene) => [scene.id, deepClone(scene)])); const applied: string[] = []; const skipped: string[] = [];
  const allowed = new Set(enabledIds ?? plan.operations.filter((item) => item.status !== 'disabled').map((item) => item.id));
  for (const operation of plan.operations) { assertNotAborted(signal); if (!allowed.has(operation.id) || operation.status === 'disabled' || operation.dependencies.some((dependency) => !applied.includes(dependency))) { skipped.push(operation.id); continue; }
    if (applyOperation(manifest, operation)) applied.push(operation.id); else skipped.push(operation.id); }
  if (!manifest.timeline.scenes.length) throw new Error('Editing cannot produce an empty video.');
  retimeManifest(manifest); manifest.validation = null; validateManifest(manifest);
  const resultFingerprint = createManifestRevisionId(manifest);
  const revisionId = stableId('revision', `${snapshot.revisionId}|${applied.join('|')}|${resultFingerprint}`);
  const next = createTimelineSnapshot(manifest, revisionId, snapshot.revisionId, plan.createdAt); return { snapshot: next, applied, skipped, changes: summarize(before, manifest.timeline.scenes) };
}

export function createEditPreview(plan: EditPlan, snapshot: TimelineSnapshot, enabledIds?: readonly string[], signal?: AbortSignal): EditPreview {
  const effective = deriveEffectiveEditPlan(plan); const result = transformTimeline(snapshot, effective, enabledIds, signal); const beforeIds = snapshot.manifest.timeline.scenes.map((scene) => scene.id); const afterIds = result.snapshot.manifest.timeline.scenes.map((scene) => scene.id);
  const rerenderSceneIds = result.changes.map((item) => item.sceneId); const critical = effective.diagnostics.conflicts.filter((item) => item.severity === 'critical');
  return { id: stableId('preview', `${effective.id}|${result.snapshot.revisionId}|${effective.operations.map((item) => `${item.id}:${item.status}`).join('|')}`), projectId: effective.projectId, planId: effective.id, sourceRevisionId: snapshot.revisionId, createdAt: effective.createdAt,
    originalDurationMs: snapshot.manifest.durationMs, proposedDurationMs: result.snapshot.manifest.durationMs, durationDeltaMs: result.snapshot.manifest.durationMs - snapshot.manifest.durationMs,
    affectedSceneCount: rerenderSceneIds.length, operationCount: result.applied.length, warnings: [...effective.diagnostics.warnings, ...(critical.length ? ['Critical conflicts must be resolved before apply.'] : [])], conflicts: effective.diagnostics.conflicts,
    beforeSceneOrder: beforeIds, afterSceneOrder: afterIds, sceneChanges: result.changes, scoreImpactEstimate: effective.summary.estimatedScoreImpact,
    renderInvalidationEstimate: rerenderSceneIds.length, reusableSegmentCountEstimate: Math.max(0, afterIds.length - rerenderSceneIds.length), rerenderSceneIds, proposedSnapshot: result.snapshot };
}

function applyOperation(manifest: RenderManifest, operation: EditOperation): boolean {
  if (operation.type === 'keep') return true;
  if (operation.type === 'reorder') { const order = stringArray(operation.parameters.order); if (!order.length) return false; const map = new Map(manifest.timeline.scenes.map((scene) => [scene.id, scene])); if (order.length !== map.size || order.some((id) => !map.has(id))) return false; manifest.timeline.scenes = order.map((id) => map.get(id)).filter((scene): scene is MediaScene => Boolean(scene)); return true; }
  const index = manifest.timeline.scenes.findIndex((scene) => scene.id === operation.sceneId); if (index < 0) return false; const scene = manifest.timeline.scenes[index];
  if (operation.type === 'remove') { if (manifest.timeline.scenes.length <= 1) return false; manifest.timeline.scenes.splice(index, 1); return true; }
  if (operation.type === 'shorten' || operation.type === 'trim-end') { const proposed = numeric(operation.parameters.proposedEndMs); if (!proposed || proposed <= scene.startMs) return false; scene.endMs = Math.min(scene.endMs, proposed); scene.durationMs = scene.endMs - scene.startMs; return true; }
  if (operation.type === 'trim-start') { const proposed = numeric(operation.parameters.proposedStartMs); if (!proposed || proposed >= scene.endMs) return false; scene.startMs = Math.max(scene.startMs, proposed); scene.durationMs = scene.endMs - scene.startMs; return true; }
  if (operation.type === 'split') return splitScene(manifest, index, operation);
  if (operation.type === 'duplicate') { const copy = deepClone(scene); copy.id = stableId(`${scene.id}-copy`, operation.id); manifest.timeline.scenes.splice(index + 1, 0, copy); return true; }
  if (operation.type === 'increase-motion' || operation.type === 'reduce-motion') { const motion = operation.parameters.motion; if (typeof motion !== 'string') return false; scene.cameraMotion = motion === 'zoom-in' || motion === 'punch-in' ? 'zoom_in' : motion === 'pan-left' ? 'pan_left' : motion === 'pan-right' ? 'pan_right' : motion === 'ken-burns' ? 'ken_burns' : 'none'; return true; }
  if (operation.type === 'change-transition') { const value = operation.parameters.transition; if (typeof value !== 'string' || !['cut', 'fade', 'crossfade', 'slide', 'zoom', 'blur'].includes(value)) return false; scene.transition.type = value as MediaScene['transition']['type']; scene.transition.durationMs = numeric(operation.parameters.transitionDurationMs); return true; }
  return false;
}

function splitScene(manifest: RenderManifest, index: number, operation: EditOperation): boolean {
  const scene = manifest.timeline.scenes[index]; const at = numeric(operation.parameters.splitAtMs); const children = stringArray(operation.parameters.childSceneIds); if (!at || at <= scene.startMs || at >= scene.endMs || children.length !== 2) return false;
  const left = { ...deepClone(scene), id: children[0], endMs: at, durationMs: at - scene.startMs }; const right = { ...deepClone(scene), id: children[1], startMs: at, durationMs: scene.endMs - at };
  right.transition = { type: 'cut', durationMs: 0 }; right.overlapBeforeMs = 0; right.overlapAfterMs = scene.overlapAfterMs;
  manifest.timeline.scenes.splice(index, 1, left, right); redistributeCues(manifest, scene.id, left, right); redistributeAudio(manifest, scene.id, left, right); redistributeTrackClips(manifest, scene, left, right); redistributeMarkers(manifest, scene.id, left, right); return true;
}

export function retimeManifest(manifest: RenderManifest): void { let cursor = 0; const offsets = new Map<string, number>(); const fps = manifest.render.fps; manifest.timeline.scenes.forEach((scene, index, scenes) => { const previous = scenes[index - 1]; const overlap = index === 0 ? 0 : Math.min(previous.durationMs, normalizeTransitionOverlap(scene.transition, scene.overlapBeforeMs, scene.durationMs, fps)); const startMs = Math.max(0, cursor - overlap); offsets.set(scene.id, startMs - scene.startMs); scene.index = index; scene.overlapBeforeMs = overlap; scene.startMs = startMs; scene.endMs = startMs + scene.durationMs; cursor = scene.endMs; });
  manifest.timeline.scenes.forEach((scene, index, scenes) => { scene.overlapAfterMs = scenes[index + 1]?.overlapBeforeMs ?? 0; });
  manifest.durationMs = cursor; manifest.timeline.durationMs = cursor; manifest.subtitles.durationMs = cursor; manifest.audio.durationMs = cursor;
  const sceneMap = new Map(manifest.timeline.scenes.map((scene) => [scene.id, scene]));
  manifest.subtitles.cues = manifest.subtitles.cues.flatMap((cue) => { const shifted = shiftCue(cue, offsets)[0]; const scene = sceneMap.get(cue.sceneId); if (!shifted || !scene || shifted.startMs >= scene.endMs) return []; const startMs = Math.max(scene.startMs, shifted.startMs); const endMs = Math.min(scene.endMs, shifted.endMs); return endMs > startMs ? [{ ...shifted, startMs, endMs, durationMs: endMs - startMs }] : []; });
  manifest.subtitles.words = manifest.subtitles.words.flatMap((word) => { const offset = offsets.get(word.sceneId); const scene = sceneMap.get(word.sceneId); if (offset === undefined || !scene) return []; const startMs = Math.max(scene.startMs, word.startMs + offset); const endMs = Math.min(scene.endMs, word.endMs + offset); return endMs > startMs ? [{ ...word, startMs, endMs, durationMs: endMs - startMs }] : []; });
  for (const key of ['voice', 'music', 'sfx'] as const) manifest.audio[key] = manifest.audio[key].flatMap((segment) => retimeAudio(segment, offsets, sceneMap, cursor));
  manifest.audio.automation = manifest.audio.automation.flatMap((point) => { if (!point.sceneId) return point.timeMs <= cursor ? [{ ...point, timeMs: Math.max(0, point.timeMs) }] : []; const offset = offsets.get(point.sceneId); const scene = sceneMap.get(point.sceneId); if (offset === undefined || !scene) return []; return [{ ...point, timeMs: Math.min(scene.endMs, Math.max(scene.startMs, point.timeMs + offset)) }]; });
  manifest.timeline.tracks = manifest.timeline.tracks.map((track) => ({ ...track, clips: track.clips.flatMap((clip) => retimeClip(clip, offsets, sceneMap, cursor, track.type)).sort((left, right) => left.startMs - right.startMs || (sceneMap.get(left.sceneId)?.index ?? Number.MAX_SAFE_INTEGER) - (sceneMap.get(right.sceneId)?.index ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id)) }));
  manifest.timeline.markers = retimeMarkers(manifest.timeline.markers, offsets, sceneMap, cursor);
  manifest.timeline.metrics = calculateTimelineMetrics(manifest.timeline.scenes, cursor);
  manifest.subtitles.metrics = calculateSubtitleMetrics(manifest.subtitles.words, manifest.subtitles.cues, cursor);
  manifest.audio.metrics = calculateAudioMetrics(cursor, manifest.audio.voice, manifest.audio.music, manifest.audio.sfx, manifest.audio.automation, manifest.audio.settings);
}
function shiftCue(cue: SubtitleCue, offsets: Map<string, number>): SubtitleCue[] { const offset = offsets.get(cue.sceneId); return offset === undefined ? [] : [{ ...cue, startMs: cue.startMs + offset, endMs: cue.endMs + offset }]; }
function retimeAudio(segment: AudioSegment, offsets: Map<string, number>, scenes: Map<string, MediaScene>, durationMs: number): AudioSegment[] { if (!segment.sceneId) { const startMs = Math.max(0, Math.min(segment.startMs, durationMs)); const endMs = Math.max(startMs, Math.min(segment.endMs, durationMs)); return endMs > startMs ? [{ ...segment, startMs, endMs, durationMs: endMs - startMs }] : []; } const offset = offsets.get(segment.sceneId); const scene = scenes.get(segment.sceneId); if (offset === undefined || !scene) return []; const startMs = Math.max(scene.startMs, segment.startMs + offset); const endMs = Math.min(scene.endMs, segment.endMs + offset); return endMs > startMs ? [{ ...segment, startMs, endMs, durationMs: endMs - startMs }] : []; }
function redistributeCues(manifest: RenderManifest, original: string, left: MediaScene, right: MediaScene): void { manifest.subtitles.cues = manifest.subtitles.cues.flatMap((cue) => { if (cue.sceneId !== original) return [cue]; const parts: SubtitleCue[] = []; const leftEnd = Math.min(cue.endMs, left.endMs); if (leftEnd > cue.startMs) parts.push({ ...cue, id: stableId('cue-split', `${cue.id}|${left.id}`), sceneId: left.id, endMs: leftEnd, durationMs: leftEnd - cue.startMs }); const rightStart = Math.max(cue.startMs, right.startMs); if (cue.endMs > rightStart) parts.push({ ...cue, id: stableId('cue-split', `${cue.id}|${right.id}`), sceneId: right.id, startMs: rightStart, durationMs: cue.endMs - rightStart }); return parts; }); manifest.subtitles.words = manifest.subtitles.words.map((word) => word.sceneId === original ? { ...word, sceneId: word.startMs < left.endMs ? left.id : right.id } : word); }
function redistributeAudio(manifest: RenderManifest, original: string, left: MediaScene, right: MediaScene): void { for (const key of ['voice', 'music', 'sfx'] as const) manifest.audio[key] = manifest.audio[key].flatMap((segment) => { if (segment.sceneId !== original) return [segment]; const parts: AudioSegment[] = []; const leftEnd = Math.min(segment.endMs, left.endMs); if (leftEnd > segment.startMs) parts.push({ ...segment, id: stableId('audio-split', `${segment.id}|${left.id}`), sceneId: left.id, endMs: leftEnd, durationMs: leftEnd - segment.startMs }); const rightStart = Math.max(segment.startMs, right.startMs); if (segment.endMs > rightStart) parts.push({ ...segment, id: stableId('audio-split', `${segment.id}|${right.id}`), sceneId: right.id, startMs: rightStart, durationMs: segment.endMs - rightStart }); return parts; }); }
function redistributeTrackClips(manifest: RenderManifest, original: MediaScene, left: MediaScene, right: MediaScene): void { manifest.timeline.tracks = manifest.timeline.tracks.map((track) => ({ ...track, clips: track.clips.flatMap((clip) => clip.sceneId !== original.id ? [clip] : splitClip(clip, left, right)) })); }
function redistributeMarkers(manifest: RenderManifest, original: string, left: MediaScene, right: MediaScene): void { manifest.timeline.markers = manifest.timeline.markers.map((marker) => marker.sceneId !== original ? marker : { ...marker, sceneId: marker.timeMs < right.startMs ? left.id : right.id }); }
function splitClip(clip: MediaClip, left: MediaScene, right: MediaScene): MediaClip[] { const parts: MediaClip[] = []; const leftStart = Math.max(clip.startMs, left.startMs); const leftEnd = Math.min(clip.endMs, left.endMs); if (leftEnd > leftStart) parts.push({ ...clip, id: stableId('clip-split', `${clip.id}|${left.id}`), sceneId: left.id, startMs: leftStart, endMs: leftEnd, durationMs: leftEnd - leftStart, offsetMs: clip.offsetMs + Math.max(0, leftStart - clip.startMs) }); const rightStart = Math.max(clip.startMs, right.startMs); const rightEnd = Math.min(clip.endMs, right.endMs); if (rightEnd > rightStart) parts.push({ ...clip, id: stableId('clip-split', `${clip.id}|${right.id}`), sceneId: right.id, startMs: rightStart, endMs: rightEnd, durationMs: rightEnd - rightStart, offsetMs: clip.offsetMs + Math.max(0, rightStart - clip.startMs) }); return parts; }
function retimeClip(clip: MediaClip, offsets: Map<string, number>, scenes: Map<string, MediaScene>, durationMs: number, trackType: string): MediaClip[] { if (clip.sceneId === 'global') { const startMs = Math.max(0, Math.min(clip.startMs, durationMs)); const endMs = Math.max(startMs, Math.min(clip.endMs, durationMs)); return endMs > startMs ? [{ ...clip, startMs, endMs, durationMs: endMs - startMs }] : []; } const scene = scenes.get(clip.sceneId); const offset = offsets.get(clip.sceneId); if (!scene || offset === undefined) return []; const shiftedStart = clip.startMs + offset; const shiftedEnd = clip.endMs + offset; const startMs = Math.max(scene.startMs, shiftedStart); const endMs = Math.min(scene.endMs, shiftedEnd); const metadata = trackType === 'video' ? { ...clip.metadata, cameraMotion: scene.cameraMotion, transition: scene.transition } : clip.metadata; return endMs > startMs ? [{ ...clip, startMs, endMs, durationMs: endMs - startMs, offsetMs: clip.offsetMs + Math.max(0, startMs - shiftedStart), metadata }] : []; }
function validateManifest(manifest: RenderManifest): void { const ids = new Set<string>(); for (const scene of manifest.timeline.scenes) { if (ids.has(scene.id)) throw new Error('Timeline scene IDs must be unique.'); ids.add(scene.id); if (scene.startMs < 0 || scene.endMs <= scene.startMs) throw new Error('Timeline contains invalid scene timing.'); } for (const cue of manifest.subtitles.cues) { const scene = manifest.timeline.scenes.find((item) => item.id === cue.sceneId); if (!scene || cue.startMs < scene.startMs || cue.endMs > scene.endMs || cue.endMs <= cue.startMs) throw new Error('Subtitle cue is outside its scene.'); } validateTimelineTrackConsistency(manifest); validateTimelineMarkerConsistency(manifest); }
export function validateTimelineTrackConsistency(manifest: RenderManifest): void { const scenes = new Map(manifest.timeline.scenes.map((scene) => [scene.id, scene])); for (const track of manifest.timeline.tracks) for (const clip of track.clips) { if (clip.startMs < 0 || clip.endMs <= clip.startMs || clip.endMs > manifest.durationMs || clip.durationMs !== clip.endMs - clip.startMs) throw new Error(`Timeline track ${track.id} contains invalid clip timing.`); if (clip.sceneId === 'global') continue; const scene = scenes.get(clip.sceneId); if (!scene) throw new Error(`Timeline track ${track.id} contains an orphan scene clip.`); if (clip.startMs < scene.startMs || clip.endMs > scene.endMs) throw new Error(`Timeline track ${track.id} clip is outside its scene.`); } }
function retimeMarkers(markers: readonly TimelineMarker[], offsets: Map<string, number>, scenes: Map<string, MediaScene>, durationMs: number): TimelineMarker[] {
  const retained = markers.flatMap((marker) => {
    if (marker.type === 'scene-start' || marker.type === 'scene-end' || marker.type === 'transition') return [];
    if (!marker.sceneId) return [{ ...marker, timeMs: Math.max(0, Math.min(durationMs, marker.timeMs)) }];
    const scene = scenes.get(marker.sceneId); const offset = offsets.get(marker.sceneId); if (!scene || offset === undefined) return [];
    return [{ ...marker, timeMs: Math.max(scene.startMs, Math.min(scene.endMs, marker.timeMs + offset)) }];
  });
  const structural = [...scenes.values()].flatMap((scene): TimelineMarker[] => {
    const values: TimelineMarker[] = [
      structuralMarker('scene-start', scene, scene.startMs, `Scene ${scene.index + 1} start`),
      structuralMarker('scene-end', scene, scene.endMs, `Scene ${scene.index + 1} end`),
    ];
    if (scene.overlapBeforeMs > 0) values.push(structuralMarker('transition', scene, scene.startMs, `${scene.transition.type} transition`, { durationMs: scene.transition.durationMs, overlapMs: scene.overlapBeforeMs }));
    return values;
  });
  return [...retained, ...structural].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id));
}
function structuralMarker(type: TimelineMarker['type'], scene: MediaScene, timeMs: number, label: string, metadata: Readonly<Record<string, unknown>> = {}): TimelineMarker {
  return { id: stableId(`marker-${type}`, `${scene.id}|${type}`), type, timeMs, sceneId: scene.id, label, metadata };
}
export function validateTimelineMarkerConsistency(manifest: RenderManifest): void { const scenes = new Map(manifest.timeline.scenes.map((scene) => [scene.id, scene])); const ids = new Set<string>(); for (const marker of manifest.timeline.markers) { if (ids.has(marker.id)) throw new Error('Timeline marker IDs must be unique.'); ids.add(marker.id); if (marker.timeMs < 0 || marker.timeMs > manifest.durationMs) throw new Error(`Timeline marker ${marker.id} is outside the timeline.`); if (!marker.sceneId) continue; const scene = scenes.get(marker.sceneId); if (!scene) throw new Error(`Timeline marker ${marker.id} references an invalid scene.`); if (marker.timeMs < scene.startMs || marker.timeMs > scene.endMs) throw new Error(`Timeline marker ${marker.id} is outside its scene.`); if (marker.type === 'transition' && (scene.overlapBeforeMs <= 0 || marker.timeMs !== scene.startMs)) throw new Error(`Timeline transition marker ${marker.id} is inconsistent with scene overlap.`); } }
function summarize(before: Map<string, MediaScene>, after: readonly MediaScene[]): SceneChangeSummary[] { const afterMap = new Map(after.map((scene) => [scene.id, scene])); const ids = new Set([...before.keys(), ...afterMap.keys()]); return [...ids].flatMap((id) => { const left = before.get(id); const right = afterMap.get(id); const changes: string[] = []; if (!left) changes.push('added'); else if (!right) changes.push('removed'); else { if (left.index !== right.index) changes.push('reordered'); if (left.durationMs !== right.durationMs) changes.push('duration'); if (left.cameraMotion !== right.cameraMotion) changes.push('motion'); if (left.transition.type !== right.transition.type) changes.push('transition'); } return changes.length ? [{ sceneId: id, changes, beforeStartMs: left?.startMs ?? null, afterStartMs: right?.startMs ?? null, beforeDurationMs: left?.durationMs ?? null, afterDurationMs: right?.durationMs ?? null }] : []; }); }
function numeric(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
