import {
  VISUAL_INTELLIGENCE_VERSION,
  normalizeSceneVisualBrief,
  normalizeVisualQueryPlan,
  visualBriefFingerprint,
  type SceneVisualBinding,
  type SceneVisualBrief,
  type VisualIntelligencePlanningState,
  type VisualQueryPlan,
} from './visual-intelligence.ts';

export const MAX_VISUAL_PLANNER_SCENES = 8;
export const MAX_VISUAL_PLANNER_SCENE_TEXT = 500;
export const MAX_VISUAL_PLANNER_CONTEXT = 300;
export const MAX_VISUAL_PLANNER_TOTAL_TEXT = 4_000;

export interface VisualPlannerSceneRequest {
  readonly sceneBinding: SceneVisualBinding;
  readonly sceneText: string;
  readonly previousSceneText?: string;
  readonly nextSceneText?: string;
  readonly projectContext?: string;
  readonly visualStylePreference?: string;
  readonly currentMediaType?: 'image' | 'video' | 'none';
  readonly language?: 'en' | 'tr';
}
export interface VisualQueryPlannerRequest { readonly scenes: readonly VisualPlannerSceneRequest[]; }
export interface VisualQueryPlannerResult { readonly status: 'planned'; readonly planning: VisualIntelligencePlanningState; }

const languageValues = new Set(['en', 'tr']);
const mediaValues = new Set(['image', 'video', 'none']);
const urlLike = /(?:https?:\/\/|www\.)/iu;

export function normalizeVisualQueryPlannerRequest(value: unknown): VisualQueryPlannerRequest {
  const source = object(value, 'Visual query planner request');
  keys(source, ['scenes'], 'Visual query planner request');
  if (!Array.isArray(source.scenes) || source.scenes.length === 0 || source.scenes.length > MAX_VISUAL_PLANNER_SCENES) throw new Error('Visual query planner scene count is invalid.');
  const scenes = source.scenes.map((scene, index) => normalizeSceneRequest(scene, index));
  if (new Set(scenes.map((scene) => scene.sceneBinding.sceneIndex)).size !== scenes.length) throw new Error('Visual query planner scene bindings must be unique.');
  const total = scenes.reduce((sum, scene) => sum + scene.sceneText.length + (scene.previousSceneText?.length ?? 0) + (scene.nextSceneText?.length ?? 0) + (scene.projectContext?.length ?? 0) + (scene.visualStylePreference?.length ?? 0), 0);
  if (total > MAX_VISUAL_PLANNER_TOTAL_TEXT) throw new Error('Visual query planner request is too large.');
  return Object.freeze({ scenes: Object.freeze(scenes) });
}

/** The model cannot choose a binding; server-validated input supplies it. */
export function normalizeVisualQueryPlannerModelResult(value: unknown, request: VisualQueryPlannerRequest): VisualQueryPlannerResult {
  const source = object(value, 'Visual query planner model result');
  keys(source, ['plans'], 'Visual query planner model result');
  if (!Array.isArray(source.plans) || source.plans.length !== request.scenes.length) throw new Error('Visual query planner returned an incomplete result.');
  const byIndex = new Map(request.scenes.map((scene) => [scene.sceneBinding.sceneIndex, scene]));
  const seen = new Set<number>();
  const results: Array<{ brief: SceneVisualBrief; queryPlan: VisualQueryPlan }> = [];
  for (const rawPlan of source.plans) {
    const plan = object(rawPlan, 'Visual query planner scene result');
    keys(plan, ['sceneIndex', 'brief', 'concepts'], 'Visual query planner scene result');
    const sceneIndex = plan.sceneIndex;
    if (typeof sceneIndex !== 'number' || !Number.isSafeInteger(sceneIndex) || seen.has(sceneIndex)) throw new Error('Visual query planner returned duplicate scene results.');
    const requestScene = byIndex.get(sceneIndex);
    if (!requestScene) throw new Error('Visual query planner returned an unknown scene result.');
    seen.add(sceneIndex);
    const modelBrief = object(plan.brief, 'Visual query planner brief');
    const brief = normalizeSceneVisualBrief({ ...modelBrief, version: VISUAL_INTELLIGENCE_VERSION, sceneBinding: requestScene.sceneBinding });
    const queryPlan = normalizeVisualQueryPlan({ version: VISUAL_INTELLIGENCE_VERSION, sceneBinding: requestScene.sceneBinding, briefFingerprint: visualBriefFingerprint(brief), concepts: plan.concepts });
    results.push({ brief, queryPlan });
  }
  if (results.length !== request.scenes.length) throw new Error('Visual query planner returned an incomplete result.');
  const planning: VisualIntelligencePlanningState = Object.freeze({ version: VISUAL_INTELLIGENCE_VERSION, briefs: Object.freeze(results.map((result) => result.brief)), queryPlans: Object.freeze(results.map((result) => result.queryPlan)) });
  return Object.freeze({ status: 'planned', planning });
}

