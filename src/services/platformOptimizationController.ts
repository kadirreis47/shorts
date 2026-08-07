import { useMediaStore } from '@/store/mediaStore';
import { applicationContainer, dependencyTokens } from '@/core/di';
import { createManifestRevisionId } from '@/core/editing/editPlanCompiler';
import { usePlatformOptimizationStore } from '@/store/platformOptimizationStore';
import type { PlatformId, PlatformOptimizationPlan, PlatformOptimizationPreview, PlatformVariantSnapshot } from '@/core/platform-optimization';
import type { PlatformOptimizationApplicationService } from './platformOptimizationApplicationService';
let generation = 0; let abortController: AbortController | null = null;
function service(): PlatformOptimizationApplicationService { return applicationContainer.resolve(dependencyTokens.platformOptimizationApplicationService); }
export async function analyzeActivePlatform(platformId: PlatformId): Promise<PlatformOptimizationPlan> { const manifest = useMediaStore.getState().manifest; if (!manifest) throw new Error('Build the active media manifest before platform analysis.'); abortController?.abort(); const controller = new AbortController(); abortController = controller; const request = ++generation; try { const plan = await service().analyze({ manifest, platformId }, controller.signal); if (controller.signal.aborted || request !== generation) throw new Error('Platform analysis was superseded.'); return plan; } finally { if (abortController === controller) abortController = null; } }
export async function previewPlatform(plan: PlatformOptimizationPlan, approved: readonly string[] = []): Promise<PlatformOptimizationPreview> { const manifest = useMediaStore.getState().manifest; if (!manifest || createManifestRevisionId(manifest) !== plan.sourceManifestFingerprint) throw new Error('Platform plan is stale.'); return service().preview(plan, manifest, approved); }
export async function applyPlatform(plan: PlatformOptimizationPlan, preview: PlatformOptimizationPreview, approved: readonly string[] = []): Promise<PlatformVariantSnapshot> { const manifest = useMediaStore.getState().manifest; if (!manifest || createManifestRevisionId(manifest) !== plan.sourceManifestFingerprint) throw new Error('Platform preview is stale.'); const result = await service().apply(plan, preview, manifest, approved); return result.snapshot; }
export function undoPlatformVariant(): PlatformVariantSnapshot | null { return usePlatformOptimizationStore.getState().undo(); }
export function redoPlatformVariant(): PlatformVariantSnapshot | null { return usePlatformOptimizationStore.getState().redo(); }
