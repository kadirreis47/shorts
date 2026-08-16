import { describe, expect, it, vi } from 'vitest';
import { TypedEventBus } from '@/core/events';
import type { ApplicationEventMap } from '@/core/events';
import type { RenderManifest } from '@/core/media';
import { createRenderEngine } from '@/core/render/renderEngine';
import type { RenderAdapter, RenderCache, RenderExecutionContext, RenderOutput, RenderRecoveryStore } from '@/core/render';

const manifest = (projectId = 'project-1'): RenderManifest => ({
  projectId,
  validation: {
    valid: true, renderReady: true, score: 100, issues: [],
    scoreBreakdown: { assets: 100, timeline: 100, subtitles: 100, audio: 100 },
    errorCount: 0, warningCount: 0, infoCount: 0, validatedAt: new Date(0).toISOString(),
  },
} as unknown as RenderManifest);

const output = (uri = 'test://output.mp4'): RenderOutput => ({
  kind: 'video', uri, mimeType: 'video/mp4', sizeBytes: 128, durationMs: 10, metadata: {},
});

const waitFor = async (condition: () => boolean, timeoutMs = 1_000) => {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('Test condition timed out.');
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
};

const adapter = (render: RenderAdapter['render']): RenderAdapter => ({
  id: 'fake', name: 'Fake adapter', canRender: () => true, render,
});

const setup = (fakeAdapter: RenderAdapter, options: Parameters<typeof createRenderEngine>[2] = {}) => {
  const bus = new TypedEventBus<ApplicationEventMap>();
  const engine = createRenderEngine(bus, [fakeAdapter], options);
  return { bus, engine };
};