function normalizeSceneRequest(value: unknown, index: number): VisualPlannerSceneRequest {
  const label = 'Visual query planner scene ' + (index + 1);
  const source = object(value, label);
  keys(source, ['sceneBinding', 'sceneText', 'previousSceneText', 'nextSceneText', 'projectContext', 'visualStylePreference', 'currentMediaType', 'language'], label);
  const sceneBinding = normalizeSceneVisualBrief({ version: VISUAL_INTELLIGENCE_VERSION, sceneBinding: source.sceneBinding, subject: 'planning binding validation', editorialRole: 'context', preferredMedia: 'either', visualStyleHints: [], visualExclusions: [], noveltyConstraints: [], sourceIntent: { allowedSourceKinds: ['licensed-stock'], commerciallyUsableSourceRequired: true, attributionPreference: 'no-preference' } }).sceneBinding;
  const normalized: {
    sceneBinding: SceneVisualBinding; sceneText: string; previousSceneText?: string; nextSceneText?: string; projectContext?: string; visualStylePreference?: string; currentMediaType?: 'image' | 'video' | 'none'; language?: 'en' | 'tr';
  } = { sceneBinding, sceneText: boundedText(source.sceneText, 'Visual query planner scene text', MAX_VISUAL_PLANNER_SCENE_TEXT), ...optionalText(source.previousSceneText, 'Visual query planner previous context', 'previousSceneText'), ...optionalText(source.nextSceneText, 'Visual query planner next context', 'nextSceneText'), ...optionalText(source.projectContext, 'Visual query planner project context', 'projectContext'), ...optionalText(source.visualStylePreference, 'Visual query planner visual style', 'visualStylePreference') };
  if (source.currentMediaType !== undefined) { if (typeof source.currentMediaType !== 'string' || !mediaValues.has(source.currentMediaType)) throw new Error('Visual query planner current media type is invalid.'); normalized.currentMediaType = source.currentMediaType as 'image' | 'video' | 'none'; }
  if (source.language !== undefined) { if (typeof source.language !== 'string' || !languageValues.has(source.language)) throw new Error('Visual query planner language is invalid.'); normalized.language = source.language as 'en' | 'tr'; }
  return Object.freeze(normalized);
}
function optionalText(value: unknown, label: string, key: string): Record<string, string> { return value === undefined ? {} : { [key]: boundedText(value, label, MAX_VISUAL_PLANNER_CONTEXT) }; }
function boundedText(value: unknown, label: string, max: number): string { if (typeof value !== 'string') throw new Error(label + ' is invalid.'); const normalized = value.replace(/\r\n?/gu, '\n').trim(); if (!normalized || [...normalized].length > max || urlLike.test(normalized) || hasControl(normalized)) throw new Error(label + ' is invalid.'); return normalized; }
function hasControl(value: string): boolean { return [...value].some((character) => { const code = character.codePointAt(0) ?? 0; return (code <= 0x1f && character !== '\n') || code === 0x7f; }); }
function object(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(label + ' is invalid.'); return value as Record<string, unknown>; }
function keys(value: Record<string, unknown>, allowed: readonly string[], label: string): void { if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(label + ' contains unsupported fields.'); }
