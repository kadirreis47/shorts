import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { editingFixture } from '../editing/fixtures';
import type { ExportJob, ExportPlan } from '@/core/export-intelligence';
import { useExportIntelligenceStore } from '@/store/exportIntelligenceStore';
import { useMediaStore } from '@/store/mediaStore';
import { resolveVideoPublishingHandoff, usePublishingStore } from '@/store/publishingStore';
import { useUIStore } from '@/store/uiStore';

const mocks = vi.hoisted(() => ({
  loadExportCapabilities: vi.fn(),
  planActiveExport: vi.fn(),
  enqueueActiveExport: vi.fn(),
  retryExportJob: vi.fn(),
  buildProject: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/services/exportIntelligenceController', () => ({
  loadExportCapabilities: mocks.loadExportCapabilities,
  planActiveExport: mocks.planActiveExport,
  enqueueActiveExport: mocks.enqueueActiveExport,
  retryExportJob: mocks.retryExportJob,
}));
vi.mock('@/core/di', () => ({ applicationContainer: { resolve: () => ({ buildProject: mocks.buildProject }) }, dependencyTokens: { mediaEngine: Symbol('mediaEngine') } }));
vi.mock('@/lib/supabase', () => ({ supabase: { from: mocks.from } }));

import { AIExportStudio } from '@/views/AIExportStudio';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement | undefined;

afterEach(() => {
  container?.remove(); container = undefined;
  vi.clearAllMocks();
  useExportIntelligenceStore.setState({ capability: null, currentPlan: null, queue: { jobs: [], activeJobId: null, paused: false }, lastError: null });
  usePublishingStore.setState({ handoff: null, videoExportLinks: {} });
  useMediaStore.getState().clearMediaProject();
  useUIStore.setState({ currentView: 'dashboard' });
});

