import { AppError, normalizeAppError } from '@/core/errors';
import type { ApplicationEventMap, EventBus } from '@/core/events';
import { withTimeout } from '@/lib/async';
import type {
  AIPipelineDefinition,
  AIPipelineRunOptions,
  AIPipelineRunResult,
  AIPipelineRunner,
  AIPipelineRunSnapshot,
  AIPipelineStep,
  AIRetryPolicy,
} from './types';

const DEFAULT_STEP_TIMEOUT_MS = 60_000;
const DEFAULT_RETRY_DELAY_MS = 750;
const DEFAULT_BACKOFF_MULTIPLIER = 2;
const DEFAULT_MAX_RETRY_DELAY_MS = 8_000;

interface ActiveRun {
  controller: AbortController;
  snapshot: AIPipelineRunSnapshot;
}

function createRunId(pipelineId: string): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${pipelineId}-${Date.now()}-${randomPart}`;
}

function createAbortError(pipelineId: string, runId: string): AppError {
  return new AppError('AI işlemi iptal edildi.', {
    code: 'UNKNOWN_ERROR',
    userMessage: 'AI işlemi iptal edildi.',
    operation: `ai-pipeline:${pipelineId}:${runId}`,
    retryable: false,
  });
}

function throwIfAborted(signal: AbortSignal, pipelineId: string, runId: string) {
  if (signal.aborted) {
    throw createAbortError(pipelineId, runId);
  }
}

function normalizeRetryPolicy(policy?: AIRetryPolicy): Required<AIRetryPolicy> {
  return {
    maxAttempts: Math.max(1, Math.floor(policy?.maxAttempts ?? 1)),
    initialDelayMs: Math.max(0, policy?.initialDelayMs ?? DEFAULT_RETRY_DELAY_MS),
    backoffMultiplier: Math.max(1, policy?.backoffMultiplier ?? DEFAULT_BACKOFF_MULTIPLIER),
    maxDelayMs: Math.max(0, policy?.maxDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS),
    retryableCodes: policy?.retryableCodes ?? ['NETWORK_ERROR', 'TIMEOUT', 'SERVICE_ERROR'],
  };
}

function calculateRetryDelay(policy: Required<AIRetryPolicy>, failedAttempt: number): number {
  const calculated = policy.initialDelayMs * Math.pow(policy.backoffMultiplier, failedAttempt - 1);
  return Math.min(policy.maxDelayMs, Math.round(calculated));
}

function waitForDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);

    const onAbort = () => {
      clearTimeout(timeoutId);
      reject(new Error('aborted'));
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function canRetry(error: AppError, policy: Required<AIRetryPolicy>, attempt: number): boolean {
  return (
    attempt < policy.maxAttempts &&
    error.retryable &&
    policy.retryableCodes.includes(error.code)
  );
}

async function executeStep<TState extends object>(
  step: AIPipelineStep<TState>,
  context: {
    runId: string;
    pipelineId: string;
    startedAt: string;
    signal: AbortSignal;
    metadata: Readonly<Record<string, unknown>>;
    stepIndex: number;
    totalSteps: number;
    state: Readonly<TState>;
  },
  eventBus?: EventBus<ApplicationEventMap>,
): Promise<Partial<TState> | void> {
  const retryPolicy = normalizeRetryPolicy(step.retry);

  for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt += 1) {
    throwIfAborted(context.signal, context.pipelineId, context.runId);

    try {
      return await withTimeout(
        step.run({
          ...context,
          stepId: step.id,
          attempt,
        }),
        step.timeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
        `AI pipeline adımı zaman aşımına uğradı: ${step.title}`,
      );
    } catch (error) {
      throwIfAborted(context.signal, context.pipelineId, context.runId);

      const appError = normalizeAppError(error, {
        operation: `ai-pipeline:${context.pipelineId}:${step.id}`,
        fallbackMessage: `AI iş akışı adımı tamamlanamadı: ${step.title}`,
      });

      if (!canRetry(appError, retryPolicy, attempt)) {
        throw appError;
      }

      const delayMs = calculateRetryDelay(retryPolicy, attempt);
      await eventBus?.emit('ai:pipeline-step-retrying', {
        runId: context.runId,
        pipelineId: context.pipelineId,
        stepId: step.id,
        stepIndex: context.stepIndex,
        attempt,
        nextAttempt: attempt + 1,
        maxAttempts: retryPolicy.maxAttempts,
        delayMs,
        code: appError.code,
        message: appError.userMessage,
        retryingAt: new Date().toISOString(),
      });

      await waitForDelay(delayMs, context.signal);
    }
  }

  throw new AppError('AI adımı beklenmeyen şekilde sona erdi.', {
    code: 'UNKNOWN_ERROR',
    userMessage: 'AI işlemi tamamlanamadı.',
    operation: `ai-pipeline:${context.pipelineId}:${step.id}`,
    retryable: false,
  });
}

export function createAIPipelineRunner(
  eventBus?: EventBus<ApplicationEventMap>,
): AIPipelineRunner {
  const activeRuns = new Map<string, ActiveRun>();

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
      const activeRun: ActiveRun = {
        controller,
        snapshot: {
          runId,
          pipelineId: definition.id,
          title: definition.title,
          currentStepId: null,
          currentStepIndex: -1,
          totalSteps: definition.steps.length,
          attempt: 0,
          startedAt,
        },
      };

      const abortFromExternalSignal = () => controller.abort();
      options.signal?.addEventListener('abort', abortFromExternalSignal, { once: true });
      activeRuns.set(runId, activeRun);

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

          activeRun.snapshot = {
            ...activeRun.snapshot,
            currentStepId: step.id,
            currentStepIndex: stepIndex,
            attempt: 1,
          };

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

          const patch = await executeStep(
            step,
            {
              runId,
              pipelineId: definition.id,
              startedAt,
              signal: controller.signal,
              metadata,
              stepIndex,
              totalSteps: definition.steps.length,
              state,
            },
            eventBus,
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
      const activeRun = activeRuns.get(runId);
      if (!activeRun) return false;
      activeRun.controller.abort();
      return true;
    },

    cancelAll(): void {
      activeRuns.forEach(({ controller }) => controller.abort());
    },

    getActiveRunIds(): readonly string[] {
      return Array.from(activeRuns.keys());
    },

    getActiveRuns(): readonly AIPipelineRunSnapshot[] {
      return Array.from(activeRuns.values(), ({ snapshot }) => ({ ...snapshot }));
    },
  };
}
