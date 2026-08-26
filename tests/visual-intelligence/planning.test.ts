import { describe, expect, it } from 'vitest';
import {
  createSceneVisualBinding,
  ensureSceneVisualPlanningIds,
  isSceneVisualBindingCurrent,
  isVisualQueryPlanCurrent,
  normalizeSceneVisualBrief,
  normalizeVisualIntelligencePlanningState,
  normalizeVisualQueryPlan,
  visualBriefFingerprint,
} from '@/core/visual-intelligence';
import type { Scene } from '@/lib/types';
import { canonicalStudioOutputScenes } from '@/lib/studioOutputIdentity';
import { normalizeStudioDraft, type StudioDraft } from '@/lib/studioDraft';

const SCENE_A = 'visual-scene-00000000-0000-4000-8000-000000000001';
const SCENE_B = 'visual-scene-00000000-0000-4000-8000-000000000002';

describe('Premium visual-intelligence planning domain', () => {
  it('accepts bounded Unicode editorial intent as immutable plain planning data', () => {
    const scenes = sceneList();
    const normalized = normalizeSceneVisualBrief(brief(createSceneVisualBinding(scenes, 0)));
    expect(normalized).toMatchObject({ subject: 'İstanbul’da tarihi tramvay', editorialRole: 'hook', preferredMedia: 'either' });
    expect(normalized.visualStyleHints).toEqual(['sinematik', 'yağmurlu gece']);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.visualStyleHints)).toBe(true);
    expect(JSON.parse(JSON.stringify(normalized))).toEqual(normalized);
  });

  it('rejects unsafe shapes, URLs, malformed enums, noise, and unbounded concept payloads', () => {
    const scenes = sceneList();
    const validBrief = brief(createSceneVisualBinding(scenes, 0));
    expect(() => normalizeSceneVisualBrief({ ...validBrief, editorialRole: 'director-command' })).toThrow(/editorial role/i);
    expect(() => normalizeSceneVisualBrief({ ...validBrief, subject: 'x'.repeat(121) })).toThrow(/subject/i);
    expect(() => normalizeSceneVisualBrief({ ...validBrief, subject: 'https://untrusted.example/image.jpg' })).toThrow(/subject/i);
    expect(() => normalizeSceneVisualBrief({ ...validBrief, imageUrl: 'https://untrusted.example/image.jpg' })).toThrow(/unsupported fields/i);
    expect(() => normalizeSceneVisualBrief({ ...validBrief, visualStyleHints: ['cinematic', 'CINEMATIC'] })).toThrow(/duplicate/i);
    const validPlan = plan(validBrief);
    expect(() => normalizeVisualQueryPlan({ ...validPlan, concepts: validPlan.concepts.slice(0, 2) })).toThrow(/requires 3-6/i);
    expect(() => normalizeVisualQueryPlan({ ...validPlan, concepts: validPlan.concepts.map((item) => ({ ...item, priority: 1 })) })).toThrow(/unique priorities/i);
    expect(() => normalizeVisualQueryPlan({ ...validPlan, concepts: [...validPlan.concepts, { query: 'https://provider.example/file.mp4', targetMedia: 'video', priority: 4, category: 'action' }] })).toThrow(/concept/i);
  });

  it('detects edits, reorder, insert, and deletion conservatively without rebinding a plan to another scene', () => {
    const scenes = sceneList();
    const binding = createSceneVisualBinding(scenes, 1);
    expect(isSceneVisualBindingCurrent(binding, scenes)).toBe(true);
    expect(isSceneVisualBindingCurrent(binding, [{ ...scenes[0], text: 'Inserted' }, ...scenes])).toBe(false);
    expect(isSceneVisualBindingCurrent(binding, [scenes[1], scenes[0]])).toBe(false);
    expect(isSceneVisualBindingCurrent(binding, [scenes[0], { ...scenes[1], text: 'Edited authored scene' }])).toBe(false);
    expect(isSceneVisualBindingCurrent(binding, [scenes[0]])).toBe(false);
  });

  it('keeps a query plan current only for the exact matching brief and scene binding', () => {
    const scenes = sceneList();
    const currentBrief = normalizeSceneVisualBrief(brief(createSceneVisualBinding(scenes, 0)));
    const currentPlan = normalizeVisualQueryPlan(plan(currentBrief));
    expect(isVisualQueryPlanCurrent(currentPlan, currentBrief, scenes)).toBe(true);
    expect(isVisualQueryPlanCurrent(currentPlan, { ...currentBrief, mood: 'gündüz' }, scenes)).toBe(false);
    expect(isVisualQueryPlanCurrent(currentPlan, currentBrief, [scenes[1], scenes[0]])).toBe(false);
  });

  it('accepts missing legacy planning metadata and rejects incomplete persisted state', () => {
    expect(normalizeVisualIntelligencePlanningState(undefined)).toBeUndefined();
    const scenes = sceneList();
    const currentBrief = normalizeSceneVisualBrief(brief(createSceneVisualBinding(scenes, 0)));
    const state = normalizeVisualIntelligencePlanningState({ version: 1, briefs: [currentBrief], queryPlans: [plan(currentBrief)] });
    expect(state?.briefs).toHaveLength(1);
    expect(() => normalizeVisualIntelligencePlanningState({ version: 1, briefs: [currentBrief], queryPlans: [] })).toThrow(/exactly one query plan/i);
    expect(() => normalizeVisualIntelligencePlanningState({ version: 1, briefs: [currentBrief], queryPlans: [{ sceneBinding: currentBrief.sceneBinding }] })).toThrow();
    expect(() => normalizeVisualIntelligencePlanningState({ version: 1, briefs: Array.from({ length: 101 }, () => currentBrief), queryPlans: [] })).toThrow(/too many/i);
    expect(() => normalizeVisualIntelligencePlanningState({
      version: 1,
      briefs: [currentBrief],
      queryPlans: [{ ...plan(currentBrief), sceneBinding: { ...currentBrief.sceneBinding, sceneIndex: 1 } }],
    })).toThrow(/exact matching/i);
  });

  it('round-trips valid planning through the optional Studio draft metadata without making it Recipe input', () => {
    const scenes = sceneList();
    const currentBrief = normalizeSceneVisualBrief(brief(createSceneVisualBinding(scenes, 0)));
    const draft = normalizeStudioDraft({ scenes, visualIntelligence: { version: 1, briefs: [currentBrief], queryPlans: [plan(currentBrief)] } } as unknown as StudioDraft);
    expect(JSON.parse(JSON.stringify(draft)).visualIntelligence).toEqual(draft.visualIntelligence);
    expect(draft.visualIntelligence?.queryPlans[0]?.briefFingerprint).toBe(visualBriefFingerprint(currentBrief));
  });

  it('assigns missing planning IDs without altering authored scene content or durable media identity', () => {
    const legacy: Scene[] = [{ text: 'Legacy scene', duration: 3, visual: 'Visual', imageStorage: { bucket: 'media', objectPath: 'owner/generated-images/00000000-0000-4000-8000-000000000001.png' } }];
    const normalized = ensureSceneVisualPlanningIds(legacy);
    expect(normalized[0]).toMatchObject({ text: 'Legacy scene', duration: 3, imageStorage: legacy[0].imageStorage, visualPlanningId: expect.stringMatching(/^visual-scene-/) });
  });

  it('excludes planning-only scene identity from canonical Studio output freshness inputs', () => {
    const first = sceneList();
    const changed = [{ ...first[0], visualPlanningId: SCENE_B }, first[1]];
    expect(canonicalStudioOutputScenes(first)).toEqual(canonicalStudioOutputScenes(changed));
  });
});

