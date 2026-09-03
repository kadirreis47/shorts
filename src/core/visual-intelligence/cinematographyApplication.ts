import {
  resolveEffectiveSceneComposition,
  setSceneCompositionOverride,
  type SceneCompositionDefaults,
} from '@/core/media/sceneComposition';
import { isCanonicalPrivateMediaIdentity } from '@/core/media/storageIdentity';
import type { Scene, SceneCompositionMotion, SceneCompositionTransition } from '@/lib/types';
import type { CinematographyAssessment } from './cinematography';

export const CINEMATOGRAPHY_APPLICATION_VERSION = 1 as const;

export type CinematographyApplicationReason =
  | 'already-matches'
  | 'unsupported-motion'
  | 'unsupported-transition'
  | 'scene-has-no-incoming-boundary'
  | 'video-motion-not-executable'
  | 'missing-canonical-media'
  | 'recommendation-media-mismatch'
  | 'invalid-scene';

export interface CinematographyApplicationChange {
  readonly field: 'motion' | 'transition';
  readonly before: SceneCompositionMotion | SceneCompositionTransition;
  readonly after: SceneCompositionMotion | SceneCompositionTransition;
}

/** Session-only authority for a single explicit scene-local application. */
export interface CinematographyApplicationProposal {
  readonly version: typeof CINEMATOGRAPHY_APPLICATION_VERSION;
  readonly status: 'ready' | 'no-op' | 'unsupported' | 'invalid-scene' | 'invalid-media';
  readonly reasons: readonly CinematographyApplicationReason[];
  readonly projectId: string;
  readonly sceneId: string;
  readonly sceneIndex: number;
  readonly canonicalMediaIdentity: string;
  readonly recommendation: CinematographyAssessment;
  readonly recommendationFingerprint: string;
  readonly current: Readonly<{ motion: SceneCompositionMotion; transition: SceneCompositionTransition }>;
  readonly proposed: Readonly<{ motion: SceneCompositionMotion; transition: SceneCompositionTransition }>;
  readonly changes: readonly CinematographyApplicationChange[];
  /** Deterministic staleness authority; it deliberately has no URLs, dates, or random values. */
  readonly authority: string;
}

export type CinematographyApplicationResult =
  | { readonly status: 'applied'; readonly scenes: readonly Scene[] }
  | { readonly status: 'no-op'; readonly scenes: readonly Scene[] }
  | { readonly status: 'stale' | 'unsupported' | 'invalid-scene' | 'invalid-media' | 'conflict'; readonly scenes: readonly Scene[] };

export interface CreateCinematographyApplicationProposalInput {
  readonly projectId: string;
  readonly scenes: readonly Scene[];
  readonly sceneIndex: number;
  readonly defaults: SceneCompositionDefaults;
  readonly recommendation: CinematographyAssessment;
  /** Stable durable-media identity to which the advisory evidence was bound. */
  readonly recommendationMediaIdentity: string;
}

/**
 * Pure proposal generation. It neither writes Scene state nor changes output
 * identity; that only happens after applyCinematographyApplicationProposal.
 */
export function createCinematographyApplicationProposal(
  input: CreateCinematographyApplicationProposalInput,
): CinematographyApplicationProposal {
  const scene = validScene(input.scenes, input.sceneIndex);
  const sceneId = scene?.visualPlanningId ?? '';
  const media = scene ? canonicalMedia(scene) : undefined;
  const fallback = { motion: input.defaults.motion, transition: input.sceneIndex === 0 ? 'none' : input.defaults.transition } as const;
  if (!scene || !sceneId || input.recommendation.sceneId !== sceneId) {
    return proposal(input, 'invalid-scene', ['invalid-scene'], sceneId, '', fallback, fallback, []);
  }
  if (!media) return proposal(input, 'invalid-media', ['missing-canonical-media'], sceneId, '', fallback, fallback, []);
  if (input.recommendationMediaIdentity !== media.identity) {
    return proposal(input, 'invalid-media', ['recommendation-media-mismatch'], sceneId, media.identity, currentFor(input, scene), currentFor(input, scene), []);
  }

  const current = resolveEffectiveSceneComposition(input.defaults, scene.compositionOverride, input.sceneIndex);
  const proposed = { ...current };
  const reasons: CinematographyApplicationReason[] = [];
  const motion = mappedMotion(input.recommendation);
  if (motion === undefined) reasons.push('unsupported-motion');
  else if (media.type === 'video' && motion !== current.motion) reasons.push('video-motion-not-executable');
  else if (motion !== undefined) proposed.motion = motion;

  const transition = mappedTransition(input.recommendation);
  if (transition === undefined) reasons.push('unsupported-transition');
  else if (input.sceneIndex === 0 || input.scenes.length < 2) reasons.push('scene-has-no-incoming-boundary');
  else proposed.transition = transition;

  const changes: CinematographyApplicationChange[] = [];
  if (current.motion !== proposed.motion) changes.push(Object.freeze({ field: 'motion', before: current.motion, after: proposed.motion }));
  if (current.transition !== proposed.transition) changes.push(Object.freeze({ field: 'transition', before: current.transition, after: proposed.transition }));
  const status = changes.length ? 'ready' : reasons.some((reason) => reason !== 'scene-has-no-incoming-boundary') ? 'unsupported' : 'no-op';
  if (!changes.length && !reasons.length) reasons.push('already-matches');
  return proposal(input, status, reasons, sceneId, media.identity, current, proposed, changes);
}

