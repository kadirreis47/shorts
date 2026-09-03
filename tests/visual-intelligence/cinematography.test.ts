import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assessCinematography, assessSequenceCinematography } from '@/core/visual-intelligence';

const base = { sceneId: 'scene-a', mediaType: 'image' as const, durationMs: 5_000, width: 1080, height: 1920 };
describe('cinematography intelligence is deterministic and advisory', () => {
  it('uses only coarse factual crop evidence and supported recommendations', () => {
    const result = assessCinematography({ ...base, durationMs: 2_000, width: 1920, height: 1080, quality: { version: 1, grade: 'weak', score: 30, hardRejected: false, reasons: ['heavy-crop-required', 'low-resolution'], factualSignals: [], rankingAdjustment: -10 } });
    expect(result).toMatchObject({ strategy: 'hold', motion: 'none', crop: 'avoid-extra-crop', transition: 'none', supported: true });
    expect(result.reasons).toEqual(expect.arrayContaining(['short-scene', 'high-crop-burden', 'weak-resolution-headroom']));
    expect(JSON.stringify(result)).not.toMatch(/x=|y=|face|saliency|angle|track/iu);
  });
  it('uses evaluated semantic evidence without pretending unavailable semantics were evaluated', () => {
    const available = { version: 1 as const, status: 'available' as const, analyzerVersion: 'visual-semantic-v1', briefFingerprint: 'brief-fingerprint-1234', candidate: { candidateId: 'c', provider: 'pexels', providerMediaIdentity: '1', mediaType: 'image' as const }, signals: [{ dimension: 'subject' as const, state: 'evaluated' as const, interpretation: 'match' as const, confidenceBand: 'high' as const, observation: 'provider-observed-match' as const }] };
    expect(assessCinematography({ ...base, durationMs: 8_000, semantic: available }).strategy).toBe('gentle-push');
    const unavailable = assessCinematography({ ...base, semantic: { ...available, status: 'unavailable' as const, signals: [], unavailableReason: 'provider-unavailable' } });
    expect(unavailable.reasons).toContain('semantic-uncertain');
    expect(unavailable.reasons).not.toContain('strong-semantic-fit');
  });
  it('handles video conservatively and sequence rhythm deterministically', () => {
    expect(assessCinematography({ ...base, mediaType: 'video' }).reasons).toContain('video-evidence-limited');
    const first = assessCinematography({ ...base, sceneId: 'a', priorMotion: 'none' }); const second = assessCinematography({ ...base, sceneId: 'b', priorMotion: 'none' });
    expect(assessSequenceCinematography([first, second])).toEqual(assessSequenceCinematography([first, second]));
    expect(assessSequenceCinematography([first]).rhythm).toBe('insufficient-evidence');
    expect(assessSequenceCinematography([first, second]).rhythm).toBe('insufficient-evidence');
  });
  it('gives safety constraints precedence over semantic emphasis and transition labels', () => {
    const semantic = { version: 1 as const, status: 'available' as const, analyzerVersion: 'visual-semantic-v1', briefFingerprint: 'brief-fingerprint-1234', candidate: { candidateId: 'c', provider: 'pexels', providerMediaIdentity: '1', mediaType: 'image' as const }, signals: [{ dimension: 'subject' as const, state: 'evaluated' as const, interpretation: 'match' as const, confidenceBand: 'high' as const, observation: 'provider-observed-match' as const }] };
    expect(assessCinematography({ ...base, width: 1920, height: 1080, semantic }).motion).toBe('none');
    expect(assessCinematography({ ...base, continuityBoundary: true, priorTransition: 'crossfade' })).toMatchObject({ strategy: 'hold', transition: 'none' });
  });
  it('is advisory UI only and never enters canonical mutation paths', () => {
    const studio = readFileSync('src/views/Studio.tsx', 'utf8');
    const start = studio.indexOf('const cinematography ='); const section = studio.slice(start, start + 700);
    expect(studio).toContain('Cinematography advisory');
    expect(section).not.toContain('setScenes(');
    expect(section).not.toContain('setSelectedVisualCandidates');
    expect(section).not.toContain('saveStudioDraft');
  });
});
