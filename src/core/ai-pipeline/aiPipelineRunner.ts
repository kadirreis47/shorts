import { AppError, normalizeAppError } from '@/core/errors';
import type { ApplicationEventMap, EventBus } from '@/core/events';
import { withTimeout } from '@/lib/async';
import type {
  AIPipelineDefinition,
  AIPipelineRunOptions,
  AIPipelineRunResult,
  AIPipelineRunner,
} from './types';

const DEFAULT_STEP_TIMEOUT_MS = 60_000;

function createRunId(pipelineId: string): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${pipelineId}-${Date.now()}-${randomPart}`;
}

function createAbortError(pipelineId: string, runId: string): AppError {
  return new AppError('AI işlemi iptal edildi.', {
    code: 'UNKNOWN_ERROR',
    userMessage: 'AI işlemi iptal edildi.',
    operation: `ai-pipeline:${pipelineId}:${runId}`,
    retryable: true,
  });
}

function throwIfAborted(signal: AbortSignal, pipelineId: string, runId: string) {
  if (signal.aborted) {
    throw createAbortError(pipelineId, runId);
  }
}

export function createAIPipelineRunner(
  eventBus?: EventBus<ApplicationEventMap>,
): AIPipelineRunner {
  const activeRuns = new Map<string, AbortController>();

  return {
    async run<TState extends object>(
      definition: AIPipelineDefinition<TState>,
      options: AIPipelineRunOptions = {},
    ): Promise<AIPipelineRunResult<TState>> {
      if (definition.steps.length === 0) {
        throw new AppError('AI pipeline en az bir adım içermelidir.', {
          code: 'VALIDATION_ERROR',
          userMessage: 'AI iş akışı yapılandırması geçersiz.',
          operation: `ai-pipeline:${definition.id}`,
          retryable: false,
        });
      }

      const runId = createRunId(definition.id);
      const controller = new AbortController();
      const startedTimestamp = Date.now();
      const startedAt = new Date(startedTimestamp).toISOString();
      const metadata = options.metadata ?? {};

      const abortFromExternalSignal = () => controller.abort();
      options.signal?.addEventListener('abort', abortFromExternalSignal, { once: true });
      activeRuns.set(runId, controller);

      let state = definition.createInitialState();

      await eventBus?.emit('ai:pipeline-started', {
        runId,
        pipelineId: definition.id,
        title: definition.title,
        totalSteps: definition.steps.length,
        startedAt,
      });

      try {
        for (let stepIndex = 0; stepIndex < definition.steps.length; stepIndex += 1) {
          const step = definition.steps[stepIndex];
          throwIfAborted(controller.signal, definition.id, runId);

          const stepStartedTimestamp = Date.now();
          await eventBus?.emit('ai:pipeline-step-started', {
            runId,
            pipelineId: definition.id,
            stepId: step.id,
            title: step.title,
            stepIndex,
            totalSteps: definition.steps.length,
            startedAt: new Date(stepStartedTimestamp).toISOString(),
          });

          const patch = await withTimeout(
            step.run({
              runId,
              pipelineId: definition.id,
              startedAt,
              signal: controller.signal,
              metadata,
              stepId: step.id,
              stepIndex,
              totalSteps: definition.steps.length,
              state,
            }),
            step.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
            `AI pipeline adımı zaman aşımına uğradı: ${step.title}`,
          );

          throwIfAborted(controller.signal, definition.id, runId);

          if (patch) {
            state = { ...state, ...patch };
          }

          await eventBus?.emit('ai:pipeline-step-completed', {
            runId,
            pipelineId: definition.id,
            stepId: step.id,
            stepIndex,
            totalSteps: definition.steps.length,
            durationMs: Date.now() - stepStartedTimestamp,
            completedAt: new Date().toISOString(),
          });
        }

        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - startedTimestamp;

        await eventBus?.emit('ai:pipeline-completed', {
          runId,
          pipelineId: definition.id,
          durationMs,
          completedAt,
        });

        return {
          runId,
          pipelineId: definition.id,
          status: 'completed',
          state,
          startedAt,
          completedAt,
          durationMs,
        };
      } catch (error) {
        const cancelled = controller.signal.aborted;
        const appError = cancelled
          ? createAbortError(definition.id, runId)
          : normalizeAppError(error, {
              operation: `ai-pipeline:${definition.id}`,
              fallbackMessage: 'AI iş akışı tamamlanamadı.',
            });

        if (cancelled) {
          await eventBus?.emit('ai:pipeline-cancelled', {
            runId,
            pipelineId: definition.id,
            cancelledAt: new Date().toISOString(),
          });
        } else {
          await eventBus?.emit('ai:pipeline-failed', {
            runId,
            pipelineId: definition.id,
            code: appError.code,
            message: appError.userMessage,
            retryable: appError.retryable,
            failedAt: new Date().toISOString(),
          });
        }

        throw appError;
      } finally {
        options.signal?.removeEventListener('abort', abortFromExternalSignal);
        activeRuns.delete(runId);
      }
    },

    cancel(runId: string): boolean {
      const controller = activeRuns.get(runId);
      if (!controller) return false;
      controller.abort();
      return true;
    },

    cancelAll(): void {
      activeRuns.forEach((controller) => controller.abort());
    },

    getActiveRunIds(): readonly string[] {
      return Array.from(activeRuns.keys());
    },
  };
}
