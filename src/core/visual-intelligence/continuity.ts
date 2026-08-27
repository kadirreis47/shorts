import {
  isSceneVisualBindingCurrent,
  normalizeVisualIntelligencePlanningState,
  type SceneVisualBinding,
  type SceneVisualBrief,
  type VisualConceptCategory,
  type VisualIntelligencePlanningState,
  type VisualMediaPreference,
} from './types';
import type { VisualDiscoveryCandidate } from './discovery';

/** Deterministic planning-only sequence intelligence. It does not inspect pixels or own media. */
export const VISUAL_STORY_VERSION = 1 as const;
export type VisualContinuityGroupKind = 'shared-location-intent' | 'shared-setting-intent' | 'shared-subject-intent';
export type VisualSequenceQualityGrade = 'strong' | 'balanced' | 'limited' | 'weak';
export type VisualSequenceReason =
  | 'repeated-provider-media' | 'media-type-run' | 'repeated-category-pattern'
  | 'novelty-request-unmet' | 'intentional-continuity' | 'role-progression'
  | 'media-rhythm-variety' | 'continuity-group-support';

export interface VisualContinuityGroup {
  readonly id: string;
  readonly kind: VisualContinuityGroupKind;
  readonly sceneIds: readonly string[];
}
export interface VisualStoryBeat {
  readonly sceneBinding: SceneVisualBinding;
  readonly order: number;
  readonly editorialRole: SceneVisualBrief['editorialRole'];
  readonly preferredMedia: VisualMediaPreference;
  readonly categories: readonly VisualConceptCategory[];
  readonly noveltyConstraints: SceneVisualBrief['noveltyConstraints'];
  readonly continuityGroupIds: readonly string[];
}
export interface VisualStoryPlan {
  readonly version: typeof VISUAL_STORY_VERSION;
  readonly fingerprint: string;
  readonly beats: readonly VisualStoryBeat[];
  readonly continuityGroups: readonly VisualContinuityGroup[];
}
/** Existing selection or durable media, represented without delivery URLs or media contents. */
export interface VisualStoryMediaContext {
  readonly sceneId: string;
  readonly mediaType: Exclude<VisualMediaPreference, 'either'>;
  readonly origin: 'selection' | 'canonical';
  readonly provider?: string;
  readonly providerMediaIdentity?: string;
  readonly categories?: readonly VisualConceptCategory[];
}
export interface VisualSequenceQualityAssessment {
  readonly grade: VisualSequenceQualityGrade;
  /** Bounded deterministic planning coherence; not aesthetic or semantic confidence. */
  readonly score: number;
  readonly reasons: readonly VisualSequenceReason[];
}
export interface VisualContinuityCandidateAssessment {
  readonly globalAdjustment: number;
  readonly reasons: readonly VisualSequenceReason[];
  readonly localQualityIndependent: true;
}

export function createVisualStoryPlan(planning: VisualIntelligencePlanningState, scenes: readonly { readonly visualPlanningId?: string; readonly text: string }[]): VisualStoryPlan {
  const normalized = normalizeVisualIntelligencePlanningState(planning);
  if (!normalized) throw new Error('Visual story planning is required.');
  const plans = new Map(normalized.queryPlans.map((plan) => [plan.sceneBinding.sceneId, plan]));
  const raw = normalized.briefs.map((brief) => {
    if (!isSceneVisualBindingCurrent(brief.sceneBinding, scenes)) throw new Error('Visual story planning is stale.');
    const queryPlan = plans.get(brief.sceneBinding.sceneId);
    if (!queryPlan) throw new Error('Visual story planning is incomplete.');
    return { brief, categories: unique(queryPlan.concepts.map((concept) => concept.category)) };
  }).sort((left, right) => left.brief.sceneBinding.sceneIndex - right.brief.sceneBinding.sceneIndex || left.brief.sceneBinding.sceneId.localeCompare(right.brief.sceneBinding.sceneId));
  const groups = groupsFor(raw.map((item) => item.brief));
  const membership = new Map<string, string[]>();
  for (const group of groups) for (const sceneId of group.sceneIds) membership.set(sceneId, [...(membership.get(sceneId) ?? []), group.id]);
  const beats = raw.map(({ brief, categories }, order) => Object.freeze({
    sceneBinding: brief.sceneBinding, order, editorialRole: brief.editorialRole, preferredMedia: brief.preferredMedia,
    categories: Object.freeze(categories), noveltyConstraints: brief.noveltyConstraints,
    continuityGroupIds: Object.freeze([...(membership.get(brief.sceneBinding.sceneId) ?? [])].sort()),
  }));
  return Object.freeze({ version: VISUAL_STORY_VERSION, fingerprint: storyFingerprint(beats), beats: Object.freeze(beats), continuityGroups: Object.freeze(groups) });
}

