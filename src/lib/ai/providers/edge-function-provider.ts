import { apiClient } from '@/lib/api/client';
import { BaseAIProvider } from '@/lib/ai/provider';
import type {
  AICapability,
  AIProviderId,
  AIRequestOptions,
  AnalyzeScriptInput,
  GeneratedScriptResult,
  GeneratedSEOResult,
  GenerateHooksInput,
  GenerateScriptInput,
  GenerateSEOInput,
} from '@/lib/ai/types';
import type { HookVariation, ScriptAnalysis } from '@/lib/types';

interface HooksResponse {
  hooks?: HookVariation[];
}

export interface EdgeFunctionProviderConfig {
  id: AIProviderId;
  name: string;
  description: string;
  capabilities: readonly AICapability[];
  includeProviderInPayload?: boolean;
}

export class EdgeFunctionAIProvider extends BaseAIProvider {
  readonly id: AIProviderId;
  readonly name: string;
  readonly description: string;
  readonly capabilities: readonly AICapability[];

  private readonly includeProviderInPayload: boolean;

  constructor(config: EdgeFunctionProviderConfig) {
    super();
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.capabilities = config.capabilities;
    this.includeProviderInPayload = config.includeProviderInPayload ?? true;
  }

  isConfigured(): boolean {
    return Boolean(
      import.meta.env.VITE_SUPABASE_URL &&
        import.meta.env.VITE_SUPABASE_ANON_KEY,
    );
  }

  async generateScript(
    input: GenerateScriptInput,
    options?: AIRequestOptions,
  ): Promise<GeneratedScriptResult> {
    this.assertCapability('script');
    return apiClient.post<GeneratedScriptResult>(
      'generate-script',
      this.withProvider(input),
      this.requestOptions(options, 60_000),
    );
  }

  async generateHooks(
    input: GenerateHooksInput,
    options?: AIRequestOptions,
  ): Promise<HookVariation[]> {
    this.assertCapability('hooks');
    const response = await apiClient.post<HooksResponse>(
      'generate-hooks',
      this.withProvider(input),
      this.requestOptions(options, 45_000),
    );
    return response.hooks ?? [];
  }

  async generateSEO(
    input: GenerateSEOInput,
    options?: AIRequestOptions,
  ): Promise<GeneratedSEOResult> {
    this.assertCapability('seo');
    return apiClient.post<GeneratedSEOResult>(
      'generate-seo',
      this.withProvider(input),
      this.requestOptions(options, 45_000),
    );
  }

  async analyzeScript(
    input: AnalyzeScriptInput,
    options?: AIRequestOptions,
  ): Promise<ScriptAnalysis> {
    this.assertCapability('analysis');
    return apiClient.post<ScriptAnalysis>(
      'analyze-script',
      this.withProvider(input),
      this.requestOptions(options, 45_000),
    );
  }

  private withProvider<T extends object>(input: T): T & { provider?: AIProviderId } {
    if (!this.includeProviderInPayload) {
      return input;
    }

    return {
      ...input,
      provider: this.id,
    };
  }

  private requestOptions(
    options: AIRequestOptions | undefined,
    defaultTimeoutMs: number,
  ) {
    return {
      retryCount: options?.retryCount ?? 0,
      timeoutMs: options?.timeoutMs ?? defaultTimeoutMs,
    };
  }
}
