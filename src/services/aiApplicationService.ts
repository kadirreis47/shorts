import type { AIPipelineDefinition, AIPipelineRunner } from '@/core/ai-pipeline';
import { AppError } from '@/core/errors';
import { aiManager } from '@/lib/ai';
import type {
  AIRequestOptions,
  AnalyzeScriptInput,
  GeneratedScriptResult,
  GeneratedSEOResult,
  GenerateHooksInput,
  GenerateScriptInput,
  GenerateSEOInput,
} from '@/lib/ai';
import type { HookVariation, ScriptAnalysis } from '@/lib/types';

export interface AIOperationOptions extends AIRequestOptions {
  metadata?: Readonly<Record<string, unknown>>;
}

export interface AIApplicationService {
  generateScript(
    input: GenerateScriptInput,
    options?: AIOperationOptions,
  ): Promise<GeneratedScriptResult>;
  generateHooks(
    input: GenerateHooksInput,
    options?: AIOperationOptions,
  ): Promise<HookVariation[]>;
  generateSEO(
    input: GenerateSEOInput,
    options?: AIOperationOptions,
  ): Promise<GeneratedSEOResult>;
  analyzeScript(
    input: AnalyzeScriptInput,
    options?: AIOperationOptions,
  ): Promise<ScriptAnalysis>;
}

interface ResultState<T> {
  result: T | null;
}

function validationError(operation: string, message: string): AppError {
  return new AppError(message, {
    code: 'VALIDATION_ERROR',
    userMessage: 'AI sağlayıcısından geçersiz bir yanıt alındı.',
    operation,
    retryable: true,
  });
}

function assertNonEmpty(value: unknown, operation: string, field: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw validationError(operation, `Eksik veya geçersiz alan: ${field}`);
  }
}

function validateScriptResult(result: GeneratedScriptResult): GeneratedScriptResult {
  const operation = 'ai:generate-script:validate';
  assertNonEmpty(result.title, operation, 'title');
  assertNonEmpty(result.hook, operation, 'hook');
  assertNonEmpty(result.script, operation, 'script');
  assertNonEmpty(result.cta, operation, 'cta');
  if (!Array.isArray(result.scenes)) {
    throw validationError(operation, 'Sahneler dizi formatında değil.');
  }
  return result;
}

function validateHooksResult(result: HookVariation[]): HookVariation[] {
  const operation = 'ai:generate-hooks:validate';
  if (!Array.isArray(result) || result.length === 0) {
    throw validationError(operation, 'Hook listesi boş veya geçersiz.');
  }
  return result;
}

function validateSEOResult(result: GeneratedSEOResult): GeneratedSEOResult {
  const operation = 'ai:generate-seo:validate';
  assertNonEmpty(result.optimizedTitle, operation, 'optimizedTitle');
  assertNonEmpty(result.optimizedDescription, operation, 'optimizedDescription');
  assertNonEmpty(result.thumbnailText, operation, 'thumbnailText');
  if (!Array.isArray(result.tags) || !Array.isArray(result.hashtags)) {
    throw validationError(operation, 'SEO etiketleri geçersiz formatta.');
  }
  return result;
}

function validateAnalysisResult(result: ScriptAnalysis): ScriptAnalysis {
  if (!result || typeof result !== 'object') {
    throw validationError('ai:analyze-script:validate', 'Analiz sonucu geçersiz.');
  }
  return result;
}

function createSingleOperationPipeline<T>(
  id: string,
  title: string,
  timeoutMs: number,
  execute: (signal: AbortSignal) => Promise<T>,
  validate: (result: T) => T,
): AIPipelineDefinition<ResultState<T>> {
  return {
    id,
    title,
    createInitialState: () => ({ result: null }),
    steps: [
      {
        id: 'provider-request',
        title: 'AI sağlayıcı isteği',
        timeoutMs,
        run: async ({ signal }) => ({ result: await execute(signal) }),
      },
      {
        id: 'validate-output',
        title: 'Yapılandırılmış yanıt doğrulama',
        timeoutMs: 5_000,
        run: async ({ state }) => {
          if (state.result === null) {
            throw validationError(`ai:${id}:validate`, 'AI sonucu üretilemedi.');
          }
          return { result: validate(state.result) };
        },
      },
    ],
  };
}

function requireResult<T>(result: T | null, operation: string): T {
  if (result === null) {
    throw validationError(operation, 'Pipeline sonucu boş döndü.');
  }
  return result;
}

export function createAIApplicationService(
  pipelineRunner: AIPipelineRunner,
): AIApplicationService {
  async function runOperation<T>(
    definition: AIPipelineDefinition<ResultState<T>>,
    options: AIOperationOptions = {},
  ): Promise<T> {
    const result = await pipelineRunner.run(definition, {
      signal: options.signal,
      metadata: {
        providerId: aiManager.getActiveProviderId(),
        ...options.metadata,
      },
    });
    return requireResult(result.state.result, definition.id);
  }

  return {
    generateScript(input, options = {}) {
      const timeoutMs = options.timeoutMs ?? 90_000;
      return runOperation(
        createSingleOperationPipeline(
          'generate-script',
          'Senaryo üretimi',
          timeoutMs,
          (signal) => aiManager.generateScript(input, {
            ...options,
            signal,
            timeoutMs,
          }),
          validateScriptResult,
        ),
        options,
      );
    },

    generateHooks(input, options = {}) {
      const timeoutMs = options.timeoutMs ?? 60_000;
      return runOperation(
        createSingleOperationPipeline(
          'generate-hooks',
          'Hook varyasyonları üretimi',
          timeoutMs,
          (signal) => aiManager.generateHooks(input, {
            ...options,
            signal,
            timeoutMs,
          }),
          validateHooksResult,
        ),
        options,
      );
    },

    generateSEO(input, options = {}) {
      const timeoutMs = options.timeoutMs ?? 60_000;
      return runOperation(
        createSingleOperationPipeline(
          'generate-seo',
          'SEO paketi üretimi',
          timeoutMs,
          (signal) => aiManager.generateSEO(input, {
            ...options,
            signal,
            timeoutMs,
          }),
          validateSEOResult,
        ),
        options,
      );
    },

    analyzeScript(input, options = {}) {
      const timeoutMs = options.timeoutMs ?? 60_000;
      return runOperation(
        createSingleOperationPipeline(
          'analyze-script',
          'Senaryo analizi',
          timeoutMs,
          (signal) => aiManager.analyzeScript(input, {
            ...options,
            signal,
            timeoutMs,
          }),
          validateAnalysisResult,
        ),
        options,
      );
    },
  };
}
