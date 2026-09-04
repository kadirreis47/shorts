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
  resourceReference: string;
  reusable: boolean;
}

export interface SegmentCache {
  resolve(plan: IncrementalRenderPlan): Promise<SegmentCacheResolution[]>;
  resourceFor(fingerprint: string): Promise<{ reference: string; exists: boolean }>;
  stats(): Promise<SegmentCacheStats>;
  clear(): Promise<void>;
}

export function createSegmentCache(): SegmentCache {
  return {
    async resolve(plan) {
      const bridge = requireBridge();
      const resolutions: SegmentCacheResolution[] = [];

      for (const item of plan.items) {
        const resource = await bridge.issueSegmentResource(item.fingerprint);

        resolutions.push({
          sceneId: item.sceneId,
          fingerprint: item.fingerprint,
          resourceReference: resource.reference,
          reusable: item.decision === 'reuse' && resource.exists,
        });
      }

      return resolutions;
    },

    resourceFor(fingerprint) {
      return requireBridge().issueSegmentResource(fingerprint);
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