export function isVisualStoryPlanCurrent(plan: VisualStoryPlan, planning: VisualIntelligencePlanningState, scenes: readonly { readonly visualPlanningId?: string; readonly text: string }[]): boolean {
  try { return plan.fingerprint === createVisualStoryPlan(planning, scenes).fingerprint; } catch { return false; }
}

export function assessVisualSequence(plan: VisualStoryPlan, media: readonly VisualStoryMediaContext[]): VisualSequenceQualityAssessment {
  const reasons = new Set<VisualSequenceReason>();
  let score = 80;
  const ordered = orderedMedia(plan, media);
  const beatsByScene = new Map(plan.beats.map((beat) => [beat.sceneBinding.sceneId, beat]));
  const groupsByScene = new Map(plan.beats.map((beat) => [beat.sceneBinding.sceneId, new Set(beat.continuityGroupIds)]));
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]; const current = ordered[index]; const beat = beatsByScene.get(current.sceneId);
    if (sameProviderMedia(previous, current)) { reasons.add('repeated-provider-media'); score -= 18; }
    if (previous.mediaType === current.mediaType && index >= 2 && ordered[index - 2].mediaType === current.mediaType) { reasons.add('media-type-run'); score -= 10; }
    if (sharesCategory(previous, current)) { reasons.add('repeated-category-pattern'); score -= 5; }
    if (beat?.noveltyConstraints.includes('vary-media-type') && previous.mediaType === current.mediaType) { reasons.add('novelty-request-unmet'); score -= 6; }
    if (sharesGroup(groupsByScene.get(previous.sceneId), groupsByScene.get(current.sceneId))) { reasons.add('intentional-continuity'); score += 4; }
    if (previous.mediaType !== current.mediaType) { reasons.add('media-rhythm-variety'); score += 3; }
  }
  if (plan.beats.length > 1 && new Set(plan.beats.map((beat) => beat.editorialRole)).size > 1) reasons.add('role-progression');
  const bounded = clamp(score, 0, 100);
  return Object.freeze({ grade: bounded >= 80 ? 'strong' : bounded >= 60 ? 'balanced' : bounded >= 40 ? 'limited' : 'weak', score: bounded, reasons: Object.freeze([...reasons].sort()) });
}

/** Global sequence contribution is intentionally smaller than factual local quality and relevance. */
export function assessVisualCandidateContinuity(input: { readonly story: VisualStoryPlan; readonly target: SceneVisualBinding; readonly candidate: VisualDiscoveryCandidate; readonly media: readonly VisualStoryMediaContext[] }): VisualContinuityCandidateAssessment {
  const targetBeat = input.story.beats.find((beat) => beat.sceneBinding.sceneId === input.target.sceneId);
  if (!targetBeat || targetBeat.sceneBinding.sceneIndex !== input.target.sceneIndex || targetBeat.sceneBinding.sceneTextFingerprint !== input.target.sceneTextFingerprint) return neutralCandidateContinuity();
  const context = orderedMedia(input.story, input.media).filter((item) => item.sceneId !== input.target.sceneId);
  const reasons = new Set<VisualSequenceReason>(); let adjustment = 0;
  if (context.some((item) => item.provider === input.candidate.provider && item.providerMediaIdentity === input.candidate.providerMediaIdentity)) { reasons.add('repeated-provider-media'); adjustment -= 12; }
  const before = context.filter((item) => position(input.story, item.sceneId) < targetBeat.order).slice(-2);
  if (before.length === 2 && before.every((item) => item.mediaType === input.candidate.mediaType)) { reasons.add('media-type-run'); adjustment -= 7; }
  const previous = before.at(-1);
  if (previous) {
    if (targetBeat.noveltyConstraints.includes('vary-media-type')) {
      if (previous.mediaType === input.candidate.mediaType) { reasons.add('novelty-request-unmet'); adjustment -= 5; }
      else { reasons.add('media-rhythm-variety'); adjustment += 3; }
    }
    if (sharesCategory(previous, { categories: input.candidate.conceptCategories })) { reasons.add('repeated-category-pattern'); adjustment -= 3; }
    if (sameGroup(input.story, previous.sceneId, input.target.sceneId)) { reasons.add('continuity-group-support'); adjustment += 4; }
  }
  return Object.freeze({ globalAdjustment: clamp(adjustment, -12, 12), reasons: Object.freeze([...reasons].sort()), localQualityIndependent: true });
}

