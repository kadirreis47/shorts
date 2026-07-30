import type {
  AICapability,
  AIProviderId,
  AIProviderInfo,
  AIRequestOptions,
  AnalyzeScriptInput,
  GeneratedScriptResult,
  GeneratedSEOResult,
  GenerateHooksInput,
  GenerateScriptInput,
  GenerateSEOInput,
} from '@/lib/ai/types';
import type { HookVariation, ScriptAnalysis } from '@/lib/types';

export interface AIProvider {
  readonly id: AIProviderId;
  readonly name: string;
  readonly description: string;
  readonly capabilities: readonly AICapability[];

  isConfigured(): boolean;

  generateScript(
    input: GenerateScriptInput,
    options?: AIRequestOptions,
  ): Promise<GeneratedScriptResult>;

  generateHooks(
    input: GenerateHooksInput,
    options?: AIRequestOptions,
  ): Promise<HookVariation[]>;

  generateSEO(
    input: GenerateSEOInput,
    options?: AIRequestOptions,
  ): Promise<GeneratedSEOResult>;

  analyzeScript(
    input: AnalyzeScriptInput,
    options?: AIRequestOptions,
  ): Promise<ScriptAnalysis>;
}

export function getProviderInfo(provider: AIProvider): AIProviderInfo {
  return {
    id: provider.id,
    name: provider.name,
    description: provider.description,
    capabilities: provider.capabilities,
    isConfigured: provider.isConfigured(),
  };
}

export abstract class BaseAIProvider implements AIProvider {
  abstract readonly id: AIProviderId;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly capabilities: readonly AICapability[];

  abstract isConfigured(): boolean;

  abstract generateScript(
    input: GenerateScriptInput,
    options?: AIRequestOptions,
  ): Promise<GeneratedScriptResult>;

  abstract generateHooks(
    input: GenerateHooksInput,
    options?: AIRequestOptions,
  ): Promise<HookVariation[]>;

  abstract generateSEO(
    input: GenerateSEOInput,
    options?: AIRequestOptions,
  ): Promise<GeneratedSEOResult>;

  abstract analyzeScript(
    input: AnalyzeScriptInput,
    options?: AIRequestOptions,
  ): Promise<ScriptAnalysis>;

  protected assertCapability(capability: AICapability): void {
    if (!this.capabilities.includes(capability)) {
      throw new Error(`${this.name} sağlayıcısı "${capability}" özelliğini desteklemiyor.`);
    }
  }
}
