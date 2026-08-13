import type { ApplicationEventMap, EventBus } from '@/core/events';
import { createAssetSearchCache, type AssetSearchCache } from './assetCache';
import { buildAssetSearchQuery } from './assetQueryBuilder';
import { assetFingerprint, rankAssetCandidates } from './assetScoring';
import { createPexelsAssetProvider, createSourceSceneProvider } from './providers';
import type {
  AssetCandidate,
  RankedAssetCandidate,
  AssetProvider,
  AssetProviderEngine,
  AssetResolutionReport,
} from './assetProviderTypes';
import type { MediaAsset, MediaProjectSettings, MediaScene } from './types';

export function createAssetProviderEngine(
  eventBus: EventBus<ApplicationEventMap>,
  cache: AssetSearchCache = createAssetSearchCache(),
): AssetProviderEngine {
  return {
    async resolve(scenes, settings, options) {
      const providers = createProviders(scenes);
      const usedFingerprints = new Set<string>();
      const assets: MediaAsset[] = [];
      const report: AssetResolutionReport = {
        resolutions: [], providerUsage: {}, cacheHits: 0, cacheMisses: 0,
        resolvedCount: 0, unresolvedCount: 0, duplicateCandidatesRejected: 0,
      };

      for (const scene of scenes) {
        throwIfAborted(options?.signal);
        const query = buildAssetSearchQuery(scene, settings);
        await eventBus.emit('asset:search-started', {
          sceneId: scene.id, queries: query.queries, startedAt: new Date().toISOString(),
        });

        let selected: RankedAssetCandidate | null = null;
        let selectedProvider: string | null = null;
        let candidateCount = 0;
        let fallbackCount = 0;
        let cacheHit = false;

        for (const provider of providers) {
          if (!(await provider.isAvailable())) continue;
          await eventBus.emit('asset:provider-selected', {
            sceneId: scene.id, providerId: provider.id, selectedAt: new Date().toISOString(),
          });

          const cacheable = provider.cacheable !== false;
          let candidates = cacheable ? cache.get(provider.id, query) : null;
          if (candidates) {
            cacheHit = true;
            report.cacheHits += 1;
            await eventBus.emit('asset:cache-hit', {
              sceneId: scene.id, providerId: provider.id, candidateCount: candidates.length,
              hitAt: new Date().toISOString(),
            });
          } else {
            if (cacheable) report.cacheMisses += 1;
            try {
              candidates = await provider.search(query, { signal: options?.signal, limit: 6 });
              if (cacheable) cache.set(provider.id, query, candidates);
            } catch (error) {
              if (isAbortError(error)) throw error;
              fallbackCount += 1;
              await eventBus.emit('asset:provider-failed', {
                sceneId: scene.id, providerId: provider.id,
                message: error instanceof Error ? error.message : 'Asset provider failed',
                failedAt: new Date().toISOString(),
              });
              continue;
            }
          }

          candidateCount += candidates.length;
          const ranking = rankAssetCandidates(candidates, query, usedFingerprints);
          report.duplicateCandidatesRejected += ranking.duplicatesRejected;
          if (!ranking.ranked.length) {
            fallbackCount += 1;
            continue;
          }

          selected = ranking.ranked[0];
          selectedProvider = provider.id;
          await eventBus.emit('asset:candidate-ranked', {
            sceneId: scene.id, providerId: provider.id, candidateId: selected.id,
            score: selected.score, rankedAt: new Date().toISOString(),
          });
          break;
        }

        const asset = selected ? toMediaAsset(selected, scene) : null;
        if (asset && selected) {
          assets.push(asset);
          scene.assetIds.push(asset.id);
          usedFingerprints.add(assetFingerprint(selected));
          report.resolvedCount += 1;
          report.providerUsage[selected.providerId] = (report.providerUsage[selected.providerId] ?? 0) + 1;
          await eventBus.emit('asset:resolved', {
            sceneId: scene.id, assetId: asset.id, providerId: selected.providerId,
            resolvedAt: new Date().toISOString(),
          });
        } else {
          report.unresolvedCount += 1;
          await eventBus.emit('asset:unresolved', {
            sceneId: scene.id, queries: query.queries, unresolvedAt: new Date().toISOString(),
          });
        }

        report.resolutions.push({
          sceneId: scene.id, query, asset, providerId: selectedProvider,
          candidateCount, fallbackCount, cacheHit,
        });
      }

      return { assets, report };
    },
    clearCache: () => cache.clear(),
  };
}

function createProviders(scenes: MediaScene[]): AssetProvider[] {
  const sceneMap = new Map(scenes.map((scene) => [scene.id, scene]));
  return [createSourceSceneProvider(sceneMap), createPexelsAssetProvider()]
    .sort((a, b) => b.priority - a.priority);
}

function toMediaAsset(candidate: AssetCandidate, scene: MediaScene): MediaAsset {
  return {
    id: createId('asset'),
    type: candidate.type,
    source: candidate.source,
    durationMs: candidate.durationMs,
    mimeType: candidate.mimeType,
    metadata: {
      ...candidate.metadata,
      sceneId: scene.id,
      providerId: candidate.providerId,
      providerAssetId: candidate.id,
      previewSource: candidate.previewSource ?? null,
      width: candidate.width ?? null,
      height: candidate.height ?? null,
      title: candidate.title ?? null,
      attribution: candidate.attribution ?? null,
      license: candidate.license ?? null,
    },
  };
}

function createId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Asset resolution cancelled', 'AbortError');
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
