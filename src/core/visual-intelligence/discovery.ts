import type { SceneVisualBinding, SceneVisualBrief, VisualConceptCategory, VisualMediaPreference, VisualQueryPlan } from './types';

export const MAX_DISCOVERY_CONCEPTS = 4;
export const MAX_DISCOVERY_RESULTS_PER_QUERY = 3;
export const MAX_DISCOVERY_SHORTLIST = 8;

export type VisualDiscoveryProviderId = 'pexels';
export type VisualDiscoveryOrientation = 'portrait' | 'landscape' | 'square' | 'unknown';
export type VisualRankExplanation =
  | 'strong-query-match' | 'cross-query-match' | 'vertical-fit' | 'preferred-media'
  | 'duration-fit' | 'low-resolution-penalty' | 'diversity-boost' | 'repeated-visual-penalty';

export interface VisualDiscoveryCandidate {
  readonly candidateId: string;
  readonly provider: VisualDiscoveryProviderId;
  readonly providerMediaIdentity: string;
  readonly mediaType: Exclude<VisualMediaPreference, 'either'>;
  readonly orientation: VisualDiscoveryOrientation;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  /** Bounded provider metadata; never a provider URL or legal assertion. */
  readonly descriptor?: string;
  readonly conceptCategories: readonly VisualConceptCategory[];
  readonly conceptPriorities: readonly number[];
  readonly providerRanks: readonly number[];
  readonly sourcePolicy: { readonly provider: VisualDiscoveryProviderId; readonly sourceClass: 'provider-catalog'; };
}

export interface RankedVisualDiscoveryCandidate extends VisualDiscoveryCandidate {
  readonly relevanceScore: number;
  readonly qualityFitScore: number;
  readonly diversityScore: number;
  readonly crossSceneNoveltyScore: number;
  readonly finalScore: number;
  readonly explanations: readonly VisualRankExplanation[];
}

export interface VisualDiscoveryShortlist {
  readonly sceneBinding: SceneVisualBinding;
  readonly briefFingerprint: string;
  readonly status: 'ready' | 'partial' | 'empty';
  readonly candidates: readonly RankedVisualDiscoveryCandidate[];
  readonly queryCount: number;
  readonly failedQueryCount: number;
}

export interface VisualDiscoveryProvider {
  readonly id: VisualDiscoveryProviderId;
  readonly capabilities: ReadonlySet<Exclude<VisualMediaPreference, 'either'>>;
  search(input: { readonly query: string; readonly mediaType: Exclude<VisualMediaPreference, 'either'>; readonly limit: number; readonly signal?: AbortSignal }): Promise<readonly VisualDiscoveryCandidate[]>;
}

export interface VisualDiscoverySearchInput {
  readonly brief: SceneVisualBrief;
  readonly queryPlan: VisualQueryPlan;
  readonly provider: VisualDiscoveryProvider;
  readonly adjacentShortlists?: readonly VisualDiscoveryShortlist[];
  readonly signal?: AbortSignal;
}

const WEIGHTS = Object.freeze({ relevance: 1, quality: 1, diversity: 1, novelty: 1 });

/** One scene action: first four concepts, each at most one image and one video request. */
export async function discoverVisualCandidates(input: VisualDiscoverySearchInput): Promise<VisualDiscoveryShortlist> {
  const concepts = input.queryPlan.concepts.slice(0, MAX_DISCOVERY_CONCEPTS);
  const tasks = concepts.flatMap((concept) => targetTypes(concept.targetMedia).map((mediaType) => ({ concept, mediaType })));
  const settled = await mapLimited(tasks, 2, async ({ concept, mediaType }) => {
    const candidates = await input.provider.search({ query: concept.query, mediaType, limit: MAX_DISCOVERY_RESULTS_PER_QUERY, signal: input.signal });
    return candidates.map((candidate, providerRank) => ({ candidate, concept, providerRank: providerRank + 1 }));
  });
  const successes = settled.filter((item): item is PromiseFulfilledResult<Array<{ candidate: VisualDiscoveryCandidate; concept: VisualQueryPlan['concepts'][number]; providerRank: number }>> => item.status === 'fulfilled').flatMap((item) => item.value);
  const deduplicated = deduplicate(successes);
  const ranked = rankVisualCandidates(deduplicated, input.brief, input.adjacentShortlists ?? []);
  return Object.freeze({
    sceneBinding: input.queryPlan.sceneBinding,
    briefFingerprint: input.queryPlan.briefFingerprint,
    status: ranked.length ? (successes.length === tasks.length ? 'ready' : 'partial') : 'empty',
    candidates: Object.freeze(ranked.slice(0, MAX_DISCOVERY_SHORTLIST)),
    queryCount: tasks.length,
    failedQueryCount: settled.filter((item) => item.status === 'rejected').length,
  });
}

