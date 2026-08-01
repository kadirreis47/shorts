import type { ApplicationEventMap, EventBus } from '@/core/events';
import type {
  RenderAdapter,
  RenderEngine,
  RenderEngineOptions,
  RenderJobRequest,
  RenderJobSnapshot,
  RenderPreset,
  RenderProgress,
} from './types';
import { DEFAULT_RENDER_PRESET } from './types';
import { createRenderMetricsCollector } from './renderMetrics';
import {
  createRenderCircuitBreaker,
  decideRenderRetry,
  waitForRenderRetry,
} from './renderResilience';

interface InternalRenderJob {
  request: RenderJobRequest;
  snapshot: RenderJobSnapshot;
  controller: AbortController;
  fingerprint: string | null;
  incrementalPlan: import('./incrementalTypes').IncrementalRenderPlan | null;
}

export function createRenderEngine(
  eventBus: EventBus<ApplicationEventMap>,
  initialAdapters: RenderAdapter[] = [],
  options: RenderEngineOptions = {},
): RenderEngine {
  const adapters = new Map<string, RenderAdapter>();
  const jobs = new Map<string, InternalRenderJob>();
  const queue: string[] = [];
  let concurrency = normalizeConcurrency(options.concurrency ?? 1);
  const defaultPreset = normalizePreset(options.defaultPreset);
  const renderCache = options.cache;
  const outputExists = options.outputExists;
  const incrementalPlanner = options.incrementalPlanner;
  const recoveryStore = options.recoveryStore;
  const retryPolicy = options.retryPolicy;
  const circuitBreaker =
    options.circuitBreaker ?? createRenderCircuitBreaker();
  const metricsCollector =
    options.metricsCollector ?? createRenderMetricsCollector();
  let activeCount = 0;
  let disposed = false;

  initialAdapters.forEach((adapter) => adapters.set(adapter.id, adapter));

  const engine: RenderEngine = {
    async submit(request) {
      ensureNotDisposed();

      if (request.manifest.validation?.renderReady !== true) {
        throw new Error(
          'Render manifest kalite kapısından geçmedi. Validation raporundaki hataları düzeltin.',
        );
      }

      const preset = normalizePreset({
        ...defaultPreset,
        ...request.preset,
      });
      const adapter = selectAdapter(adapters, request.manifest, preset);
      const now = new Date().toISOString();
      const jobId = createId('render-job');
      const incrementalPlan =
        incrementalPlanner && request.incremental !== false
          ? await incrementalPlanner.createPlan({
              manifest: request.manifest,
              preset,
              adapterId: adapter.id,
              forceRender: request.forceRender,
            })
          : null;

      if (incrementalPlan) {
        await eventBus.emit('render:incremental-plan-created', {
          jobId,
          projectId: request.manifest.projectId,
          planId: incrementalPlan.planId,
          totalScenes: incrementalPlan.totalScenes,
          renderedScenes: incrementalPlan.renderedScenes,
          reusableScenes: incrementalPlan.reusableScenes,
          estimatedSavedPercent: incrementalPlan.estimatedSavedPercent,
          fullRenderRequired: incrementalPlan.fullRenderRequired,
          createdAt: incrementalPlan.createdAt,
        });
      }

      const fingerprint = renderCache
        ? await import('./renderFingerprint').then(({ createRenderFingerprint }) =>
            createRenderFingerprint({
              manifest: request.manifest,
              preset,
              adapterId: adapter.id,
            }),
          )
        : null;

      if (renderCache && fingerprint && !request.forceRender) {
        const cached = await renderCache.get(fingerprint, outputExists);
        if (cached) {
          const completedAt = new Date().toISOString();
          const snapshot: RenderJobSnapshot = {
            id: jobId,
            projectId: request.manifest.projectId,
            adapterId: adapter.id,
            status: 'completed',
            stage: 'completed',
            progress: 100,
            message: 'Render cache kullanıldı',
            preset,
            outputPath: request.outputPath,
            output: {
              ...cached.output,
              metadata: {
                ...cached.output.metadata,
                cacheHit: true,
                renderFingerprint: fingerprint,
              },
            },
            error: null,
            queuedAt: now,
            startedAt: now,
            completedAt,
            elapsedMs: 0,
          };
          jobs.set(jobId, {
            request,
            snapshot,
            controller: new AbortController(),
            fingerprint,
            incrementalPlan,
          });

          metricsCollector.cacheHit();
          metricsCollector.jobQueued(snapshot);
          metricsCollector.jobStarted(snapshot);
          metricsCollector.jobCompleted(snapshot);

          await eventBus.emit('render:cache-hit', {
            jobId,
            projectId: snapshot.projectId,
            fingerprint,
            outputUri: cached.output.uri,
            savedRenderMs: cached.savedRenderMs,
            hitAt: completedAt,
          });
      await eventBus.emit('render:job-completed', {
            jobId,
            projectId: snapshot.projectId,
            outputKind: cached.output.kind,
            outputUri: cached.output.uri,
            durationMs: 0,
            completedAt,
          });
          return cloneSnapshot(snapshot);
        }

        await eventBus.emit('render:cache-miss', {
          jobId,
          projectId: request.manifest.projectId,
          fingerprint,
          missedAt: now,
        });
      }
      const snapshot: RenderJobSnapshot = {
        id: jobId,
        projectId: request.manifest.projectId,
        adapterId: adapter.id,
        status: 'queued',
        stage: 'queued',
        progress: 0,
        message: 'Render işi kuyruğa alındı',
        preset,
        outputPath: request.outputPath,
        output: null,
        error: null,
        queuedAt: now,
        startedAt: null,
        completedAt: null,
        elapsedMs: 0,
      };

      jobs.set(jobId, {
        request,
        snapshot,
        controller: new AbortController(),
        fingerprint,
        incrementalPlan,
      });
      queue.push(jobId);
      metricsCollector.jobQueued(snapshot);
      recoveryStore?.checkpoint(snapshot, request);

      await eventBus.emit('render:job-queued', {
        jobId,
        projectId: snapshot.projectId,
        adapterId: adapter.id,
        queuedAt: now,
      });

      scheduleDrain();
      return cloneSnapshot(snapshot);
    },

    cancel(jobId) {
      const job = jobs.get(jobId);
      if (!job || isTerminal(job.snapshot.status)) return false;

      job.controller.abort();
      const queueIndex = queue.indexOf(jobId);
      if (queueIndex >= 0) {
        queue.splice(queueIndex, 1);
        void markCancelled(job);
      }
      return true;
    },

    cancelAll() {
      for (const job of jobs.values()) {
        if (!isTerminal(job.snapshot.status)) {
          job.controller.abort();
        }
      }
      queue.splice(0);
    },

    getJob(jobId) {
      const job = jobs.get(jobId);
      return job ? cloneSnapshot(job.snapshot) : null;
    },

    listJobs() {
      return Array.from(jobs.values())
        .map((job) => cloneSnapshot(job.snapshot))
        .sort((a, b) => Date.parse(b.queuedAt) - Date.parse(a.queuedAt));
    },

    registerAdapter(adapter) {
      ensureNotDisposed();
      adapters.set(adapter.id, adapter);
    },

    getConcurrency() {
      return concurrency;
    },

    setConcurrency(nextConcurrency) {
      ensureNotDisposed();
      const previousConcurrency = concurrency;
      concurrency = normalizeConcurrency(nextConcurrency);

      if (previousConcurrency !== concurrency) {
        void eventBus.emit('render:concurrency-changed', {
          previousConcurrency,
          concurrency,
          activeJobs: activeCount,
          queuedJobs: queue.length,
          changedAt: new Date().toISOString(),
        });
        scheduleDrain();
      }

      return concurrency;
    },

    metrics() {
      return metricsCollector.snapshot();
    },

    resetMetrics() {
      metricsCollector.reset();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const job of jobs.values()) {
        if (!isTerminal(job.snapshot.status)) {
          recoveryStore?.markInterrupted(job.snapshot.id);
        }
      }
      engine.cancelAll();
      adapters.clear();
    },
  };

  function scheduleDrain(): void {
    queueMicrotask(() => {
      void drainQueue();
    });
  }

  async function drainQueue(): Promise<void> {
    if (disposed) return;

    while (activeCount < concurrency && queue.length > 0) {
      const jobId = queue.shift();
      if (!jobId) continue;

      const job = jobs.get(jobId);
      if (!job || job.controller.signal.aborted) {
        if (job) await markCancelled(job);
        continue;
      }

      activeCount += 1;
      void executeJob(job).finally(() => {
        activeCount = Math.max(0, activeCount - 1);
        scheduleDrain();
      });
    }
  }

  async function executeJob(job: InternalRenderJob): Promise<void> {
    const adapter = adapters.get(job.snapshot.adapterId ?? '');
    if (!adapter) {
      await markFailed(job, 'Seçilen render adapter bulunamadı.');
      return;
    }

    if (!circuitBreaker.canExecute(adapter.id)) {
      const breaker = circuitBreaker.snapshot(adapter.id);
      await eventBus.emit('render:circuit-open', {
        jobId: job.snapshot.id,
        projectId: job.snapshot.projectId,
        adapterId: adapter.id,
        retryAfterMs: breaker.retryAfterMs,
        consecutiveFailures: breaker.consecutiveFailures,
        openedAt: breaker.openedAt,
      });
      await markFailed(
        job,
        `Render adapter geçici olarak devre dışı. ${breaker.retryAfterMs} ms sonra tekrar deneyin.`,
      );
      return;
    }

    const startedAt = new Date().toISOString();
    patchSnapshot(job, {
      status: 'preparing',
      stage: 'validating',
      progress: 1,
      message: 'Render işi hazırlanıyor',
      startedAt,
    });

    metricsCollector.jobStarted(job.snapshot);
    recoveryStore?.checkpoint(job.snapshot, job.request);

    await eventBus.emit('render:job-started', {
      jobId: job.snapshot.id,
      projectId: job.snapshot.projectId,
      adapterId: adapter.id,
      startedAt,
    });

    try {
      let output: Awaited<ReturnType<RenderAdapter['render']>> | null = null;
      let attempt = 1;

      while (output === null) {
        try {
          output = await adapter.render({
            jobId: job.snapshot.id,
            manifest: job.request.manifest,
            preset: job.snapshot.preset,
            outputPath: job.request.outputPath,
            signal: job.controller.signal,
            incrementalPlan: job.incrementalPlan ?? undefined,
            reportProgress: async (progress) => {
              if (job.controller.signal.aborted) {
                throw new DOMException(
                  'Render işlemi iptal edildi',
                  'AbortError',
                );
              }
              await applyProgress(job, progress);
            },
          });
          circuitBreaker.recordSuccess(adapter.id);
        } catch (error) {
          const decision = decideRenderRetry({
            error,
            attempt,
            policy: retryPolicy,
          });

          if (!decision.retry) {
            circuitBreaker.recordFailure(adapter.id);
            throw error;
          }

          metricsCollector.retryScheduled();

          await eventBus.emit('render:job-retrying', {
            jobId: job.snapshot.id,
            projectId: job.snapshot.projectId,
            adapterId: adapter.id,
            attempt,
            nextAttempt: attempt + 1,
            delayMs: decision.delayMs,
            failureKind: decision.kind,
            reason: decision.reason,
            retryingAt: new Date().toISOString(),
          });

          patchSnapshot(job, {
            status: 'preparing',
            stage: 'planning',
            message: `Render tekrar denenecek (${attempt + 1}. deneme)`,
          });
          recoveryStore?.checkpoint(job.snapshot, job.request);

          await waitForRenderRetry(
            decision.delayMs,
            job.controller.signal,
          );
          attempt += 1;
        }
      }

      if (job.controller.signal.aborted) {
        await markCancelled(job);
        return;
      }

      const completedAt = new Date().toISOString();
      output = {
        ...output,
        metadata: {
          ...output.metadata,
          renderAttempts: attempt,
          circuitBreakerState: circuitBreaker.snapshot(adapter.id).state,
        },
      };
      patchSnapshot(job, {
        status: 'completed',
        stage: 'completed',
        progress: 100,
        message:
          output.kind === 'video'
            ? 'Video render tamamlandı'
            : 'Render yürütme planı hazır',
        output,
        completedAt,
        elapsedMs: calculateElapsed(job.snapshot, completedAt),
      });

      if (incrementalPlanner && job.incrementalPlan) {
        incrementalPlanner.commit({
          plan: job.incrementalPlan,
          adapterId: adapter.id,
          presetId: job.snapshot.preset.id,
          outputUri: output.uri,
        });
        await eventBus.emit('render:incremental-snapshot-stored', {
          jobId: job.snapshot.id,
          projectId: job.snapshot.projectId,
          planId: job.incrementalPlan.planId,
          outputUri: output.uri,
          sceneCount: job.incrementalPlan.totalScenes,
          storedAt: completedAt,
        });
      }

      if (renderCache && job.fingerprint) {
        renderCache.put({
          fingerprint: job.fingerprint,
          projectId: job.snapshot.projectId,
          adapterId: adapter.id,
          output: {
            ...output,
            metadata: {
              ...output.metadata,
              renderFingerprint: job.fingerprint,
            },
          },
          savedRenderMs: job.snapshot.elapsedMs,
        });
        await eventBus.emit('render:cache-stored', {
          jobId: job.snapshot.id,
          projectId: job.snapshot.projectId,
          fingerprint: job.fingerprint,
          outputUri: output.uri,
          renderMs: job.snapshot.elapsedMs,
          storedAt: completedAt,
        });
      }

      metricsCollector.jobCompleted(job.snapshot);
      recoveryStore?.checkpoint(job.snapshot, job.request);

      await eventBus.emit('render:metrics-updated', {
        snapshot: metricsCollector.snapshot(),
      });

      await eventBus.emit('render:job-completed', {
        jobId: job.snapshot.id,
        projectId: job.snapshot.projectId,
        outputKind: output.kind,
        outputUri: output.uri,
        durationMs: job.snapshot.elapsedMs,
        completedAt,
      });
    } catch (error) {
      if (isAbortError(error) || job.controller.signal.aborted) {
        await markCancelled(job);
        return;
      }

      await markFailed(
        job,
        error instanceof Error ? error.message : 'Render işlemi başarısız oldu.',
      );
    }
  }

  async function applyProgress(
    job: InternalRenderJob,
    progress: Omit<RenderProgress, 'jobId' | 'updatedAt'>,
  ): Promise<void> {
    const updatedAt = new Date().toISOString();
    const normalizedProgress = clamp(progress.progress, 0, 99);
    patchSnapshot(job, {
      status:
        progress.stage === 'finalizing'
          ? 'finalizing'
          : progress.stage === 'validating' || progress.stage === 'planning'
            ? 'preparing'
            : 'rendering',
      stage: progress.stage,
      progress: normalizedProgress,
      message: progress.message,
      elapsedMs: calculateElapsed(job.snapshot, updatedAt),
    });

    metricsCollector.stageChanged(
      job.snapshot.id,
      progress.stage,
      Date.parse(updatedAt),
    );
    recoveryStore?.checkpoint(job.snapshot, job.request);

    await eventBus.emit('render:job-progress', {
      jobId: job.snapshot.id,
      projectId: job.snapshot.projectId,
      stage: progress.stage,
      progress: normalizedProgress,
      message: progress.message,
      frame: progress.frame,
      totalFrames: progress.totalFrames,
      updatedAt,
    });
  }

  async function markCancelled(job: InternalRenderJob): Promise<void> {
    if (job.snapshot.status === 'cancelled') return;
    const cancelledAt = new Date().toISOString();
    patchSnapshot(job, {
      status: 'cancelled',
      message: 'Render işlemi iptal edildi',
      completedAt: cancelledAt,
      elapsedMs: calculateElapsed(job.snapshot, cancelledAt),
    });
    metricsCollector.jobCancelled(job.snapshot);
    recoveryStore?.checkpoint(job.snapshot, job.request);

    await eventBus.emit('render:metrics-updated', {
      snapshot: metricsCollector.snapshot(),
    });

    await eventBus.emit('render:job-cancelled', {
      jobId: job.snapshot.id,
      projectId: job.snapshot.projectId,
      cancelledAt,
    });
  }

  async function markFailed(
    job: InternalRenderJob,
    message: string,
  ): Promise<void> {
    const failedAt = new Date().toISOString();
    patchSnapshot(job, {
      status: 'failed',
      message: 'Render işlemi başarısız oldu',
      error: message,
      completedAt: failedAt,
      elapsedMs: calculateElapsed(job.snapshot, failedAt),
    });
    metricsCollector.jobFailed(job.snapshot);
    recoveryStore?.checkpoint(job.snapshot, job.request);

    await eventBus.emit('render:metrics-updated', {
      snapshot: metricsCollector.snapshot(),
    });

    await eventBus.emit('render:job-failed', {
      jobId: job.snapshot.id,
      projectId: job.snapshot.projectId,
      message,
      failedAt,
    });
  }

  function ensureNotDisposed(): void {
    if (disposed) {
      throw new Error('Render Engine kapatılmış.');
    }
  }

  return engine;
}