function sceneList(): Scene[] {
  return [
    { visualPlanningId: SCENE_A, text: 'İstanbul’da tarihi tramvay', duration: 4, visual: 'Tramvay' },
    { visualPlanningId: SCENE_B, text: 'Yağmurlu sokakta yolcular', duration: 4, visual: 'Sokak' },
  ];
}

function brief(binding: ReturnType<typeof createSceneVisualBinding>) {
  return {
    version: 1, sceneBinding: binding, subject: 'İstanbul’da tarihi tramvay', setting: 'şehir merkezi', mood: 'nostaljik', lighting: 'akşam ışığı', editorialRole: 'hook', preferredMedia: 'either',
    visualStyleHints: ['sinematik', 'yağmurlu gece'], visualExclusions: ['kalabalık selfie'], noveltyConstraints: ['vary-subject-framing'],
    sourceIntent: { allowedSourceKinds: ['licensed-stock', 'ai-generated'], commerciallyUsableSourceRequired: true, attributionPreference: 'prefer-available' },
  } as const;
}

function plan(value: ReturnType<typeof normalizeSceneVisualBrief>) {
  return {
    version: 1, sceneBinding: value.sceneBinding, briefFingerprint: visualBriefFingerprint(value),
    concepts: [
      { query: 'historic Istanbul tram rain cinematic', targetMedia: 'video', priority: 1, category: 'action' },
      { query: 'Istanbul tram detail warm lights', targetMedia: 'image', priority: 2, category: 'detail' },
      { query: 'rainy Istanbul street atmosphere', targetMedia: 'either', priority: 3, category: 'atmosphere' },
    ],
  } as const;
}