export function neutralCandidateContinuity(): VisualContinuityCandidateAssessment { return Object.freeze({ globalAdjustment: 0, reasons: Object.freeze([]), localQualityIndependent: true }); }

function groupsFor(briefs: readonly SceneVisualBrief[]): VisualContinuityGroup[] {
  const definitions: Array<[VisualContinuityGroupKind, (brief: SceneVisualBrief) => string | undefined]> = [
    ['shared-location-intent', (brief) => brief.location], ['shared-setting-intent', (brief) => brief.setting], ['shared-subject-intent', (brief) => brief.subject],
  ];
  const groups: VisualContinuityGroup[] = [];
  for (const [kind, valueFor] of definitions) {
    const grouped = new Map<string, string[]>();
    for (const brief of briefs) { const value = valueFor(brief)?.trim().toLowerCase(); if (value) grouped.set(value, [...(grouped.get(value) ?? []), brief.sceneBinding.sceneId]); }
    for (const [value, sceneIds] of grouped) if (sceneIds.length > 1) groups.push(Object.freeze({ id: `continuity-${kind}-${hash(value)}`, kind, sceneIds: Object.freeze([...sceneIds].sort()) }));
  }
  return groups.sort((left, right) => left.id.localeCompare(right.id));
}
function orderedMedia(plan: VisualStoryPlan, media: readonly VisualStoryMediaContext[]): VisualStoryMediaContext[] { const positions = new Map(plan.beats.map((beat) => [beat.sceneBinding.sceneId, beat.order])); return media.filter((item) => positions.has(item.sceneId)).slice().sort((left, right) => (positions.get(left.sceneId) ?? -1) - (positions.get(right.sceneId) ?? -1) || left.sceneId.localeCompare(right.sceneId)); }
function position(plan: VisualStoryPlan, sceneId: string): number { return plan.beats.find((beat) => beat.sceneBinding.sceneId === sceneId)?.order ?? -1; }
function sameGroup(plan: VisualStoryPlan, left: string, right: string): boolean { return sharesGroup(new Set(plan.beats.find((beat) => beat.sceneBinding.sceneId === left)?.continuityGroupIds ?? []), new Set(plan.beats.find((beat) => beat.sceneBinding.sceneId === right)?.continuityGroupIds ?? [])); }
function sharesGroup(left: ReadonlySet<string> | undefined, right: ReadonlySet<string> | undefined): boolean { return Boolean(left && right && [...left].some((id) => right.has(id))); }
function sameProviderMedia(left: VisualStoryMediaContext, right: VisualStoryMediaContext): boolean { return Boolean(left.provider && left.providerMediaIdentity && left.provider === right.provider && left.providerMediaIdentity === right.providerMediaIdentity); }
function sharesCategory(left: Pick<VisualStoryMediaContext, 'categories'>, right: Pick<VisualStoryMediaContext, 'categories'>): boolean { return Boolean(left.categories?.some((category) => right.categories?.includes(category))); }
function unique<T extends string>(values: readonly T[]): T[] { return [...new Set(values)].sort(); }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
function storyFingerprint(beats: readonly VisualStoryBeat[]): string { return `visual-story-v1-${hash(JSON.stringify(beats.map((beat) => [beat.sceneBinding.sceneId, beat.sceneBinding.sceneIndex, beat.sceneBinding.sceneTextFingerprint, beat.editorialRole, beat.preferredMedia, beat.categories, beat.noveltyConstraints])) )}`; }
function hash(value: string): string { let hashValue = 2166136261; for (let index = 0; index < value.length; index += 1) hashValue = Math.imul(hashValue ^ value.charCodeAt(index), 16777619); return (hashValue >>> 0).toString(16).padStart(8, '0'); }
