export type AIPipelineStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AIPipelineContext {
  readonly runId: string;
  readonly pipelineId: string;
  readonly startedAt: string;
  readonly signal: AbortSignal;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface AIPipelineStepContext<TState extends object>
  extends AIPipelineContext {
  readonly stepId: string;
  readonly stepIndex: number;
  readonly totalSteps: number;
  readonly state: Readonly<TState>;
}

export interface AIPipelineStep<TState extends object> {
  readonly id: string;
  readonly title: string;
  readonly timeoutMs?: number;
  run(context: AIPipelineStepContext<TState>): Promise<Partial<TState> | void>;
}

export interface AIPipelineDefinition<TState extends object> {
  readonly id: string;
  readonly title: string;
  readonly steps: readonly AIPipelineStep<TState>[];
  readonly createInitialState: () => TState;
}

export interface AIPipelineRunOptions {
  readonly signal?: AbortSignal;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface AIPipelineRunResult<TState extends object> {
  readonly runId: string;
  readonly pipelineId: string;
  readonly status: Extract<AIPipelineStatus, 'completed'>;
  readonly state: TState;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
}

export interface AIPipelineRunner {
  run<TState extends object>(
    definition: AIPipelineDefinition<TState>,
    options?: AIPipelineRunOptions,
  ): Promise<AIPipelineRunResult<TState>>;
  cancel(runId: string): boolean;
  cancelAll(): void;
  getActiveRunIds(): readonly string[];
}
