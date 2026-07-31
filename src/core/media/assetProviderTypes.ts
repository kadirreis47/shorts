import type { MediaAsset, MediaAssetType, MediaProjectSettings, MediaScene } from './types';

export type AssetProviderCapability = 'image' | 'video' | 'local';

export interface AssetSearchQuery {
  sceneId: string;
  text: string;
  visualPrompt: string;
  keywords: string[];
  queries: string[];
  preferredTypes: MediaAssetType[];
  targetWidth: number;
  targetHeight: number;
  minimumDurationMs: number;
  maximumDurationMs: number;
}

export interface AssetCandidate {
  id: string;
  providerId: string;
  type: MediaAssetType;
  source: string;
  previewSource?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  mimeType?: string;
  title?: string;
  attribution?: string;
  license?: string;
  relevance?: number;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface RankedAssetCandidate extends AssetCandidate {
  score: number;
  scoreBreakdown: Readonly<Record<string, number>>;
}

export interface AssetProviderContext {
  signal?: AbortSignal;
  limit: number;
}

export interface AssetProvider {
  readonly id: string;
  readonly priority: number;
  readonly capabilities: ReadonlySet<AssetProviderCapability>;
  isAvailable(): boolean | Promise<boolean>;
  search(query: AssetSearchQuery, context: AssetProviderContext): Promise<AssetCandidate[]>;
}

export interface SceneAssetResolution {
  sceneId: string;
  query: AssetSearchQuery;
  asset: MediaAsset | null;
  providerId: string | null;
  candidateCount: number;
  fallbackCount: number;
  cacheHit: boolean;
}

export interface AssetResolutionReport {
  resolutions: SceneAssetResolution[];
  providerUsage: Record<string, number>;
  cacheHits: number;
  cacheMisses: number;
  resolvedCount: number;
  unresolvedCount: number;
  duplicateCandidatesRejected: number;
}

export interface AssetProviderEngine {
  resolve(
    scenes: MediaScene[],
    settings: MediaProjectSettings,
    options?: { signal?: AbortSignal },
  ): Promise<{
    assets: MediaAsset[];
    report: AssetResolutionReport;
  }>;
  clearCache(): void;
}
