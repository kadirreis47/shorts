import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AIPublishingStudio } from '@/views/AIPublishingStudio';
import { useExportIntelligenceStore } from '@/store/exportIntelligenceStore';
import { usePublishingStore } from '@/store/publishingStore';
import type { ExportJob } from '@/core/export-intelligence';
import type { PublishAccount, PublishJob } from '@/core/publishing';

const controller = vi.hoisted(() => ({
  buildPublishJob: vi.fn(), previewPublishJob: vi.fn(), approveAndEnqueuePublish: vi.fn(),
  retryPublishJob: vi.fn(), reconcilePublishJob: vi.fn(),
}));
vi.mock('@/services/publishingController', () => controller);
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const originalTimezone = process.env.TZ;
beforeAll(() => { process.env.TZ = 'America/New_York'; });
afterAll(() => { if (originalTimezone === undefined) delete process.env.TZ; else process.env.TZ = originalTimezone; });

const artifact = { path: 'C:/exports/verified.mp4', sizeBytes: 1024, durationMs: 1000, verified: true, contentDigest: 'a'.repeat(64), diagnostics: {}, createdAt: 'now' };
const exportJob = { id: 'export-1', projectId: 'project-1', sourceManifestFingerprint: 'manifest-1', plan: { id: 'variant-1', preset: { name: 'Short' } }, state: 'completed', artifact } as unknown as ExportJob;
const account: PublishAccount = { id: 'youtube:channel-1', platform: 'youtube', accountRef: 'channel-1', channelRef: 'UC-channel-1', displayName: 'Verified channel', credentialRef: 'opaque-credential-ref', authenticated: true, createdAt: 'now' };
function jobFromInput(input: Parameters<typeof controller.buildPublishJob>[0]): PublishJob {
  return {
    id: 'publish-1', projectId: input.projectId, variantId: input.variantId ?? null, target: input.target, accountBinding: input.account,
    artifact: { artifactPath: input.artifact.path, artifactFingerprint: 'artifact-1', projectId: input.projectId, variantId: input.variantId ?? null, exportJobId: 'export-1', verified: true, contentDigest: input.artifact.contentDigest, sizeBytes: input.artifact.sizeBytes, durationMs: input.artifact.durationMs, diagnostics: input.artifact.diagnostics, sourceManifestFingerprint: input.sourceManifestFingerprint },
    metadata: input.metadata, schedule: input.schedule ?? { mode: 'now', scheduledAtUtc: null, timezone: 'UTC' }, state: 'draft', progress: { state: 'draft', percent: 0, message: '', remoteState: null, updatedAt: 'now' }, readiness: { ready: true, status: 'safe', issues: [], warnings: [], diagnostics: [] }, idempotencyKey: 'idempotency-1', approvalFingerprint: null, approvedAt: null, attempts: [], maxAttempts: 3, failure: null, receipt: null, remotePublishId: null, createdAt: 'now', updatedAt: 'now',
  };
}

let container: HTMLDivElement | undefined;
afterEach(() => {
  container?.remove(); container = undefined;
  vi.clearAllMocks();
  useExportIntelligenceStore.setState({ queue: { jobs: [], activeJobId: null, paused: false } });
  usePublishingStore.setState({ accounts: [], queue: { jobs: [], activeJobId: null, paused: false }, handoff: null, videoExportLinks: {} });
});

