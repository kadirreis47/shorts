import { createDirectorEngine } from '@/core/director';
import { TypedEventBus, type ApplicationEventMap } from '@/core/events';
import { createMediaEngine, type AssetProviderEngine } from '@/core/media';
import { createDirectorInput } from '@/services/directorApplicationService';
const assets: AssetProviderEngine = { async resolve() { return { assets: [], report: { resolutions: [], providerUsage: {}, cacheHits: 0, cacheMisses: 0, resolvedCount: 0, unresolvedCount: 3, duplicateCandidatesRejected: 0 } }; }, clearCache() {} };
export async function editingFixture() { const media = createMediaEngine(new TypedEventBus<ApplicationEventMap>(), assets); const result = await media.buildProject({ projectId: 'editing-project', title: 'Editing', scenes: [
  { text: 'İlk 3 saniyede sonucu görün!', duration: 3, visual: 'Dynamic hook', keywords: ['sonuç', 'hızlı'] },
  { text: 'Bu uzun sahne birinci fikri anlatır. Ardından ikinci önemli fikri ayrıntılı açıklar.', duration: 8, visual: 'Explanation', keywords: ['açıklama'] },
  { text: 'Daha fazlası için takip et.', duration: 3, visual: 'CTA', keywords: ['takip'] },
] }); const manifest = result.manifest; const report = await createDirectorEngine().analyze(createDirectorInput(manifest)); return { manifest, project: result.project, assetResolution: result.assetResolution, validation: result.validation, renderReady: result.renderReady, report }; }
