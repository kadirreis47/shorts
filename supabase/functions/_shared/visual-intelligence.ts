/**
 * Shared editorial-planning contract. It never identifies media, enters Recipe
 * V1, or becomes a render source; durable approved media remains canonical.
 */
export const VISUAL_INTELLIGENCE_VERSION = 1 as const;
export type VisualEditorialRole = 'hook' | 'context' | 'explanation' | 'evidence' | 'contrast' | 'escalation' | 'payoff' | 'cta';
export type VisualMediaPreference = 'image' | 'video' | 'either';
export type VisualNoveltyConstraint = 'vary-subject-framing' | 'vary-location' | 'vary-media-type' | 'prefer-visual-contrast';
/** A future provider establishes actual rights; this is only planning intent. */
export type VisualSourceKind = 'licensed-stock' | 'ai-generated' | 'manual';
export type VisualAttributionPreference = 'no-preference' | 'prefer-available';
export type VisualConceptCategory = 'establishing' | 'detail' | 'atmosphere' | 'action' | 'evidence' | 'contrast';

export interface VisualPlanningScene { readonly visualPlanningId?: string; readonly text: string; }
export interface SceneVisualBinding { readonly sceneId: string; readonly sceneIndex: number; readonly sceneTextFingerprint: string; }
export interface VisualSourceIntent { readonly allowedSourceKinds: readonly VisualSourceKind[]; readonly commerciallyUsableSourceRequired: boolean; readonly attributionPreference: VisualAttributionPreference; }
export interface SceneVisualBrief {
  readonly version: typeof VISUAL_INTELLIGENCE_VERSION; readonly sceneBinding: SceneVisualBinding; readonly subject: string;
  readonly setting?: string; readonly location?: string; readonly era?: string; readonly action?: string; readonly mood?: string; readonly lighting?: string;
  readonly editorialRole: VisualEditorialRole; readonly preferredMedia: VisualMediaPreference; readonly visualStyleHints: readonly string[];
  readonly visualExclusions: readonly string[]; readonly noveltyConstraints: readonly VisualNoveltyConstraint[]; readonly sourceIntent: VisualSourceIntent;
}
export interface VisualQueryConcept { readonly query: string; readonly targetMedia: VisualMediaPreference; readonly priority: number; readonly category: VisualConceptCategory; }
export interface VisualQueryPlan { readonly version: typeof VISUAL_INTELLIGENCE_VERSION; readonly sceneBinding: SceneVisualBinding; readonly briefFingerprint: string; readonly concepts: readonly VisualQueryConcept[]; }
export interface VisualIntelligencePlanningState { readonly version: typeof VISUAL_INTELLIGENCE_VERSION; readonly briefs: readonly SceneVisualBrief[]; readonly queryPlans: readonly VisualQueryPlan[]; }

const MAX_TEXT = 120; const MAX_QUERY_TEXT = 240; const MAX_STYLE_HINTS = 5; const MAX_EXCLUSIONS = 5; const MAX_NOVELTY = 4;
const MIN_CONCEPTS = 3; const MAX_CONCEPTS = 6; const MAX_SCENE_ENTRIES = 100;
const SCENE_ID = /^visual-scene-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_LIKE = /(?:https?:\/\/|www\.)/iu;
const roles = new Set<VisualEditorialRole>(['hook', 'context', 'explanation', 'evidence', 'contrast', 'escalation', 'payoff', 'cta']);
const media = new Set<VisualMediaPreference>(['image', 'video', 'either']);
const novelty = new Set<VisualNoveltyConstraint>(['vary-subject-framing', 'vary-location', 'vary-media-type', 'prefer-visual-contrast']);
const sources = new Set<VisualSourceKind>(['licensed-stock', 'ai-generated', 'manual']);
const attribution = new Set<VisualAttributionPreference>(['no-preference', 'prefer-available']);
const categories = new Set<VisualConceptCategory>(['establishing', 'detail', 'atmosphere', 'action', 'evidence', 'contrast']);

