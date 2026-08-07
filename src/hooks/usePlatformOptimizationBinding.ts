import { useEffect, useRef } from 'react';
import { createManifestRevisionId } from '@/core/editing/editPlanCompiler';
import { getPlatformProfile } from '@/core/platform-optimization';
import { useMediaStore } from '@/store/mediaStore';
import { usePlatformOptimizationStore } from '@/store/platformOptimizationStore';

export function usePlatformOptimizationBinding(): void {
  const manifest = useMediaStore((state) => state.manifest);
  const selectedPlatform = usePlatformOptimizationStore((state) => state.selectedPlatform);
  const currentPlan = usePlatformOptimizationStore((state) => state.currentPlan);
  const invalidate = usePlatformOptimizationStore((state) => state.invalidateCurrentBinding);
  const binding = manifest ? `${manifest.projectId}:${createManifestRevisionId(manifest)}:${selectedPlatform}:${getPlatformProfile(selectedPlatform).version}` : `none:${selectedPlatform}`;
  const previous = useRef(binding);
  useEffect(() => {
    if (previous.current !== binding) { previous.current = binding; invalidate('Source manifest changed. Run platform analysis again.'); }
    if (currentPlan && (currentPlan.projectId !== manifest?.projectId || currentPlan.sourceManifestFingerprint !== (manifest ? createManifestRevisionId(manifest) : null) || currentPlan.platformId !== selectedPlatform || currentPlan.profile.version !== getPlatformProfile(selectedPlatform).version)) invalidate('Source manifest or platform profile changed. Run analysis again.');
  }, [binding, currentPlan, invalidate, manifest, selectedPlatform]);
}
