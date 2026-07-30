import type { HookVariation, Scene, ScriptAnalysis } from '@/lib/types';

export type AIProviderId =
  | 'openai'
  | 'gemini'
  | 'claude'
  | 'grok'
  | 'openrouter';

export type AICapability =
  | 'script'
  | 'hooks'
  | 'seo'
  | 'analysis'
  | 'image'
  | 'voice';

export interface AIProviderInfo {
  id: AIProviderId;
  name: string;
  description: string;
  capabilities: readonly AICapability[];
  isConfigured: boolean;
}

export interface GenerateScriptInput {
  topic: string;
  niche?: string;
  tone?: string;
  duration?: number;
  hookFormula?: string;
  bodyStructure?: string;
  cta?: string;
}

export interface GeneratedScriptResult {
  title: string;
  hook: string;
  script: string;
  cta: string;
  scenes: Scene[];
}

export interface GenerateHooksInput {
  topic: string;
  niche?: string;
  tone?: string;
}

export interface GenerateSEOInput {
  title: string;
  script: string;
  hook?: string;
  niche?: string;
  topic?: string;
}

export interface GeneratedSEOResult {
  optimizedTitle: string;
  optimizedDescription: string;
  tags: string[];
  hashtags: string[];
  thumbnailText: string;
}

export interface AnalyzeScriptInput {
  script: string;
  hook?: string;
  niche?: string;
}

export interface AIRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  retryCount?: number;
}

export interface AIOperationMap {
  script: {
    input: GenerateScriptInput;
    output: GeneratedScriptResult;
  };
  hooks: {
    input: GenerateHooksInput;
    output: HookVariation[];
  };
  seo: {
    input: GenerateSEOInput;
    output: GeneratedSEOResult;
  };
  analysis: {
    input: AnalyzeScriptInput;
    output: ScriptAnalysis;
  };
}

export type AIOperation = keyof AIOperationMap;
