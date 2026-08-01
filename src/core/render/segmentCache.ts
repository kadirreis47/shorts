import type { IncrementalRenderPlan } from './incrementalTypes';
import { getFFmpegBridge } from './ffmpegBridge';

export interface SegmentCacheStats {
  entries: number;
  totalBytes: number;
  cacheDirectory: string | null;
}

export interface SegmentCacheResolution {
  sceneId: string;
  fingerprint: string;
  path: string;
  reusable: boolean;
}

export interface SegmentCache {
  resolve(plan: IncrementalRenderPlan): Promise<SegmentCacheResolution[]>;
  pathFor(fingerprint: string): Promise<string>;
  exists(fingerprint: string): Promise<boolean>;
  stats(): Promise<SegmentCacheStats>;
  clear(): Promise<void>;
}

export function createSegmentCache(): SegmentCache {
  return {
    async resolve(plan) {
      const bridge = requireBridge();
      const resolutions: SegmentCacheResolution[] = [];

      for (const item of plan.items) {
        const [path, exists] = await Promise.all([
          bridge.getSegmentPath(item.fingerprint),
          bridge.segmentExists(item.fingerprint),
        ]);

        resolutions.push({
          sceneId: item.sceneId,
          fingerprint: item.fingerprint,
          path,
          reusable: item.decision === 'reuse' && exists,
        });
      }

      return resolutions;
    },

    pathFor(fingerprint) {
      return requireBridge().getSegmentPath(fingerprint);
    },

    exists(fingerprint) {
      return requireBridge().segmentExists(fingerprint);
    },

    stats() {
      return requireBridge().getSegmentCacheStats();
    },

    clear() {
      return requireBridge().clearSegmentCache();
    },
  };
}

function requireBridge() {
  const bridge = getFFmpegBridge();
  if (!bridge) {
    throw new Error(
      'Segment cache yalnızca Electron modunda kullanılabilir.',
    );
  }
  return bridge;
}