/** Recomputes authority immediately before one atomic Slice 12A mutation. */
export function applyCinematographyApplicationProposal(
  input: CreateCinematographyApplicationProposalInput & { readonly proposal: CinematographyApplicationProposal },
): CinematographyApplicationResult {
  const { proposal, ...currentInput } = input;
  if (proposal.projectId !== input.projectId) return { status: 'stale', scenes: input.scenes };
  if (proposal.sceneIndex !== input.sceneIndex || proposal.sceneId !== input.scenes[input.sceneIndex]?.visualPlanningId) return { status: 'invalid-scene', scenes: input.scenes };
  const media = validScene(input.scenes, input.sceneIndex) && canonicalMedia(input.scenes[input.sceneIndex]);
  if (!media || media.identity !== proposal.canonicalMediaIdentity) return { status: 'invalid-media', scenes: input.scenes };
  const current = createCinematographyApplicationProposal(currentInput);
  if (current.status === 'invalid-scene') return { status: 'invalid-scene', scenes: input.scenes };
  if (current.status === 'invalid-media') return { status: 'invalid-media', scenes: input.scenes };
  if (current.authority !== proposal.authority) return { status: 'stale', scenes: input.scenes };
  if (current.status === 'unsupported') return { status: 'unsupported', scenes: input.scenes };
  if (current.status === 'no-op') return { status: 'no-op', scenes: input.scenes };

  const patch: Partial<{ motion: SceneCompositionMotion; transition: SceneCompositionTransition }> = {};
  for (const change of current.changes) {
    if (change.field === 'motion') patch.motion = change.after as SceneCompositionMotion;
    else patch.transition = change.after as SceneCompositionTransition;
  }
  const mutation = setSceneCompositionOverride(input.scenes, input.sceneIndex, patch, input.defaults);
  if (mutation.status === 'updated') return { status: 'applied', scenes: mutation.scenes };
  if (mutation.status === 'no-op') return { status: 'no-op', scenes: input.scenes };
  return { status: 'conflict', scenes: input.scenes };
}

function mappedMotion(assessment: CinematographyAssessment): SceneCompositionMotion | undefined {
  if (assessment.strategy === 'hold') return 'static';
  if (assessment.strategy === 'gentle-push') return 'zoom_in';
  if (assessment.strategy === 'restrained-pan') return 'pan';
  // "transition-led" is not a renderer motion strategy. Never approximate it.
  return undefined;
}

function mappedTransition(assessment: CinematographyAssessment): SceneCompositionTransition | undefined {
  return assessment.transition === 'crossfade' || assessment.transition === 'none' ? assessment.transition : undefined;
}

function canonicalMedia(scene: Scene): { readonly type: 'image' | 'video'; readonly identity: string } | undefined {
  const storage = scene.videoStorage ?? scene.imageStorage;
  if (!storage || !isCanonicalPrivateMediaIdentity(storage) || scene.videoStorage && scene.imageStorage) return undefined;
  return Object.freeze({ type: scene.videoStorage ? 'video' : 'image', identity: `${scene.videoStorage ? 'video' : 'image'}:media:${storage.objectPath}` });
}

function validScene(scenes: readonly Scene[], sceneIndex: number): Scene | undefined {
  return Number.isSafeInteger(sceneIndex) && sceneIndex >= 0 && sceneIndex < scenes.length ? scenes[sceneIndex] : undefined;
}

function proposal(
  input: CreateCinematographyApplicationProposalInput,
  status: CinematographyApplicationProposal['status'],
  reasons: readonly CinematographyApplicationReason[],
  sceneId: string,
  canonicalMediaIdentity: string,
  current: Readonly<{ motion: SceneCompositionMotion; transition: SceneCompositionTransition }>,
  proposed: Readonly<{ motion: SceneCompositionMotion; transition: SceneCompositionTransition }>,
  changes: readonly CinematographyApplicationChange[],
): CinematographyApplicationProposal {
  const recommendationFingerprint = fingerprint(input.recommendation);
  const authority = fingerprint({ version: CINEMATOGRAPHY_APPLICATION_VERSION, projectId: input.projectId, sceneId, sceneIndex: input.sceneIndex, canonicalMediaIdentity, recommendationMediaIdentity: input.recommendationMediaIdentity, defaults: input.defaults, current, proposed, recommendation: recommendationFingerprint });
  return Object.freeze({ version: CINEMATOGRAPHY_APPLICATION_VERSION, status, reasons: Object.freeze([...new Set(reasons)].sort()), projectId: input.projectId, sceneId, sceneIndex: input.sceneIndex, canonicalMediaIdentity, recommendation: input.recommendation, recommendationFingerprint, current: Object.freeze({ ...current }), proposed: Object.freeze({ ...proposed }), changes: Object.freeze(changes), authority });
}

function currentFor(input: CreateCinematographyApplicationProposalInput, scene: Scene): Readonly<{ motion: SceneCompositionMotion; transition: SceneCompositionTransition }> {
  return resolveEffectiveSceneComposition(input.defaults, scene.compositionOverride, input.sceneIndex);
}

function fingerprint(value: unknown): string {
  const json = stableJson(value);
  let hash = 2166136261;
  for (let index = 0; index < json.length; index += 1) hash = Math.imul(hash ^ json.charCodeAt(index), 16777619);
  return `cinematography-application-v1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}