export function rankVisualCandidates(
  candidates: readonly VisualDiscoveryCandidate[],
  brief: SceneVisualBrief,
  adjacentShortlists: readonly VisualDiscoveryShortlist[] = [],
): RankedVisualDiscoveryCandidate[] {
  const adjacentIds = new Set(adjacentShortlists.flatMap((list) => list.candidates.map((candidate) => candidate.candidateId)));
  const previousMedia = adjacentShortlists.at(-1)?.candidates[0]?.mediaType;
  return candidates.map((candidate) => {
    const explanations: VisualRankExplanation[] = [];
    const bestPriority = Math.min(...candidate.conceptPriorities);
    const relevance = 28 - ((bestPriority - 1) * 4) + Math.max(0, 10 - ((Math.min(...candidate.providerRanks) - 1) * 2)) + ((candidate.conceptPriorities.length - 1) * 8);
    explanations.push('strong-query-match');
    if (candidate.conceptPriorities.length > 1) explanations.push('cross-query-match');
    const preferred = brief.preferredMedia === 'either' ? 4 : candidate.mediaType === brief.preferredMedia ? 14 : -18;
    if (preferred > 0 && brief.preferredMedia !== 'either') explanations.push('preferred-media');
    let quality = candidate.orientation === 'portrait' ? 12 : candidate.orientation === 'landscape' ? -4 : 0;
    if (candidate.orientation === 'portrait') explanations.push('vertical-fit');
    if (candidate.mediaType === 'video' && candidate.durationMs !== undefined) {
      quality += candidate.durationMs >= 2_000 && candidate.durationMs <= 20_000 ? 6 : -3;
      explanations.push(candidate.durationMs >= 2_000 && candidate.durationMs <= 20_000 ? 'duration-fit' : 'low-resolution-penalty');
    }
    if (candidate.width !== undefined && candidate.height !== undefined && Math.max(candidate.width, candidate.height) < 1_080) { quality -= 8; explanations.push('low-resolution-penalty'); }
    const diversity = Math.min(10, (candidate.conceptCategories.length - 1) * 4) + (brief.preferredMedia === 'either' && candidate.mediaType !== previousMedia ? 3 : 0);
    if (diversity > 0) explanations.push('diversity-boost');
    const novelty = adjacentIds.has(candidate.candidateId) ? -35 : (previousMedia === candidate.mediaType && brief.noveltyConstraints.includes('vary-media-type') ? -5 : 0);
    if (novelty < 0) explanations.push('repeated-visual-penalty');
    return Object.freeze({ ...candidate, relevanceScore: relevance + preferred, qualityFitScore: quality, diversityScore: diversity, crossSceneNoveltyScore: novelty, finalScore: (relevance + preferred) * WEIGHTS.relevance + quality * WEIGHTS.quality + diversity * WEIGHTS.diversity + novelty * WEIGHTS.novelty, explanations: Object.freeze([...new Set(explanations)].sort()) });
  }).sort((left, right) => right.finalScore - left.finalScore || left.candidateId.localeCompare(right.candidateId));
}

function deduplicate(items: readonly { candidate: VisualDiscoveryCandidate; concept: VisualQueryPlan['concepts'][number]; providerRank: number }[]): VisualDiscoveryCandidate[] {
  const grouped = new Map<string, { candidate: VisualDiscoveryCandidate; concepts: VisualQueryPlan['concepts'][number][]; ranks: number[] }>();
  for (const item of items) {
    const key = item.candidate.provider + ':' + item.candidate.mediaType + ':' + item.candidate.providerMediaIdentity;
    const current = grouped.get(key) ?? { candidate: item.candidate, concepts: [], ranks: [] };
    current.concepts.push(item.concept); current.ranks.push(item.providerRank); grouped.set(key, current);
  }
  return [...grouped.values()].map(({ candidate, concepts, ranks }) => Object.freeze({ ...candidate, conceptCategories: Object.freeze([...new Set(concepts.map((concept) => concept.category))].sort()), conceptPriorities: Object.freeze([...new Set(concepts.map((concept) => concept.priority))].sort((a, b) => a - b)), providerRanks: Object.freeze([...new Set(ranks)].sort((a, b) => a - b)) })).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
}
function targetTypes(preference: VisualMediaPreference): Array<Exclude<VisualMediaPreference, 'either'>> { return preference === 'either' ? ['video', 'image'] : [preference]; }
async function mapLimited<T, R>(values: readonly T[], limit: number, mapper: (value: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = []; let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => { while (next < values.length) { const index = next++; try { results[index] = { status: 'fulfilled', value: await mapper(values[index]) }; } catch (reason) { results[index] = { status: 'rejected', reason }; } } }));
  return results;
}