function selectAdapter(
  adapters: Map<string, RenderAdapter>,
  manifest: RenderJobRequest['manifest'],
  preset: RenderPreset,
): RenderAdapter {
  const adapter = Array.from(adapters.values()).find((candidate) =>
    candidate.canRender(manifest, preset),
  );

  if (!adapter) {
    throw new Error('Bu render manifestini işleyebilecek adapter bulunamadı.');
  }

  return adapter;
}

function normalizePreset(preset: Partial<RenderPreset> = {}): RenderPreset {
  return {
    ...DEFAULT_RENDER_PRESET,
    ...preset,
    id: preset.id?.trim() || DEFAULT_RENDER_PRESET.id,
    name: preset.name?.trim() || DEFAULT_RENDER_PRESET.name,
  };
}

function patchSnapshot(
  job: InternalRenderJob,
  patch: Partial<RenderJobSnapshot>,
): void {
  job.snapshot = {
    ...job.snapshot,
    ...patch,
  };
}

function cloneSnapshot(snapshot: RenderJobSnapshot): RenderJobSnapshot {
  return {
    ...snapshot,
    preset: { ...snapshot.preset },
    output: snapshot.output
      ? { ...snapshot.output, metadata: { ...snapshot.output.metadata } }
      : null,
  };
}

function calculateElapsed(
  snapshot: RenderJobSnapshot,
  nowIso: string,
): number {
  if (!snapshot.startedAt) return 0;
  return Math.max(0, Date.parse(nowIso) - Date.parse(snapshot.startedAt));
}

function isTerminal(status: RenderJobSnapshot['status']): boolean {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled'
  );
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException
      ? error.name === 'AbortError'
      : error instanceof Error && error.name === 'AbortError'
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function normalizeConcurrency(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(8, Math.floor(value)));
}

function createId(prefix: string): string {
  const suffix =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}