describe('rendered video export handoff', () => {
  it.each(['queued', 'rendering', 'verifying', 'failed', 'cancelled', 'interrupted'] as const)('does not treat a linked %s export as verified', (state) => {
    const job = { id: `export-${state}`, state, artifact: null } as unknown as ExportJob;
    expect(resolveVideoPublishingHandoff({ id: 'video-selected', title: 'Selected video' }, job)).toEqual({ kind: 'video-needs-verification', sourceVideoId: 'video-selected', title: 'Selected video', exportJobId: job.id, target: null });
  });

  it('treats a missing linked export as stale and preserves the selected video for a new export', () => {
    expect(resolveVideoPublishingHandoff({ id: 'video-selected', title: 'Selected video' }, null)).toEqual({ kind: 'video-needs-verification', sourceVideoId: 'video-selected', title: 'Selected video', exportJobId: null, target: null });
  });

  it('builds the exact selected video and promotes its link only after verified completion', async () => {
    mocks.loadExportCapabilities.mockResolvedValue(undefined);
    const fixture = await editingFixture();
    const plan = { id: 'plan-selected', projectId: 'rendered-video-video-selected', preset: { id: 'youtube-shorts', name: 'YouTube Shorts' }, blockingIssues: [] } as unknown as ExportPlan;
    const queued = { id: 'export-selected', projectId: plan.projectId, plan, state: 'queued', artifact: null, progress: { percent: 0 } } as unknown as ExportJob;
    const unrelated = { ...queued, id: 'export-unrelated', state: 'completed', artifact: { path: 'C:/exports/unrelated.mp4', verified: true, contentDigest: 'b'.repeat(64), sizeBytes: 100, durationMs: 1000, diagnostics: {}, createdAt: 'now' } } as ExportJob;
    const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn() };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    query.single.mockResolvedValue({ data: { id: 'video-selected', title: 'Selected video', scenes: fixture.project.scenes.map((scene) => scene.sourceScene) }, error: null });
    mocks.from.mockReturnValue(query);
    mocks.buildProject.mockResolvedValue(fixture);
    mocks.planActiveExport.mockImplementation(async () => { useExportIntelligenceStore.setState({ currentPlan: plan }); return plan; });
    mocks.enqueueActiveExport.mockImplementation(async () => { useExportIntelligenceStore.setState({ queue: { jobs: [unrelated, queued], activeJobId: queued.id, paused: false } }); return queued; });
    useExportIntelligenceStore.setState({ capability: { ffmpeg: true, ffprobe: true, encoders: [], hardwareEncoders: [], supports: {}, raw: null, version: 'test', detectedAt: 'now' }, queue: { jobs: [unrelated], activeJobId: null, paused: false } });
    const target = { platform: 'youtube' as const, publishingAccountId: 'youtube:UC-selected', channelRef: 'UC-selected' };
    usePublishingStore.setState({ handoff: { kind: 'video-needs-verification', sourceVideoId: 'video-selected', title: 'Selected video', exportJobId: null, target }, videoExportLinks: {} });
    window.electronAPI = { ...window.electronAPI, ffmpeg: { ...window.electronAPI?.ffmpeg, pickOutputPath: vi.fn().mockResolvedValue('C:/exports/selected.mp4') } } as typeof window.electronAPI;
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<AIExportStudio />); });
    const planButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Plan export')!;
    await act(async () => { planButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(query.eq).toHaveBeenCalledWith('id', 'video-selected');
    expect(query.select).toHaveBeenCalledWith('id,title,scenes,narration_mode');
    expect(mocks.buildProject).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'rendered-video-video-selected',
      title: 'Selected video',
      audio: { narrationMode: 'required' },
    }));
    const destinationButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Select destination')!;
    await act(async () => { destinationButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const queueButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Queue export')!;
    await act(async () => { queueButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(usePublishingStore.getState().handoff).toEqual(expect.objectContaining({ sourceVideoId: 'video-selected', exportJobId: 'export-selected' }));
    expect(usePublishingStore.getState().videoExportLinks).toEqual({});
    const completed = { ...queued, state: 'completed' as const, artifact: { path: 'C:/exports/selected.mp4', verified: true, contentDigest: 'a'.repeat(64), sizeBytes: 100, durationMs: 1000, diagnostics: {}, createdAt: 'now' } } as ExportJob;
    await act(async () => { useExportIntelligenceStore.setState({ queue: { jobs: [unrelated, completed], activeJobId: null, paused: false } }); });
    expect(usePublishingStore.getState().videoExportLinks).toEqual({ 'video-selected': 'export-selected' });
    expect(usePublishingStore.getState().handoff).toEqual({ kind: 'verified-export', exportJobId: 'export-selected', sourceVideoId: 'video-selected', target });
    expect(useUIStore.getState().currentView).toBe('publishing-studio');
    await act(async () => { root.unmount(); });
  });

  it('rebuilds an explicitly silent saved video as silent', async () => {
    mocks.loadExportCapabilities.mockResolvedValue(undefined);
    const fixture = await editingFixture();
    const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn() };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    query.single.mockResolvedValue({ data: { id: 'video-silent', title: 'Silent video', scenes: fixture.project.scenes.map((scene) => scene.sourceScene), narration_mode: 'silent' }, error: null });
    mocks.from.mockReturnValue(query);
    mocks.buildProject.mockResolvedValue({ ...fixture, project: { ...fixture.project, audio: { ...fixture.project.audio, narrationMode: 'silent', voice: [], automation: [] } } });
    mocks.planActiveExport.mockResolvedValue({ id: 'plan-silent', blockingIssues: [] });
    useExportIntelligenceStore.setState({ capability: { ffmpeg: true, ffprobe: true, encoders: [], hardwareEncoders: [], supports: {}, raw: null, version: 'test', detectedAt: 'now' } });
    usePublishingStore.setState({ handoff: { kind: 'video-needs-verification', sourceVideoId: 'video-silent', title: 'Silent video', exportJobId: null, target: null }, videoExportLinks: {} });
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<AIExportStudio />); });
    const planButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Plan export')!;
    await act(async () => { planButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(mocks.buildProject).toHaveBeenCalledWith(expect.objectContaining({ audio: { narrationMode: 'silent' } }));
    await act(async () => { root.unmount(); });
  });

  it.each(['failed', 'cancelled', 'interrupted'] as const)('does not promote a %s export to a verified link', async (state) => {
    mocks.loadExportCapabilities.mockResolvedValue(undefined);
    const failed = { id: 'export-bad', state, artifact: null, failure: { retryable: state !== 'cancelled' }, progress: { percent: 10 }, plan: { preset: { name: 'YouTube Shorts' } } } as unknown as ExportJob;
    useExportIntelligenceStore.setState({ capability: { ffmpeg: true, ffprobe: true, encoders: [], hardwareEncoders: [], supports: {}, raw: null, version: 'test', detectedAt: 'now' }, queue: { jobs: [failed], activeJobId: null, paused: false } });
    usePublishingStore.setState({ handoff: { kind: 'video-needs-verification', sourceVideoId: 'video-selected', title: 'Selected video', exportJobId: failed.id, target: null }, videoExportLinks: {} });
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<AIExportStudio />); });
    expect(usePublishingStore.getState().videoExportLinks).toEqual({});
    expect(usePublishingStore.getState().handoff?.kind).toBe('video-needs-verification');
    expect(container.textContent).toMatch(/Retry this export|Start a new export for this video/);
    await act(async () => { root.unmount(); });
  });
});