function setup() {
  controller.buildPublishJob.mockImplementation((input: Parameters<typeof controller.buildPublishJob>[0]) => jobFromInput(input));
  controller.previewPublishJob.mockImplementation(async (job: PublishJob) => ({ ...job, approvalFingerprint: 'approval-1' }));
  controller.approveAndEnqueuePublish.mockImplementation(async (job: PublishJob) => { const queued = { ...job, state: 'queued' as const }; usePublishingStore.getState().updateJob(queued); return queued; });
  useExportIntelligenceStore.setState({ queue: { jobs: [exportJob], activeJobId: null, paused: false } });
  usePublishingStore.setState({ accounts: [account], handoff: null, videoExportLinks: {} });
  container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  return root;
}

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('modern export to publish handoff', () => {
  it('creates and approves a canonical job from a verified artifact without renderer upload IPC', async () => {
    const root = setup();
    await act(async () => { root.render(<AIPublishingStudio />); });
    const title = container!.querySelector<HTMLInputElement>('[aria-label="Title"]')!;
    await act(async () => { setInputValue(title, 'Approved title'); });
    const preview = Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Preview readiness'))!;
    await act(async () => { preview.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(usePublishingStore.getState().queue.jobs).toHaveLength(0);
    expect(controller.buildPublishJob).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'project-1', variantId: 'variant-1', artifact, sourceManifestFingerprint: 'manifest-1', account, target: { platform: 'youtube', accountId: account.id, channelRef: account.channelRef }, schedule: { mode: 'now', scheduledAtUtc: null, timezone: 'UTC' } }));
    const approve = Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Approve and queue'))!;
    await act(async () => { approve.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(controller.approveAndEnqueuePublish).toHaveBeenCalledWith(expect.objectContaining({ approvalFingerprint: 'approval-1' }));
    expect(usePublishingStore.getState().queue.jobs).toHaveLength(1);
    expect(JSON.stringify(controller.buildPublishJob.mock.calls)).not.toContain('accessToken');
    expect(window.electronAPI?.youtube.publish).toBeUndefined();
    await act(async () => { root.unmount(); });
  });

  it('keeps an explicit export handoff deterministic and never substitutes another verified export', async () => {
    const unrelated = { ...exportJob, id: 'export-unrelated', artifact: { ...artifact, path: 'C:/exports/unrelated.mp4', contentDigest: 'b'.repeat(64) } } as ExportJob;
    const selected = { ...exportJob, id: 'export-selected', artifact: { ...artifact, path: 'C:/exports/selected.mp4', contentDigest: 'c'.repeat(64) } } as ExportJob;
    useExportIntelligenceStore.setState({ queue: { jobs: [unrelated, selected], activeJobId: null, paused: false } });
    usePublishingStore.setState({ accounts: [account], handoff: { kind: 'verified-export', exportJobId: selected.id, sourceVideoId: 'video-1' }, videoExportLinks: { 'video-1': selected.id } });
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<AIPublishingStudio />); });
    expect(container!.querySelector<HTMLSelectElement>('[aria-label="Verified export"]')?.value).toBe(selected.id);
    await act(async () => { root.unmount(); });
  });

  it('retains an unverified selected video as the subject instead of selecting an unrelated export', async () => {
    useExportIntelligenceStore.setState({ queue: { jobs: [exportJob], activeJobId: null, paused: false } });
    usePublishingStore.setState({ accounts: [account], handoff: { kind: 'video-needs-verification', sourceVideoId: 'legacy-video', title: 'Selected legacy video', exportJobId: null }, videoExportLinks: {} });
    container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
    await act(async () => { root.render(<AIPublishingStudio />); });
    expect(container!.textContent).toContain('Selected legacy video must be exported and verified');
    const artifactSelect = container!.querySelector<HTMLSelectElement>('[aria-label="Verified export"]')!;
    expect(artifactSelect.value).toBe('');
    expect(artifactSelect.disabled).toBe(true);
    expect(Array.from(artifactSelect.options).some((option) => option.value === exportJob.id)).toBe(false);
    await act(async () => { root.unmount(); });
  });

  it('invalidates preview after approved metadata changes and renders success only from a receipt', async () => {
    const root = setup();
    await act(async () => { root.render(<AIPublishingStudio />); });
    const preview = Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Preview readiness'))!;
    await act(async () => { preview.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const title = container!.querySelector<HTMLInputElement>('[aria-label="Title"]')!;
    await act(async () => { setInputValue(title, 'Changed'); });
    expect(Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Approve and queue'))?.hasAttribute('disabled')).toBe(true);
    await act(async () => { preview.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(usePublishingStore.getState().queue.jobs).toHaveLength(0);
    const published = { ...jobFromInput({ projectId: 'project-1', variantId: 'variant-1', account, target: { platform: 'youtube', accountId: account.id, channelRef: account.channelRef }, artifact, sourceManifestFingerprint: 'manifest-1', metadata: { title: 'Done', description: '', caption: '', hashtags: [], visibility: 'private', language: null, category: null, audienceFlags: {}, thumbnailPath: null, playlistRef: null, commentsEnabled: null } }), state: 'published' as const, receipt: { jobId: 'publish-1', remotePublishId: 'video-1', platform: 'youtube' as const, accountRef: account.accountRef, publishedAt: 'now', artifactFingerprint: 'artifact-1', metadataFingerprint: 'metadata-1', scheduleIntent: { mode: 'now' as const, scheduledAtUtc: null, timezone: 'UTC' }, remoteUrl: 'https://www.youtube.com/watch?v=video-1', verification: { valid: true, remotePublishId: 'video-1', remoteState: 'published' as const, checkedAt: 'now', issues: [] } } };
    usePublishingStore.setState({ queue: { jobs: [published], activeJobId: null, paused: false } });
    await act(async () => {});
    expect(container!.textContent).toContain('Published and verified');
    expect(container!.textContent).toContain('View publication');
    await act(async () => { root.unmount(); });
    expect(usePublishingStore.getState().queue.jobs).toEqual([published]);
  });

  it('creates a canonical local-time schedule and shows it before approval', async () => {
    const root = setup();
    await act(async () => { root.render(<AIPublishingStudio />); });
    const schedule = container!.querySelector<HTMLInputElement>('[aria-label="Schedule"]')!;
    await act(async () => { schedule.click(); });
    const scheduledAt = container!.querySelector<HTMLInputElement>('[aria-label="Scheduled publish date and time"]')!;
    await act(async () => { setInputValue(scheduledAt, '2099-04-05T14:30'); });
    expect(container!.textContent).toContain('Scheduled for');
    const preview = Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Preview readiness'))!;
    await act(async () => { preview.click(); });
    expect(controller.buildPublishJob).toHaveBeenLastCalledWith(expect.objectContaining({ schedule: expect.objectContaining({ mode: 'scheduled', scheduledAtUtc: new Date('2099-04-05T14:30').toISOString() }) }));
    expect(controller.buildPublishJob.mock.lastCall?.[0].schedule.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('blocks scheduled preview when the timestamp is missing or in the past', async () => {
    const root = setup();
    await act(async () => { root.render(<AIPublishingStudio />); });
    await act(async () => { container!.querySelector<HTMLInputElement>('[aria-label="Schedule"]')!.click(); });
    const preview = Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Preview readiness'))!;
    await act(async () => { preview.click(); });
    expect(container!.textContent).toContain('Choose a future date and time');
    const scheduledAt = container!.querySelector<HTMLInputElement>('[aria-label="Scheduled publish date and time"]')!;
    await act(async () => { setInputValue(scheduledAt, '2020-01-01T12:00'); preview.click(); });
    expect(container!.textContent).toContain('Scheduled publish time must not be in the past');
    expect(controller.previewPublishJob).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent local time in a DST spring-forward gap', async () => {
    const root = setup();
    await act(async () => { root.render(<AIPublishingStudio />); });
    await act(async () => { container!.querySelector<HTMLInputElement>('[aria-label="Schedule"]')!.click(); });
    const scheduledAt = container!.querySelector<HTMLInputElement>('[aria-label="Scheduled publish date and time"]')!;
    await act(async () => { setInputValue(scheduledAt, '2026-03-08T02:30'); });
    const preview = Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Preview readiness'))!;
    await act(async () => { preview.click(); });
    expect(container!.textContent).toContain('does not exist in your timezone');
    expect(controller.previewPublishJob).not.toHaveBeenCalled();
    expect(controller.buildPublishJob).not.toHaveBeenCalled();
    expect(container!.querySelector<HTMLInputElement>('[aria-label="Scheduled publish date and time"]')?.value).toBe('2026-03-08T02:30');
  });

  it('invalidates a preview when switching between now and scheduled timing', async () => {
    const root = setup();
    await act(async () => { root.render(<AIPublishingStudio />); });
    const previewButton = () => Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Preview readiness'))!;
    await act(async () => { previewButton().click(); });
    expect(Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Approve and queue'))?.hasAttribute('disabled')).toBe(false);
    await act(async () => { container!.querySelector<HTMLInputElement>('[aria-label="Schedule"]')!.click(); });
    expect(Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Approve and queue'))?.hasAttribute('disabled')).toBe(true);
    await act(async () => { setInputValue(container!.querySelector<HTMLInputElement>('[aria-label="Scheduled publish date and time"]')!, '2099-04-05T14:30'); });
    await act(async () => { previewButton().click(); });
    expect(controller.buildPublishJob).toHaveBeenLastCalledWith(expect.objectContaining({ schedule: expect.objectContaining({ mode: 'scheduled' }) }));
    await act(async () => { setInputValue(container!.querySelector<HTMLInputElement>('[aria-label="Scheduled publish date and time"]')!, '2099-04-05T15:30'); });
    expect(Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Approve and queue'))?.hasAttribute('disabled')).toBe(true);
  });

  it('clears an exact handoff only after enqueue succeeds', async () => {
    const root = setup();
    usePublishingStore.getState().setHandoff({ kind: 'verified-export', exportJobId: exportJob.id, sourceVideoId: 'video-1' });
    await act(async () => { root.render(<AIPublishingStudio />); });
    const preview = Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Preview readiness'))!;
    await act(async () => { preview.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const approve = Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Approve and queue'))!;
    await act(async () => { approve.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(usePublishingStore.getState().handoff).toBeNull();
    expect(container!.querySelector<HTMLSelectElement>('[aria-label="Verified export"]')?.disabled).toBe(false);
    expect(usePublishingStore.getState().queue.jobs).toHaveLength(1);
    await act(async () => { root.unmount(); });
  });

  it('preserves the exact handoff when enqueue fails', async () => {
    const root = setup();
    const handoff = { kind: 'verified-export' as const, exportJobId: exportJob.id, sourceVideoId: 'video-1' };
    usePublishingStore.getState().setHandoff(handoff);
    controller.approveAndEnqueuePublish.mockRejectedValueOnce(new Error('queue unavailable'));
    await act(async () => { root.render(<AIPublishingStudio />); });
    const preview = Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Preview readiness'))!;
    await act(async () => { preview.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const approve = Array.from(container!.querySelectorAll('button')).find((button) => button.textContent?.includes('Approve and queue'))!;
    await act(async () => { approve.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(usePublishingStore.getState().handoff).toEqual(handoff);
    expect(usePublishingStore.getState().queue.jobs).toHaveLength(0);
    await act(async () => { root.unmount(); });
  });

  it('does not offer a legacy renderer publishing call from Studio or Videos', () => {
    for (const file of ['src/views/Studio.tsx', 'src/views/Videos.tsx']) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('publishToYouTube(');
      expect(source).not.toContain('getYouTubeAuthUrl(');
    }
    const studio = readFileSync('src/views/Studio.tsx', 'utf8');
    expect(studio).toContain("planActiveExport('youtube-shorts')");
    expect(studio).toContain("kind: 'verified-export', exportJobId: exportJob.id");
    const videos = readFileSync('src/views/Videos.tsx', 'utf8');
    expect(videos).toContain('publishing.videoExportLinks[video.id]');
    expect(videos).toContain('resolveVideoPublishingHandoff(video, linkedJob)');
    expect(videos).toContain('useExportIntelligenceStore.getState().queue.jobs.find');
  });
});
