import { beforeEach, describe, expect, it } from 'vitest';
import type { RenderManifest } from '@/core/media';
import { createRenderRecoveryStore, MAX_RECOVERY_REQUEST_BYTES } from '@/core/render/renderRecovery';
import type { RenderJobRequest, RenderJobSnapshot } from '@/core/render';

const STORAGE_KEY = 'shortsflow.render-recovery.v1';
const request = (metadata: Record<string, unknown> = {}): RenderJobRequest => ({
  manifest: { projectId: 'project-1', validation: { renderReady: true } } as RenderManifest,
  metadata,
});
const snapshot = (status: RenderJobSnapshot['status']): RenderJobSnapshot => ({
  id: `job-${status}`, projectId: 'project-1', adapterId: 'fake', status,
  stage: status === 'queued' ? 'queued' : 'video', progress: status === 'queued' ? 0 : 50,
  message: status, preset: { id: 'preset', name: 'Preset', container: 'mp4', videoCodec: 'h264', audioCodec: 'aac', quality: 'standard', hardwareAcceleration: 'disabled' },
  output: null, error: null, queuedAt: new Date(0).toISOString(), startedAt: null, completedAt: null, elapsedMs: 0,
});

describe('RenderRecoveryStore', () => {
  beforeEach(() => localStorage.clear());

  it('restore sırasında queued/running kayıtları interrupted yapar', () => {
    const store = createRenderRecoveryStore();
    store.checkpoint(snapshot('queued'), request());
    store.checkpoint(snapshot('rendering'), request());
    const restored = createRenderRecoveryStore().restore();
    expect(restored.interrupted).toHaveLength(2);
    expect(restored.interrupted.every((record) => record.status === 'interrupted')).toBe(true);
  });

  it('request snapshot sınırını uygular', () => {
    const store = createRenderRecoveryStore();
    store.checkpoint(snapshot('queued'), request({ payload: 'x'.repeat(MAX_RECOVERY_REQUEST_BYTES) }));
    expect(store.getReplayRequest('job-queued')).toBeNull();
  });

  it('replay request döndürür ve markReplayed zamanını kaydeder', () => {
    const store = createRenderRecoveryStore();
    store.checkpoint(snapshot('queued'), request({ source: 'test' }));
    expect(store.getReplayRequest('job-queued')?.metadata).toEqual({ source: 'test' });
    store.markReplayed('job-queued');
    expect(store.list()[0].replayedAt).toEqual(expect.any(String));
  });

  it('snapshot içermeyen eski kayıtları güvenli ve non-resumable ele alır', () => {
    const oldRecord = {
      jobId: 'old', projectId: 'p', adapterId: null, status: 'interrupted', stage: 'queued', progress: 0,
      message: 'old', preset: snapshot('queued').preset, manifestProjectId: 'p', requestMetadata: {},
      queuedAt: new Date(0).toISOString(), startedAt: null, updatedAt: new Date(0).toISOString(), completedAt: null, error: null,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([oldRecord]));
    const store = createRenderRecoveryStore();
    expect(store.getReplayRequest('old')).toBeNull();
    expect(store.list()[0].requestSnapshot).toBeNull();
  });
});