export function createSceneVisualPlanningId(): string { return `visual-scene-${crypto.randomUUID()}`; }
export function ensureSceneVisualPlanningIds<T extends VisualPlanningScene>(scenes: readonly T[]): T[] {
  const seen = new Set<string>();
  return scenes.map((scene) => {
    const existing = typeof scene.visualPlanningId === 'string' && SCENE_ID.test(scene.visualPlanningId) ? scene.visualPlanningId.toLowerCase() : null;
    const visualPlanningId = existing && !seen.has(existing) ? existing : createSceneVisualPlanningId();
    seen.add(visualPlanningId);
    return scene.visualPlanningId === visualPlanningId ? { ...scene } : { ...scene, visualPlanningId };
  });
}
export function createSceneVisualBinding(scenes: readonly VisualPlanningScene[], sceneIndex: number): SceneVisualBinding {
  if (!Number.isSafeInteger(sceneIndex) || sceneIndex < 0 || sceneIndex >= scenes.length) throw new Error('Visual planning scene index is invalid.');
  const scene = scenes[sceneIndex]; if (!scene || !isSceneVisualPlanningId(scene.visualPlanningId)) throw new Error('Visual planning requires a stable scene identity.');
  return freeze({ sceneId: scene.visualPlanningId.toLowerCase(), sceneIndex, sceneTextFingerprint: sceneTextFingerprint(scene.text) });
}
/** Conservative by design: insertions/reorders invalidate planning rather than rebind it. */
export function isSceneVisualBindingCurrent(binding: SceneVisualBinding, scenes: readonly VisualPlanningScene[]): boolean {
  try { const normalized = normalizeSceneVisualBinding(binding); const scene = scenes[normalized.sceneIndex]; return Boolean(scene && scene.visualPlanningId === normalized.sceneId && sceneTextFingerprint(scene.text) === normalized.sceneTextFingerprint); } catch { return false; }
}
export function sceneTextFingerprint(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Visual planning scene text is invalid.');
  const text = value.replace(/\r\n?/gu, '\n'); let first = 2166136261; let second = 2246822519;
  for (let index = 0; index < text.length; index += 1) { const code = text.charCodeAt(index); first = Math.imul(first ^ code, 16777619); second = Math.imul(second ^ code, 3266489917); }
  return `scene-text-v1-${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}
export function normalizeSceneVisualBrief(value: unknown): SceneVisualBrief {
  const source = object(value, 'Visual brief'); keys(source, ['version', 'sceneBinding', 'subject', 'setting', 'location', 'era', 'action', 'mood', 'lighting', 'editorialRole', 'preferredMedia', 'visualStyleHints', 'visualExclusions', 'noveltyConstraints', 'sourceIntent'], 'Visual brief');
  return freeze({ version: version(source.version), sceneBinding: normalizeSceneVisualBinding(source.sceneBinding), subject: text(source.subject, 'Visual brief subject', MAX_TEXT),
    ...optionalText(source.setting, 'Visual brief setting', MAX_TEXT), ...optionalText(source.location, 'Visual brief location', MAX_TEXT), ...optionalText(source.era, 'Visual brief era', MAX_TEXT), ...optionalText(source.action, 'Visual brief action', MAX_TEXT), ...optionalText(source.mood, 'Visual brief mood', MAX_TEXT), ...optionalText(source.lighting, 'Visual brief lighting', MAX_TEXT),
    editorialRole: enumValue(source.editorialRole, roles, 'Visual brief editorial role'), preferredMedia: enumValue(source.preferredMedia, media, 'Visual brief preferred media'), visualStyleHints: uniqueTextArray(source.visualStyleHints, 'Visual brief style hints', MAX_STYLE_HINTS, MAX_TEXT), visualExclusions: uniqueTextArray(source.visualExclusions, 'Visual brief exclusions', MAX_EXCLUSIONS, MAX_TEXT), noveltyConstraints: uniqueEnumArray(source.noveltyConstraints, novelty, 'Visual brief novelty constraints', MAX_NOVELTY), sourceIntent: normalizeSourceIntent(source.sourceIntent) });
}
export function normalizeVisualQueryPlan(value: unknown): VisualQueryPlan {
  const source = object(value, 'Visual query plan'); keys(source, ['version', 'sceneBinding', 'briefFingerprint', 'concepts'], 'Visual query plan'); const concepts = array(source.concepts, 'Visual query plan concepts');
  if (concepts.length < MIN_CONCEPTS || concepts.length > MAX_CONCEPTS) throw new Error(`Visual query plan requires ${MIN_CONCEPTS}-${MAX_CONCEPTS} concepts.`);
  const normalized = concepts.map((item, index) => normalizeConcept(item, index + 1)); const priorities = new Set(normalized.map((item) => item.priority)); const queryKeys = new Set(normalized.map((item) => `${item.targetMedia}|${item.query.toLowerCase()}`));
  if (priorities.size !== normalized.length || queryKeys.size !== normalized.length) throw new Error('Visual query plan concepts must have unique priorities and queries.');
  return freeze({ version: version(source.version), sceneBinding: normalizeSceneVisualBinding(source.sceneBinding), briefFingerprint: fingerprint(source.briefFingerprint, 'Visual query plan brief fingerprint'), concepts: freezeArray([...normalized].sort((left, right) => left.priority - right.priority || compareText(left.query, right.query))) });
}
export function normalizeVisualIntelligencePlanningState(value: unknown): VisualIntelligencePlanningState | undefined {
  if (value === undefined || value === null) return undefined; const source = object(value, 'Visual intelligence planning'); keys(source, ['version', 'briefs', 'queryPlans'], 'Visual intelligence planning'); const rawBriefs = array(source.briefs, 'Visual intelligence briefs'); const rawPlans = array(source.queryPlans, 'Visual intelligence query plans');
  if (rawBriefs.length > MAX_SCENE_ENTRIES || rawPlans.length > MAX_SCENE_ENTRIES) throw new Error('Visual intelligence planning has too many scene entries.');
  const briefs = rawBriefs.map(normalizeSceneVisualBrief); const queryPlans = rawPlans.map(normalizeVisualQueryPlan); const briefIds = new Set(briefs.map((brief) => brief.sceneBinding.sceneId)); const planIds = new Set(queryPlans.map((plan) => plan.sceneBinding.sceneId));
  if (briefs.length !== queryPlans.length || briefIds.size !== briefs.length || planIds.size !== queryPlans.length || briefIds.size !== planIds.size || [...briefIds].some((sceneId) => !planIds.has(sceneId))) throw new Error('Visual intelligence planning requires exactly one query plan for each visual brief.'); const byScene = new Map(briefs.map((brief) => [brief.sceneBinding.sceneId, brief]));
  for (const plan of queryPlans) { const brief = byScene.get(plan.sceneBinding.sceneId); if (!brief || plan.sceneBinding.sceneIndex !== brief.sceneBinding.sceneIndex || plan.sceneBinding.sceneTextFingerprint !== brief.sceneBinding.sceneTextFingerprint || plan.briefFingerprint !== visualBriefFingerprint(brief)) throw new Error('Visual query plan requires the exact matching visual brief.'); }
  return freeze({ version: version(source.version), briefs: freezeArray(briefs), queryPlans: freezeArray(queryPlans) });
}
export function visualBriefFingerprint(brief: SceneVisualBrief): string { return hash(`visual-brief-v1|${JSON.stringify(normalizeSceneVisualBrief(brief))}`); }
export function isVisualQueryPlanCurrent(plan: VisualQueryPlan, brief: SceneVisualBrief, scenes: readonly VisualPlanningScene[]): boolean {
  try { const normalizedPlan = normalizeVisualQueryPlan(plan); const normalizedBrief = normalizeSceneVisualBrief(brief); return normalizedPlan.sceneBinding.sceneId === normalizedBrief.sceneBinding.sceneId && normalizedPlan.sceneBinding.sceneIndex === normalizedBrief.sceneBinding.sceneIndex && normalizedPlan.sceneBinding.sceneTextFingerprint === normalizedBrief.sceneBinding.sceneTextFingerprint && normalizedPlan.briefFingerprint === visualBriefFingerprint(normalizedBrief) && isSceneVisualBindingCurrent(normalizedPlan.sceneBinding, scenes); } catch { return false; }
}
function normalizeSceneVisualBinding(value: unknown): SceneVisualBinding { const source = object(value, 'Visual scene binding'); keys(source, ['sceneId', 'sceneIndex', 'sceneTextFingerprint'], 'Visual scene binding'); if (!isSceneVisualPlanningId(source.sceneId)) throw new Error('Visual scene binding identity is invalid.'); return freeze({ sceneId: source.sceneId.toLowerCase(), sceneIndex: integer(source.sceneIndex, 0, 999, 'Visual scene binding index'), sceneTextFingerprint: fingerprint(source.sceneTextFingerprint, 'Visual scene text fingerprint') }); }
function normalizeSourceIntent(value: unknown): VisualSourceIntent { const source = object(value, 'Visual source intent'); keys(source, ['allowedSourceKinds', 'commerciallyUsableSourceRequired', 'attributionPreference'], 'Visual source intent'); const allowedSourceKinds = uniqueEnumArray(source.allowedSourceKinds, sources, 'Visual source kinds', 3); if (!allowedSourceKinds.length || typeof source.commerciallyUsableSourceRequired !== 'boolean') throw new Error('Visual source intent is invalid.'); return freeze({ allowedSourceKinds, commerciallyUsableSourceRequired: source.commerciallyUsableSourceRequired, attributionPreference: enumValue(source.attributionPreference, attribution, 'Visual attribution preference') }); }
function normalizeConcept(value: unknown, ordinal: number): VisualQueryConcept { const source = object(value, 'Visual query concept'); keys(source, ['query', 'targetMedia', 'priority', 'category'], 'Visual query concept'); return freeze({ query: text(source.query, `Visual query concept ${ordinal}`, MAX_QUERY_TEXT), targetMedia: enumValue(source.targetMedia, media, 'Visual query concept target media'), priority: integer(source.priority, 1, MAX_CONCEPTS, 'Visual query concept priority'), category: enumValue(source.category, categories, 'Visual query concept category') }); }
function object(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} is invalid.`); return value as Record<string, unknown>; }
function keys(source: Record<string, unknown>, allowed: readonly string[], label: string): void { if (Object.keys(source).some((key) => !allowed.includes(key))) throw new Error(`${label} contains unsupported fields.`); }
function array(value: unknown, label: string): unknown[] { if (!Array.isArray(value)) throw new Error(`${label} is invalid.`); return value; }
function text(value: unknown, label: string, max: number): string { if (typeof value !== 'string') throw new Error(`${label} is invalid.`); const normalized = value.replace(/\r\n?/gu, '\n').trim(); if (!normalized || [...normalized].length > max || URL_LIKE.test(normalized) || hasUnsupportedControlCharacter(normalized)) throw new Error(`${label} is invalid.`); return normalized; }
function hasUnsupportedControlCharacter(value: string): boolean { for (const character of value) { const code = character.codePointAt(0) ?? 0; if ((code <= 0x1f && character !== '\n') || code === 0x7f) return true; } return false; }
function optionalText(value: unknown, label: string, max: number): Record<string, string> { if (value === undefined) return {}; return { [label.slice('Visual brief '.length)]: text(value, label, max) }; }
function uniqueTextArray(value: unknown, label: string, maxItems: number, maxLength: number): readonly string[] { const values = array(value, label); if (values.length > maxItems) throw new Error(`${label} has too many entries.`); const normalized = values.map((item) => text(item, label, maxLength)); if (new Set(normalized.map((item) => item.toLowerCase())).size !== normalized.length) throw new Error(`${label} contains duplicate entries.`); return freezeArray(normalized); }
function uniqueEnumArray<T extends string>(value: unknown, values: ReadonlySet<T>, label: string, maxItems: number): readonly T[] { const input = array(value, label); if (input.length > maxItems) throw new Error(`${label} has too many entries.`); const normalized = input.map((item) => enumValue(item, values, label)); if (new Set(normalized).size !== normalized.length) throw new Error(`${label} contains duplicate entries.`); return freezeArray(normalized); }
function enumValue<T extends string>(value: unknown, values: ReadonlySet<T>, label: string): T { if (typeof value !== 'string' || !values.has(value as T)) throw new Error(`${label} is invalid.`); return value as T; }
function integer(value: unknown, minimum: number, maximum: number, label: string): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid.`); return value; }
function version(value: unknown): typeof VISUAL_INTELLIGENCE_VERSION { if (value !== VISUAL_INTELLIGENCE_VERSION) throw new Error('Visual intelligence planning version is invalid.'); return VISUAL_INTELLIGENCE_VERSION; }
function fingerprint(value: unknown, label: string): string { if (typeof value !== 'string' || !/^[a-z0-9-]{12,96}$/i.test(value)) throw new Error(`${label} is invalid.`); return value; }
function hash(value: string): string { let first = 2166136261; let second = 2246822519; for (let index = 0; index < value.length; index += 1) { const code = value.charCodeAt(index); first = Math.imul(first ^ code, 16777619); second = Math.imul(second ^ code, 3266489917); } return `visual-brief-v1-${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`; }
function isSceneVisualPlanningId(value: unknown): value is string { return typeof value === 'string' && SCENE_ID.test(value); }
function freeze<T extends object>(value: T): T { return Object.freeze(value); } function freezeArray<T>(value: readonly T[]): readonly T[] { return Object.freeze([...value]); } function compareText(left: string, right: string): number { return left === right ? 0 : left < right ? -1 : 1; }
