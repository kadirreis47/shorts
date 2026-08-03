import { beforeEach, describe, expect, it } from 'vitest';
import { createEditingEngine, createManifestRevisionId, MANIFEST_FINGERPRINT_VERSION } from '@/core/editing';
import { TypedEventBus, type ApplicationEventMap } from '@/core/events';
import { createEditingApplicationService } from '@/services/editingApplicationService';
import { useDirectorReportStore } from '@/store/directorReportStore';
import { editingFixture } from './fixtures';

type FixtureManifest = Awaited<ReturnType<typeof editingFixture>>['manifest'];

describe('Director report manifest revision binding', () => {
  it('creates a plan when the report matches the current manifest fingerprint', async () => { const fixture = await editingFixture(); await expect(service().createPlan(fixture.report, fixture.manifest)).resolves.toBeDefined(); });
  it('rejects the old report after manifest content changes with the same createdAt', async () => { const fixture = await editingFixture(); const changed = structuredClone(fixture.manifest); changed.timeline.scenes[0].text += ' edited'; expect(changed.createdAt).toBe(fixture.manifest.createdAt); await expect(service().createPlan(fixture.report, changed)).rejects.toThrow(/Manifest changed/); });
  it.each([
    ['subtitle', (manifest: FixtureManifest) => { manifest.subtitles.words[0].text += '!'; }],
    ['audio', (manifest: FixtureManifest) => { manifest.audio.automation[0].gain -= 0.1; }],
    ['asset', (manifest: FixtureManifest) => { manifest.assets.push({ id: 'new-asset', type: 'image', source: 'new.png', metadata: {} }); }],
    ['clip', (manifest: FixtureManifest) => { manifest.timeline.tracks[0].clips[0].durationMs -= 1; }],
  ] as const)('rejects a report after a %s change', async (_name, mutate) => { const fixture = await editingFixture(); const changed = structuredClone(fixture.manifest); mutate(changed); await expect(service().createPlan(fixture.report, changed)).rejects.toThrow(/AI Director analysis again/); });
  it('allows reuse after undo restores the exact analyzed fingerprint', async () => { const fixture = await editingFixture(); const edited = structuredClone(fixture.manifest); edited.timeline.scenes[0].text += ' edited'; await expect(service().createPlan(fixture.report, edited)).rejects.toThrow(); await expect(service().createPlan(fixture.report, structuredClone(fixture.manifest))).resolves.toBeDefined(); });
  it('rejects a legacy report without fingerprint binding', async () => { const fixture = await editingFixture(); const legacy = { ...fixture.report, manifestBindingVersion: null, analyzedManifestFingerprint: null, manifestFingerprintVersion: null }; await expect(service().createPlan(legacy, fixture.manifest)).rejects.toThrow(/Manifest changed/); });
  it('keeps a stale report viewable in the report store', async () => { const fixture = await editingFixture(); useDirectorReportStore.getState().analysisCompleted(fixture.report); const changed = structuredClone(fixture.manifest); changed.audio.music[0].gain -= 0.1; await expect(service().createPlan(fixture.report, changed)).rejects.toThrow(); expect(useDirectorReportStore.getState().currentReport).toBe(fixture.report); });
  it('returns an actionable reanalysis error', async () => { const fixture = await editingFixture(); const changed = structuredClone(fixture.manifest); changed.render.width += 1; await expect(service().createPlan(fixture.report, changed)).rejects.toThrow('run AI Director analysis again'); });
  it('rejects a fingerprint mismatch even when project IDs match', async () => { const fixture = await editingFixture(); await expect(service().createPlan({ ...fixture.report, analyzedManifestFingerprint: 'manifest-v2-wrong' }, fixture.manifest)).rejects.toThrow(/Manifest changed/); });
  it('continues to reject a different project ID first', async () => { const fixture = await editingFixture(); await expect(service().createPlan({ ...fixture.report, projectId: 'other' }, fixture.manifest)).rejects.toThrow(/another project/); });
  it('stores the canonical fingerprint version in manifest-backed reports', async () => { const fixture = await editingFixture(); expect(fixture.report).toMatchObject({ manifestBindingVersion: '1.0', manifestFingerprintVersion: MANIFEST_FINGERPRINT_VERSION, analyzedManifestFingerprint: createManifestRevisionId(fixture.manifest) }); });
});

beforeEach(() => useDirectorReportStore.getState().reset());
function service() { return createEditingApplicationService(createEditingEngine(), new TypedEventBus<ApplicationEventMap>()); }
