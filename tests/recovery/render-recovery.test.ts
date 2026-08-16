import { beforeEach, describe, expect, it } from 'vitest';
import type { RenderManifest } from '@/core/media';
import { createRenderRecoveryStore, MAX_RECOVERY_REQUEST_BYTES } from '@/core/render/renderRecovery';
import type { RenderJobRequest, RenderJobSnapshot } from '@/core/render';
import { useAuthSessionStore } from '@/auth/session';
import { setValidatedOwnerId } from '@/auth/identity';
import { writeUserScopedLocalStorage } from '@/persistence/userScopedStorage';

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
  beforeEach(() => {
    localStorage.clear();
    setValidatedOwnerId('recovery-user');
    useAuthSessionStore.setState({ status: 'authenticated', user: { id: 'recovery-user' } as never, session: { access_token: 'token' } as never, error: null });
  });

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
    writeUserScopedLocalStorage(STORAGE_KEY, JSON.stringify([oldRecord]));
    const store = createRenderRecoveryStore();
    expect(store.getReplayRequest('old')).toBeNull();
    expect(store.list()[0].requestSnapshot).toBeNull();
  });

  it('private Storage source signed olsa bile sadece canonical identity saklar', () => {
    const stableSource = 'shortsflow-storage://media/recovery-user/generated-images/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
    const signedSource = 'https://example.supabase.co/storage/v1/object/sign/media/recovery-user/generated-images/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png?token=old-signed-token';
    const store = createRenderRecoveryStore();
    store.checkpoint(snapshot('queued'), {
      ...request(),
      manifest: {
        projectId: 'project-1', validation: { renderReady: true },
        assets: [{
          id: 'asset-1', type: 'image', source: signedSource,
          metadata: {
            storageBucket: 'media',
            storageObjectPath: 'recovery-user/generated-images/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png',
          },
        }],
      } as unknown as RenderManifest,
    });

    const replay = store.getReplayRequest('job-queued');
    expect(replay?.manifest.assets[0]?.source).toBe(stableSource);
    expect(JSON.stringify(store.list())).not.toContain('https://');
    expect(JSON.stringify(store.list())).not.toContain('old-signed-token');
  });

  it('fails closed instead of persisting an unbound private signed URL', () => {
    const store = createRenderRecoveryStore();
    store.checkpoint(snapshot('queued'), {
      ...request(),
      manifest: {
        projectId: 'project-1', validation: { renderReady: true },
        assets: [{ id: 'asset-1', type: 'image', source: 'https://example.supabase.co/storage/v1/object/sign/media/unbound.png?token=expired' }],
      } as unknown as RenderManifest,
    });
    expect(store.getReplayRequest('job-queued')).toBeNull();
    expect(JSON.stringify(store.list())).not.toContain('token=expired');
  });
});
