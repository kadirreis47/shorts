import { describe, expect, it } from 'vitest';
import { normalizeStudioDraft, resolveStudioAudioNarrationMode, type StudioDraft } from '@/lib/studioDraft';
import { createStudioProjectDraft, resolveRestoredStudioChannelId, resolveStudioDraftRestore } from '@/services/studioDraftRestore';

describe('Studio draft restore isolation', () => {
  it('requires a durable ElevenLabs narration asset for canonical narration', () => {
    expect(resolveStudioAudioNarrationMode('none')).toBe('silent');
    expect(resolveStudioAudioNarrationMode('browser')).toBe('silent');
    expect(resolveStudioAudioNarrationMode('elevenlabs')).toBe('silent');
    expect(resolveStudioAudioNarrationMode('elevenlabs', true)).toBe('required');
  });

  it('auto-selects one available channel only when the restored draft has no prior selection', () => {
    expect(resolveRestoredStudioChannelId('', ['channel-b'])).toBe('channel-b');
  });

  it('restores the exact saved channel when it remains available', () => {
    expect(resolveRestoredStudioChannelId('channel-a', ['channel-a', 'channel-b'])).toBe('channel-a');
  });

  it('does not substitute the only remaining channel for an unavailable saved channel', () => {
    expect(resolveRestoredStudioChannelId('channel-a', ['channel-b'])).toBe('');
  });

  it('currentProject ile global draft kimliği farklıysa alakasız draftı hydrate etmez', () => {
    const decision = resolveStudioDraftRestore({ currentProjectId: 'project-a', globalDraft: draft('project-b', 'B content'),
      projectDrafts: [], fallbackProjectId: 'fallback' });
    expect(decision).toEqual({ projectId: 'project-a', draft: null });
  });

  it('eşleşen global draftı doğru projeye hydrate eder', () => {
    const matching = draft('project-a', 'A content');
    expect(resolveStudioDraftRestore({ currentProjectId: 'project-a', globalDraft: matching, projectDrafts: [], fallbackProjectId: 'fallback' }).draft)
      .toBe(matching);
  });

  it('alakasız global draft varken kayıtlı projenin kendi Project Store draftını bulur', () => {
    const projectDraft = createStudioProjectDraft(draft('project-a', 'A content'));
    const decision = resolveStudioDraftRestore({ currentProjectId: 'project-a', globalDraft: draft('project-b', 'B content'),
      projectDrafts: [projectDraft], fallbackProjectId: 'fallback' });
    expect(decision.draft?.scenes[0]?.text).toBe('A content');
  });

  it('currentProject yokken mevcut draft kendi projectId değerini korur', () => {
    const existing = draft('draft-project', 'Draft content');
    expect(resolveStudioDraftRestore({ globalDraft: existing, projectDrafts: [], fallbackProjectId: 'fallback' }))
      .toEqual({ projectId: 'draft-project', draft: existing });
  });

  it('autosave kaydını yalnızca draftın gerçek projectId değeriyle oluşturur', () => {
    const saved = createStudioProjectDraft(draft('project-a', 'A content'));
    expect(saved).toMatchObject({ id: 'studio-project-a', projectId: 'project-a' });
    expect(saved.data).toMatchObject({ projectId: 'project-a', scenes: [{ text: 'A content' }] });
  });

  it('proje A ve B içeriklerini restore kararlarında birbirine karıştırmaz', () => {
    const a = createStudioProjectDraft(draft('project-a', 'A content'));
    const b = createStudioProjectDraft(draft('project-b', 'B content'));
    const selected = resolveStudioDraftRestore({ currentProjectId: 'project-b', globalDraft: draft('project-a', 'A global'),
      projectDrafts: [a, b], fallbackProjectId: 'fallback' });
    expect(selected.draft?.projectId).toBe('project-b');
    expect(selected.draft?.scenes[0]?.text).toBe('B content');
  });
  it('hydrates legacy drafts without planning metadata and strips malformed advisory planning only', () => {
    const legacy = normalizeStudioDraft(draft('project-a', 'A content'));
    expect(legacy.visualIntelligence).toBeUndefined();
    expect(legacy.scenes[0].visualPlanningId).toMatch(/^visual-scene-/);
    const malformed = normalizeStudioDraft({ ...legacy, visualIntelligence: { version: 1, briefs: [{ unsafe: true }], queryPlans: [] } as never });
    expect(malformed.visualIntelligence).toBeUndefined();
    expect(malformed.scenes[0].text).toBe('A content');
  });
});

function draft(projectId: string, text: string): StudioDraft {
  return { version: 1, projectId, savedAt: '2026-08-03T00:00:00.000Z', step: 'script', channelId: 'channel',
    topic: 'Topic', niche: 'Niche', tone: 'engaging', duration: 30, title: projectId, hook: '', script: text, cta: '',
    scenes: [{ text, duration: 3, visual: 'Visual' }], captionStyle: 'karaoke', transitionStyle: 'crossfade',
    motionStyle: 'kenburns', useBroll: false, musicId: '', musicVolume: 0.25, visualMode: 'auto', selectedStyleId: '',
    characterName: '', characterAppearance: '', characterArtStyle: 'realistic', characterProfileId: '', watermarkText: '',
    watermarkPosition: 'bottom-right', showSubtitles: true, captionTextColor: '', captionHighlightColor: '', beatSync: false,
    voiceoverMode: 'none', selectedVoice: '', targetLanguage: 'tr' };
}