describe('RenderEngine', () => {
  it('submit, progress ve completed akışını yayınlar', async () => {
    const completed = vi.fn();
    const progress = vi.fn();
    const { bus, engine } = setup(adapter(async (context) => {
      await context.reportProgress({ stage: 'video', progress: 50, message: 'half' });
      return output();
    }));
    bus.on('render:job-progress', progress);
    bus.on('render:job-completed', completed);
    const submitted = await engine.submit({ manifest: manifest() });
    await waitFor(() => engine.getJob(submitted.id)?.status === 'completed');
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ progress: 50 }));
    expect(completed).toHaveBeenCalledOnce();
    expect(engine.getJob(submitted.id)?.output?.uri).toBe('test://output.mp4');
  });

  it('concurrency sınırını uygular', async () => {
    let active = 0;
    let maximum = 0;
    const releases: Array<() => void> = [];
    const { engine } = setup(adapter(async () => {
      active += 1; maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1; return output();
    }), { concurrency: 2 });
    const jobs = await Promise.all([1, 2, 3].map((id) => engine.submit({ manifest: manifest(`p-${id}`) })));
    await waitFor(() => releases.length === 2);
    expect(maximum).toBe(2);
    releases.splice(0).forEach((release) => release());
    await waitFor(() => releases.length === 1);
    releases.pop()?.();
    await waitFor(() => jobs.every((job) => engine.getJob(job.id)?.status === 'completed'));
  });

  it('pause/resume ile sıradaki işi kontrol eder', async () => {
    const render = vi.fn<RenderAdapter['render']>(async () => output());
    const { engine } = setup(adapter(render));
    engine.pauseQueue();
    const job = await engine.submit({ manifest: manifest() });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(render).not.toHaveBeenCalled();
    expect(engine.getJob(job.id)?.status).toBe('queued');
    engine.resumeQueue();
    await waitFor(() => engine.getJob(job.id)?.status === 'completed');
  });

  it('queued ve çalışan işleri iptal eder', async () => {
    const { engine } = setup(adapter((context) => new Promise((_, reject) => {
      context.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')));
    })));
    const job = await engine.submit({ manifest: manifest() });
    await waitFor(() => engine.getJob(job.id)?.status === 'preparing');
    expect(engine.cancel(job.id)).toBe(true);
    await waitFor(() => engine.getJob(job.id)?.status === 'cancelled');
  });

  it('failed işi public retry API ile yeniden gönderir', async () => {
    let fail = true;
    const { engine } = setup(adapter(async () => {
      if (fail) throw new Error('configuration invalid');
      return output();
    }));
    const first = await engine.submit({ manifest: manifest() });
    await waitFor(() => engine.getJob(first.id)?.status === 'failed');
    fail = false;
    const retried = await engine.retry(first.id);
    expect(retried.id).not.toBe(first.id);
    await waitFor(() => engine.getJob(retried.id)?.status === 'completed');
  });

  it('cache hit olduğunda adapterı çalıştırmadan tamamlar', async () => {
    const render = vi.fn(async () => output());
    const cache: RenderCache = {
      get: vi.fn(async (fingerprint) => ({ fingerprint, projectId: 'project-1', adapterId: 'fake', output: output('cache://hit'), createdAt: '', lastAccessedAt: '', hitCount: 1, savedRenderMs: 500 })),
      put: vi.fn(), remove: vi.fn(), clear: vi.fn(),
      stats: () => ({ entries: 1, hits: 1, misses: 0, invalidEntries: 0, savedRenderMs: 500 }),
    };
    const { engine } = setup(adapter(render), { cache });
    const job = await engine.submit({ manifest: manifest() });
    expect(job.status).toBe('completed');
    expect(job.output?.metadata.cacheHit).toBe(true);
    expect(render).not.toHaveBeenCalled();
  });

  it('temporary hata için retry yapar ve circuit-open işini reddeder', async () => {
    const render = vi.fn<RenderAdapter['render']>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(output());
    const retrying = vi.fn();
    const { bus, engine } = setup(adapter(render), { retryPolicy: { baseDelayMs: 1, maxDelayMs: 1 } });
    bus.on('render:job-retrying', retrying);
    const job = await engine.submit({ manifest: manifest() });
    await waitFor(() => engine.getJob(job.id)?.status === 'completed');
    expect(render).toHaveBeenCalledTimes(2);
    expect(retrying).toHaveBeenCalledOnce();

    const circuitBreaker = {
      canExecute: () => false, recordSuccess: vi.fn(), recordFailure: vi.fn(), reset: vi.fn(),
      snapshot: () => ({ adapterId: 'fake', state: 'open' as const, consecutiveFailures: 3, openedAt: new Date().toISOString(), retryAfterMs: 500 }),
    };
    const blocked = setup(adapter(vi.fn(async () => output())), { circuitBreaker });
    const blockedJob = await blocked.engine.submit({ manifest: manifest('blocked') });
    await waitFor(() => blocked.engine.getJob(blockedJob.id)?.status === 'failed');
  });

  it('queued/progress/completed recovery checkpointlarını kaydeder', async () => {
    const recovery: RenderRecoveryStore = {
      restore: vi.fn(() => ({ records: [], interrupted: [] })),
      checkpoint: vi.fn(), markInterrupted: vi.fn(), remove: vi.fn(), clearTerminal: vi.fn(),
      getReplayRequest: vi.fn(() => null), markReplayed: vi.fn(), list: vi.fn(() => []),
    };
    const { engine } = setup(adapter(async (context: RenderExecutionContext) => {
      await context.reportProgress({ stage: 'video', progress: 25, message: 'rendering' });
      return output();
    }), { recoveryStore: recovery });
    const job = await engine.submit({ manifest: manifest() });
    await waitFor(() => engine.getJob(job.id)?.status === 'completed');
    expect(recovery.checkpoint).toHaveBeenCalledWith(expect.objectContaining({ status: 'queued' }), expect.anything());
    expect(recovery.checkpoint).toHaveBeenCalledWith(expect.objectContaining({ progress: 25 }), expect.anything());
    expect(recovery.checkpoint).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }), expect.anything());
  });

  it('checkpoints canonical Storage identity while the adapter receives a fresh signed URL', async () => {
    const stableSource = 'shortsflow-storage://media/render-user/generated-images/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
    const canonicalManifest = {
      ...manifest(),
      assets: [{
        id: 'asset-1', type: 'image', source: stableSource,
        metadata: {
          storageBucket: 'media',
          storageObjectPath: 'render-user/generated-images/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png',
        },
      }],
    } as RenderManifest;
    const recovery: RenderRecoveryStore = {
      restore: vi.fn(() => ({ records: [], interrupted: [] })),
      checkpoint: vi.fn(), markInterrupted: vi.fn(), remove: vi.fn(), clearTerminal: vi.fn(),
      getReplayRequest: vi.fn(() => null), markReplayed: vi.fn(), list: vi.fn(() => []),
    };
    const executionSource = 'https://example.supabase.co/storage/v1/object/sign/media/render-user/generated-images/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png?token=fresh';
    const render = vi.fn<RenderAdapter['render']>(async () => output());
    const { engine } = setup(adapter(render), {
      recoveryStore: recovery,
      materializeManifestForExecution: async (value) => ({
        ...value,
        assets: value.assets.map((asset) => ({ ...asset, source: executionSource })),
      }),
    });

    const job = await engine.submit({ manifest: canonicalManifest });
    await waitFor(() => engine.getJob(job.id)?.status === 'completed');

    expect(render.mock.calls[0]?.[0].manifest.assets[0]?.source).toBe(executionSource);
    const checkpointRequests = (recovery.checkpoint as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[1]);
    expect(checkpointRequests).not.toHaveLength(0);
    expect(checkpointRequests.every((request) => request.manifest.assets[0]?.source === stableSource)).toBe(true);
    expect(JSON.stringify(checkpointRequests)).not.toContain('token=fresh');
  });

  it('keeps canonical recovery state when execution materialization fails', async () => {
    const stableSource = 'shortsflow-storage://media/render-user/videos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webm';
    const canonicalManifest = {
      ...manifest(),
      assets: [{
        id: 'asset-1', type: 'video', source: stableSource,
        metadata: {
          storageBucket: 'media',
          storageObjectPath: 'render-user/videos/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webm',
        },
      }],
    } as RenderManifest;
    const recovery: RenderRecoveryStore = {
      restore: vi.fn(() => ({ records: [], interrupted: [] })),
      checkpoint: vi.fn(), markInterrupted: vi.fn(), remove: vi.fn(), clearTerminal: vi.fn(),
      getReplayRequest: vi.fn(() => null), markReplayed: vi.fn(), list: vi.fn(() => []),
    };
    const { engine } = setup(adapter(vi.fn(async () => output())), {
      recoveryStore: recovery,
      materializeManifestForExecution: async () => { throw new Error('Private media could not be opened.'); },
    });

    const job = await engine.submit({ manifest: canonicalManifest });
    await waitFor(() => engine.getJob(job.id)?.status === 'failed');
    const checkpointRequests = (recovery.checkpoint as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[1]);
    expect(checkpointRequests.every((request) => request.manifest.assets[0]?.source === stableSource)).toBe(true);
    expect(JSON.stringify(checkpointRequests)).not.toContain('https://');
  });

  it('re-materializes private media for each render retry while retaining one canonical request', async () => {
    const stableSource = 'shortsflow-storage://media/render-user/generated-images/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png';
    const canonicalManifest = {
      ...manifest(),
      assets: [{
        id: 'asset-1', type: 'image', source: stableSource,
        metadata: {
          storageBucket: 'media',
          storageObjectPath: 'render-user/generated-images/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png',
        },
      }],
    } as RenderManifest;
    const sources = [
      'https://example.supabase.co/storage/v1/object/sign/media/render-user/generated-images/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png?token=first',
      'https://example.supabase.co/storage/v1/object/sign/media/render-user/generated-images/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png?token=second',
    ];
    const materialize = vi.fn(async (value: RenderManifest) => ({
      ...value,
      assets: value.assets.map((asset) => ({ ...asset, source: sources.shift()! })),
    }));
    const render = vi.fn<RenderAdapter['render']>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(output());
    const recovery: RenderRecoveryStore = {
      restore: vi.fn(() => ({ records: [], interrupted: [] })),
      checkpoint: vi.fn(), markInterrupted: vi.fn(), remove: vi.fn(), clearTerminal: vi.fn(),
      getReplayRequest: vi.fn(() => null), markReplayed: vi.fn(), list: vi.fn(() => []),
    };
    const { engine } = setup(adapter(render), {
      recoveryStore: recovery,
      materializeManifestForExecution: materialize,
      retryPolicy: { baseDelayMs: 1, maxDelayMs: 1 },
    });

    const job = await engine.submit({ manifest: canonicalManifest });
    await waitFor(() => engine.getJob(job.id)?.status === 'completed');
    expect(materialize).toHaveBeenCalledTimes(2);
    expect(render.mock.calls.map((call) => call[0].manifest.assets[0]?.source)).toEqual([
      expect.stringContaining('token=first'),
      expect.stringContaining('token=second'),
    ]);
    const checkpointRequests = (recovery.checkpoint as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[1]);
    expect(checkpointRequests.every((request) => request.manifest.assets[0]?.source === stableSource)).toBe(true);
  });
});
