import { getProviderInfo, type AIProvider } from '@/lib/ai/provider';
import type {
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
import { claudeProvider } from '@/lib/ai/providers/claude';
import { geminiProvider } from '@/lib/ai/providers/gemini';
import { grokProvider } from '@/lib/ai/providers/grok';
import { openAIProvider } from '@/lib/ai/providers/openai';
import { openRouterProvider } from '@/lib/ai/providers/openrouter';
import type { HookVariation, ScriptAnalysis } from '@/lib/types';

const STORAGE_KEY = 'shortsflow.ai.provider';
const DEFAULT_PROVIDER: AIProviderId = 'openai';

class AIProviderManager {
  private readonly providers = new Map<AIProviderId, AIProvider>();
  private activeProviderId: AIProviderId = DEFAULT_PROVIDER;

  constructor() {
    this.register(openAIProvider);
    this.register(geminiProvider);
    this.register(claudeProvider);
    this.register(grokProvider);
    this.register(openRouterProvider);
    this.activeProviderId = this.readStoredProvider();
  }

  register(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
  }

  unregister(providerId: AIProviderId): void {
    if (providerId === this.activeProviderId) {
      throw new Error('Aktif AI sağlayıcısı kaldırılamaz. Önce başka bir sağlayıcı seçin.');
    }
    this.providers.delete(providerId);
  }

  getActiveProvider(): AIProvider {
    return this.getProvider(this.activeProviderId);
  }

  getActiveProviderId(): AIProviderId {
    return this.activeProviderId;
  }

  setActiveProvider(providerId: AIProviderId): void {
    this.getProvider(providerId);
    this.activeProviderId = providerId;

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, providerId);
    }
  }

  getProvider(providerId: AIProviderId): AIProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`AI sağlayıcısı bulunamadı: ${providerId}`);
    }
    return provider;
  }

  listProviders(): AIProviderInfo[] {
    return Array.from(this.providers.values()).map(getProviderInfo);
  }

  generateScript(
    input: GenerateScriptInput,
    options?: AIRequestOptions,
  ): Promise<GeneratedScriptResult> {
    return this.getActiveProvider().generateScript(input, options);
  }

  generateHooks(
    input: GenerateHooksInput,
    options?: AIRequestOptions,
  ): Promise<HookVariation[]> {
    return this.getActiveProvider().generateHooks(input, options);
  }

  generateSEO(
    input: GenerateSEOInput,
    options?: AIRequestOptions,
  ): Promise<GeneratedSEOResult> {
    return this.getActiveProvider().generateSEO(input, options);
  }

  analyzeScript(
    input: AnalyzeScriptInput,
    options?: AIRequestOptions,
  ): Promise<ScriptAnalysis> {
    return this.getActiveProvider().analyzeScript(input, options);
  }

  private readStoredProvider(): AIProviderId {
    if (typeof window === 'undefined') {
      return DEFAULT_PROVIDER;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY) as AIProviderId | null;
    return stored && this.providers.has(stored) ? stored : DEFAULT_PROVIDER;
  }
}

export const aiManager = new AIProviderManager();
